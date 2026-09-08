"""LangGraph Agent that wraps the local vLLM as an OpenAI-compatible chat model.

V1 scope (feat-017 + feat-018):
- Two-node graph with conditional routing: START → call_llm → (tools?) → call_llm → ... → END.
- Tools: `calculator` + `server_info` (see `tools.py`). Always bound to the LLM;
  clients cannot opt out in V1 — tools are part of the agent's surface.
- Stateless: each request ships the full conversation history. No checkpointer,
  no thread_id, no memory. (Persistence lands with feat-019 Postgres + /conversations.)
- Synchronous response. (Streaming comes with feat-021 WebSocket.)

Routing logic:
- After `call_llm` returns, if the assistant message has `tool_calls`, route to
  `tools`; otherwise end the graph.
- After `tools` runs, route back to `call_llm` so the model can read the tool
  output and produce a final answer.
- Loop is bounded by langgraph's `recursion_limit` (default 25) — far above any
  realistic tool-use trace.

Reference: docs/项目总执行计划.md §21 + §22.
"""
from __future__ import annotations

import logging
from typing import Annotated, Literal

from langchain_core.messages import AIMessage, BaseMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from backend.app.agent.tools import ALL_TOOLS
from backend.app.core.config import get_settings


logger = logging.getLogger(__name__)


class AgentState(TypedDict, total=False):
    """Conversation state passed between graph nodes.

    `messages` carries the standard langgraph `add_messages` reducer — when a
    node returns `{"messages": [new_msg]}`, langgraph appends it to the
    existing list instead of replacing the whole list. Without the reducer
    the assistant's reply would overwrite the user's input and `result["messages"]`
    would only contain the assistant turn.
    """

    messages: Annotated[list[BaseMessage], add_messages]


def _build_llm() -> ChatOpenAI:
    """Construct a ChatOpenAI client pointing at the local vLLM OpenAI-compat server.

    vLLM does not validate the api_key, so `EMPTY` is fine. The model name must
    match the `--served-model-name` we launched vLLM with (default `vlm-base`).
    The tools are bound here so every call carries them in the request payload;
    vLLM requires `--enable-auto-tool-choice` + `--tool-call-parser hermes` to
    interpret the tool_call tokens the model emits (see `src/inference/start_vllm.sh`).
    """
    settings = get_settings()
    base = ChatOpenAI(
        model=settings.vllm_model,
        base_url=settings.vllm_base_url,
        api_key=settings.vllm_api_key,
        temperature=settings.vllm_temperature,
        timeout=settings.vllm_timeout_seconds,
    )
    return base.bind_tools(ALL_TOOLS)


def _call_llm(state: AgentState) -> dict[str, list[BaseMessage]]:
    """LLM node — takes the conversation so far, returns the assistant turn.

    If the model decides to call a tool, the returned `AIMessage` will have
    `tool_calls` populated. The conditional edge below routes to `tools` then.
    """
    llm = _build_llm()
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


def _should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """Conditional edge after `call_llm`.

    Inspects the last assistant message: if it has at least one `tool_call`,
    route to the `tools` node; otherwise return `END` to finish the graph.
    """
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools"
    return END


def build_graph():
    """Compile the V1 graph. Cheap to rebuild per request if needed."""
    graph = StateGraph(AgentState)

    graph.add_node("call_llm", _call_llm)
    graph.add_node("tools", ToolNode(ALL_TOOLS))

    graph.add_edge(START, "call_llm")
    graph.add_conditional_edges("call_llm", _should_continue)
    graph.add_edge("tools", "call_llm")

    return graph.compile()


_agent = None


def get_agent():
    """Lazily build the compiled graph on first call.

    Keeps `import backend.app.agent.graph` cheap (no vLLM round-trip at import
    time — important because conftest pulls in `backend.app.main` which pulls
    in every router, including this one, and pytest should not need vLLM up).
    """
    global _agent
    if _agent is None:
        _agent = build_graph()
        logger.info(
            "LangGraph Agent compiled (model=%s base_url=%s tools=%s)",
            get_settings().vllm_model,
            get_settings().vllm_base_url,
            [t.name for t in ALL_TOOLS],
        )
    return _agent


def reset_agent() -> None:
    """Drop the cached compiled graph. Tests use this between cases."""
    global _agent
    _agent = None
