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
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

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
    """Coerce LangChain messages back to wire-format ChatMessage."""
    out: list[ChatMessage] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            role = "user"
        elif isinstance(m, AIMessage):
            role = "assistant"
        else:  # SystemMessage or anything else
            role = "system"
        content = m.content if isinstance(m.content, str) else str(m.content)
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