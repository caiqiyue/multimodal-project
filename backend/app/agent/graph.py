"""LangGraph Agent that wraps the local vLLM as an OpenAI-compatible chat model.

V1 scope (feat-017):
- Single-node graph: START → call_llm → END.
- Stateless: each request ships the full conversation history. No checkpointer,
  no thread_id, no memory. (Persistence lands with feat-019 Postgres + /conversations.)
- No tool calling. (feat-018 adds calculator + server_info tools.)
- Synchronous response. (Streaming comes with feat-021 WebSocket.)

Reference: docs/项目总执行计划.md §21 + §22.
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from backend.app.core.config import get_settings


logger = logging.getLogger(__name__)


class AgentState(TypedDict, total=False):
    """Conversation state passed between graph nodes.

    V1 only carries `messages`. A future reducer (`add_messages` from langgraph)
    would let nodes append without overwriting — kept out of V1 to stay minimal.
    """

    messages: list[BaseMessage]


def _build_llm() -> ChatOpenAI:
    """Construct a ChatOpenAI client pointing at the local vLLM OpenAI-compat server.

    vLLM does not validate the api_key, so `EMPTY` is fine. The model name must
    match the `--served-model-name` we launched vLLM with (default `vlm-base`).
    """
    settings = get_settings()
    return ChatOpenAI(
        model=settings.vllm_model,
        base_url=settings.vllm_base_url,
        api_key=settings.vllm_api_key,
        temperature=settings.vllm_temperature,
        timeout=settings.vllm_timeout_seconds,
    )


def _call_llm(state: AgentState) -> dict[str, list[BaseMessage]]:
    """Single LLM node — takes the conversation so far, returns the assistant turn."""
    llm = _build_llm()
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


def build_graph():
    """Compile the V1 graph. Cheap to rebuild per request if needed."""
    graph = StateGraph(AgentState)
    graph.add_node("call_llm", _call_llm)
    graph.add_edge(START, "call_llm")
    graph.add_edge("call_llm", END)
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
            "LangGraph Agent compiled (model=%s base_url=%s)",
            get_settings().vllm_model,
            get_settings().vllm_base_url,
        )
    return _agent


def reset_agent() -> None:
    """Drop the cached compiled graph. Tests use this between cases."""
    global _agent
    _agent = None