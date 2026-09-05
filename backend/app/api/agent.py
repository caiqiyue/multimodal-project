"""POST /api/v1/agent/invoke — synchronous single-shot chat against the local vLLM.

V1 (feat-017):
- Stateless: each call ships the full conversation history, the Agent returns
  the full history + a `reply` field with the assistant's last message.
- Synchronous: the response is sent only after vLLM finishes the whole turn.
  Streaming lands in feat-021 (WebSocket + chat-protocol SSE events).
- No tools / no memory / no system prompt injection. Those come with feat-018
  (tool calling) and feat-019+ (persistence + system prompt per user).

V2 (feat-022):
- `messages[].content` accepts `str | list[ContentBlock]` (text + image_url).
  Image blocks reference a URL that vLLM can fetch — typically
  `/api/v1/media/{id}` (feat-020) or an external CDN. vLLM Qwen3-VL reads
  the image bytes itself; the backend does not need to download anything.

Reference: docs/项目总执行计划.md §21, feature_list.json feat-017 + feat-018 + feat-022.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from backend.app.agent import get_agent
from backend.app.schemas.agent import (
    AgentInvokeRequest,
    AgentInvokeResponse,
    ChatMessage,
    ContentBlock,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/agent", tags=["agent"])


# Hard cap on blocks per message — vLLM Qwen3-VL is well-behaved up to 16.
# Anything above this is almost certainly a misuse.
MAX_BLOCKS_PER_MESSAGE = 16


class ContentShapeError(ValueError):
    """Raised when a ContentBlock list fails structural validation."""


def _blocks_to_lc_content(blocks: list[ContentBlock]) -> list[dict[str, Any]]:
    """Convert our Pydantic ContentBlock list to the dict shape LangChain /
    langchain-openai pass to vLLM's OpenAI-compat endpoint.

    Output shape (per OpenAI spec for multi-modal chat completions):
        [
          {"type": "text",      "text": "..."},
          {"type": "image_url", "image_url": {"url": "...", "detail": "..."}},
        ]

    We keep the dict shape (rather than re-instantiating LangChain content
    block classes) so the wire payload is round-trippable and easy to log.
    """
    if not 1 <= len(blocks) <= MAX_BLOCKS_PER_MESSAGE:
        raise ContentShapeError(
            f"content block list must have 1..{MAX_BLOCKS_PER_MESSAGE} blocks "
            f"(got {len(blocks)})"
        )
    out: list[dict[str, Any]] = []
    for b in blocks:
        # Pydantic v2 discriminated union hands us the right subclass instance,
        # so we can switch on `type` (which is a Literal field, so .type is fine).
        if b.type == "text":
            out.append({"type": "text", "text": b.text})  # type: ignore[attr-defined]
        elif b.type == "image_url":
            # model_dump(exclude_none=True) keeps the wire payload clean —
            # `detail: None` would just add noise and the OpenAI spec marks
            # `detail` as optional (so omitting is the canonical shape).
            out.append({
                "type": "image_url",
                "image_url": b.image_url.model_dump(exclude_none=True),  # type: ignore[attr-defined]
            })
        else:  # defensive — discriminator should prevent this branch
            raise ContentShapeError(f"unsupported content block type: {b.type}")
    return out


def _to_langchain(messages: list[ChatMessage]) -> list:
    """Coerce wire-format ChatMessage list to LangChain message objects.

    Per-message `content` may be a plain string (V1 path, backward-compatible)
    or a list of ContentBlocks (V2 path, multi-modal). We pre-validate the
    block list bounds and raise HTTP 422-shaped errors via ContentShapeError,
    which the caller wraps.
    """
    out: list = []
    for m in messages:
        if isinstance(m.content, str):
            lc_content: Any = m.content
        else:
            try:
                lc_content = _blocks_to_lc_content(m.content)
            except ContentShapeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=str(exc),
                ) from exc

        if m.role == "user":
            out.append(HumanMessage(content=lc_content))
        elif m.role == "assistant":
            out.append(AIMessage(content=lc_content))
        else:  # "system" — already validated by the regex in ChatMessage
            out.append(SystemMessage(content=lc_content))
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