"""Demo-mode echo agent — vLLM-off fallback (feat-027, Session 029).

Why this exists:
- vLLM Qwen3-VL is currently offline (GPU 1 A6000 busy with other tenants
  since 2026-08-31). The real LangGraph agent (graph.py) returns 502 errors
  when vLLM is unreachable.
- For demo / portfolio purposes we want the client UI to render *something*
  coherent instead of just an error event.
- Same wire shape as the real agent so clients don't need to know which
  mode is active.

Interface contract:
- `EchoAgent.invoke({"messages": [...]})` returns `{"messages": [AIMessage(content=reply)]}`
  — same dict shape as the real LangGraph agent, so `api/agent.py`'s
  `_from_langchain()` works unchanged.
- `EchoAgent.astream_events({"messages": [...]}, version="v2")` yields
  `on_chat_model_stream` events with an `AIMessageChunk` carrying the reply
  as a single chunk — same shape `api/ws_chat.py`'s existing handler
  consumes.

Mode selection: `backend.app.core.config.settings.agent_mode` (env var
`AGENT_MODE`, default `"demo"`). The dispatcher in
`backend/app/agent/__init__.py:get_agent()` reads the flag at call time so
ops can flip demo↔real without restarting code (only uvicorn workers pick
up new settings on reload).

Content handling (matches feat-026 + feat-022 wire):
- V1 path: `content: str` → echo first 100 chars.
- V2 path: `content: list[ContentBlock]` → count `image_url` blocks,
  concatenate text blocks' text (first 100 chars), describe the mix.
"""
from __future__ import annotations

import uuid
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage, AIMessageChunk

from backend.app.schemas.agent import ChatMessage


# === Constants ===

DEMO_PREFIX = "（demo mode，已收到您的"
TEXT_SNIPPET_CAP = 100  # how much user text to surface in the echo reply


# === Pure helper: build the reply text ===


def _get_role(m: Any) -> str | None:
    """Normalize role across Pydantic ChatMessage + LangChain message types.

    - Pydantic ChatMessage: ``.role`` is ``Literal['user','assistant','system']``.
    - LangChain messages: ``.type`` is ``'human' | 'ai' | 'system' | 'tool'``
      (HumanMessage / AIMessage / SystemMessage / ToolMessage).
    """
    role = getattr(m, "role", None)
    if role in ("user", "assistant", "system"):
        return role
    t = getattr(m, "type", None)
    if t == "human":
        return "user"
    if t == "ai":
        return "assistant"
    if t in ("system", "tool"):
        return t
    return None


def _extract_text_and_image_counts(content: Any) -> tuple[list[str], int]:
    """Pull text snippets + image_url count from either ChatMessage.content
    (str | list[ContentBlock]) or LangChain HumanMessage.content
    (str | list[dict]).

    Returns ``(text_parts, image_count)``.
    """
    if isinstance(content, str):
        return ([content] if content else []), 0
    if not isinstance(content, list):
        return [], 0

    text_parts: list[str] = []
    image_count = 0
    for item in content:
        # ContentBlock (Pydantic) — attribute access
        # dict (LangChain multi-modal) — key access
        if isinstance(item, dict):
            item_type = item.get("type")
            if item_type == "text":
                text_parts.append(item.get("text", ""))
            elif item_type == "image_url":
                image_count += 1
        else:
            item_type = getattr(item, "type", None)
            if item_type == "text":
                text_parts.append(getattr(item, "text", ""))
            elif item_type == "image_url":
                image_count += 1
            # unknown block type — skip (matches real LangChain tolerance)
    return text_parts, image_count


def _build_reply_text(messages: list[Any]) -> str:
    """Compose a short Chinese-language reply describing the last user turn.

    Picks the last user-role message (matches real-agent behaviour — only
    the latest user turn matters). Accepts either:
      - Pydantic ChatMessage (wire format — used by direct unit tests)
      - LangChain HumanMessage / AIMessage / SystemMessage (what the real
        routers pass after ``_to_langchain`` has coerced the wire format)

    Handles both V1 ``content: str`` and V2 ``content: list[ContentBlock]``
    shapes (feat-026 widening, Session 028).
    """
    last_user = next(
        (m for m in reversed(messages) if _get_role(m) == "user"), None
    )
    if last_user is None:
        return f"{DEMO_PREFIX}消息（无可回应的用户轮次））"

    text_parts, image_count = _extract_text_and_image_counts(last_user.content)
    text_summary = text_parts[0][:TEXT_SNIPPET_CAP] if text_parts else ""

    if image_count and text_summary:
        return f"{DEMO_PREFIX}{image_count} 张图片和文字：{text_summary}）"
    if image_count:
        return f"{DEMO_PREFIX}{image_count} 张图片）"
    if text_summary:
        return f"{DEMO_PREFIX}文字消息：{text_summary}）"
    return f"{DEMO_PREFIX}空内容消息）"


# === Class: same interface as the real LangGraph agent ===


class EchoAgent:
    """Demo-mode agent. Drop-in replacement for the compiled LangGraph
    agent returned by `graph.get_agent()` — same `invoke()` and
    `astream_events()` signatures, same return shapes.

    Mode dispatch is the caller's responsibility (see
    `backend/app/agent/__init__.py:get_agent()`).
    """

    def invoke(
        self, input: dict[str, Any], **kwargs: Any
    ) -> dict[str, list[AIMessage]]:
        """Sync one-shot: return `{"messages": [AIMessage(reply)]}`.

        The real LangGraph agent returns the same shape; api/agent.py's
        `_from_langchain(result["messages"])` works unchanged.
        """
        messages = input.get("messages", [])
        reply = _build_reply_text(messages)
        return {"messages": [AIMessage(content=reply)]}

    async def astream_events(
        self,
        input: dict[str, Any],
        version: str = "v2",
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """Async stream: yield one `on_chat_model_stream` event whose chunk
        carries the whole reply.

        `api/ws_chat.py`'s existing `_stream_turn` handler picks up
        `event["data"]["chunk"].content` and forwards it as a
        `message.delta` event — no change needed on the streaming router.
        """
        messages = input.get("messages", [])
        reply = _build_reply_text(messages)
        yield {
            "event": "on_chat_model_stream",
            "name": "EchoAgent",
            "run_id": str(uuid.uuid4()),
            "parent_ids": [],
            "tags": [],
            "metadata": {},
            "data": {"chunk": AIMessageChunk(content=reply)},
        }
