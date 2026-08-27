"""POST /api/v1/agent/invoke — synchronous single-shot chat against the local vLLM.

V1 (feat-017):
- Stateless: each call ships the full conversation history, the Agent returns
  the full history + a `reply` field with the assistant's last message.
- Synchronous: the response is sent only after vLLM finishes the whole turn.
  Streaming lands in feat-021 (WebSocket + chat-protocol SSE events).
- No tools / no memory / no system prompt injection. Those come with feat-018
  (tool calling) and feat-019+ (persistence + system prompt per user).

Reference: docs/项目总执行计划.md §21, feature_list.json feat-017 + feat-018.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from backend.app.agent.graph import get_agent
from backend.app.schemas.agent import (
    AgentInvokeRequest,
    AgentInvokeResponse,
    ChatMessage,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/agent", tags=["agent"])


def _to_langchain(messages: list[ChatMessage]) -> list:
    """Coerce wire-format ChatMessage list to LangChain message objects."""
    out: list = []
    for m in messages:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=m.content))
        else:  # "system" — already validated by the regex in ChatMessage
            out.append(SystemMessage(content=m.content))
    return out


def _from_langchain(messages: list) -> list[ChatMessage]:
    """Coerce LangChain messages back to wire-format ChatMessage.

    Skips messages that don't fit the V1 chat shape:
    - `ToolMessage` — the result of a tool invocation, not a chat turn.
    - `AIMessage` with empty content + `tool_calls` — the model's "I want to
      call a tool" intermediate; the actual final answer follows in a later
      AIMessage.

    If we forwarded these, the Pydantic `min_length=1` constraint on
    `ChatMessage.content` would 422 (and there's no chat role for "tool").
    """
    out: list[ChatMessage] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            role, content = "user", m.content
        elif isinstance(m, AIMessage):
            # Drop intermediate tool-call AIMessages (content="" + tool_calls=[...]).
            if getattr(m, "tool_calls", None) and not (isinstance(m.content, str) and m.content):
                continue
            role, content = "assistant", m.content
        elif isinstance(m, SystemMessage):
            role, content = "system", m.content
        elif isinstance(m, ToolMessage):
            # Tool result — not part of the chat transcript the client sees.
            continue
        else:
            # Unknown message type — skip rather than coerce to a misleading role.
            continue
        if not isinstance(content, str):
            content = str(content)
        if not content:  # belt-and-braces — should already be filtered above
            continue
        out.append(ChatMessage(role=role, content=content))
    return out


@router.post("/invoke", response_model=AgentInvokeResponse)
async def invoke(body: AgentInvokeRequest) -> AgentInvokeResponse:
    """Run a single chat completion against the local Qwen3-VL via LangGraph + vLLM."""
    lc_messages = _to_langchain(body.messages)
    agent = get_agent()

    try:
        result = agent.invoke({"messages": lc_messages})
    except Exception as exc:  # noqa: BLE001 — surface as 502 so clients can retry
        logger.exception("Agent invoke failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"vLLM backend error: {exc}",
        ) from exc

    final_messages = _from_langchain(result["messages"])
    last = final_messages[-1]
    if last.role != "assistant":
        # Defensive: the graph always ends with an AIMessage today, but if the
        # graph grows (tool nodes etc.) we want to fail loudly rather than
        # silently returning a user message as the "reply".
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="agent did not produce an assistant turn",
        )

    return AgentInvokeResponse(messages=final_messages, reply=last.content)