"""WebSocket streaming chat endpoint (feat-021).

Mounts at /api/v1/ws/chat. Wraps the feat-017 + feat-018 LangGraph Agent
with `astream_events(version="v2")` to produce token-level + tool-call
streaming over a single persistent WebSocket connection.

V1 (public, no auth):
  1. Client opens WS at /api/v1/ws/chat (handshake → 101).
  2. Client sends one AgentInvokeRequest JSON payload per turn.
  3. Server streams ChatEvent-shaped JSON events until message.done or error.
  4. Connection stays open — client may send another payload after done/error.

Wire events (matches packages/chat-protocol/src/events.ts):
  message.start | message.delta | message.done | tool.call | tool.result | error
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import ValidationError

from backend.app.agent import get_agent
from backend.app.schemas.agent import (
    AgentInvokeRequest,
    ChatMessage,
    ContentShapeError,
    blocks_to_lc_content,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["ws-chat"])


def _envelope(conversation_id: str) -> dict[str, str | int]:
    """Populate the ChatEventBase envelope fields used by every wire event.

    V1: `conversation_id` is a UUID generated per WebSocket connection. Once
    feat-019 Postgres lands, this will be the persisted conversation id
    (the client should pass it in subsequent turns; until then each WS
    handshake starts a fresh "conversation").
    """
    return {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "created_at": int(time.time() * 1000),
    }


def _to_langchain(messages: list[ChatMessage]) -> list:
    """Coerce wire-format ChatMessage list to LangChain message objects.

    V1 path: `content: str` → HumanMessage(content=str).
    V2 path: `content: list[ContentBlock]` → HumanMessage(content=[dict, dict])
    (LangChain's HumanMessage rejects raw Pydantic objects — needs the
    OpenAI-spec dict shape. The conversion lives in
    `backend.app.schemas.agent.blocks_to_lc_content` so both this router
    and the sync /agent/invoke endpoint share the same coercion + the
    same 1..16 block cap.)

    On shape error we raise the structured ``ContentShapeError``; the
    caller wraps it as a wire ``error`` event so the client sees a
    well-formed terminal.
    """
    out: list = []
    for m in messages:
        if isinstance(m.content, str):
            lc_content = m.content
        else:
            # Raises ContentShapeError if block count is out of [1, 16];
            # caller emits a wire error event and the connection stays open.
            lc_content = blocks_to_lc_content(m.content)

        if m.role == "user":
            out.append(HumanMessage(content=lc_content))
        elif m.role == "assistant":
            out.append(AIMessage(content=lc_content))
        else:  # "system" — already validated by the regex in ChatMessage
            out.append(SystemMessage(content=lc_content))
    return out


async def _emit_error(
    ws: WebSocket, conversation_id: str, code: str, message: str
) -> None:
    """Send a structured error event. Best-effort — caller catches WebSocketDisconnect."""
    await ws.send_json(
        {
            **_envelope(conversation_id),
            "type": "error",
            "code": code,
            "message": message,
        }
    )


async def _stream_turn(
    ws: WebSocket,
    conversation_id: str,
    lc_messages: list,
) -> None:
    """Run one turn of the agent and stream events to the WebSocket.

    Event sequence (normal path):
        message.start → (message.delta* | tool.call | tool.result)* → message.done

    On agent exception, emits `error` and then `message.done` with
    finish_reason="error" so the client sees a well-formed terminal event.
    """
    agent = get_agent()
    message_id = str(uuid.uuid4())
    full_content = ""
    finish_reason = "stop"
    pending_tool_call_id: str | None = None

    # 1. message.start
    await ws.send_json(
        {
            **_envelope(conversation_id),
            "type": "message.start",
            "message_id": message_id,
            "role": "assistant",
        }
    )

    # 2. stream model + tool events
    try:
        async for event in agent.astream_events(
            {"messages": lc_messages}, version="v2"
        ):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                content = chunk.content
                if isinstance(content, str) and content:
                    full_content += content
                    await ws.send_json(
                        {
                            **_envelope(conversation_id),
                            "type": "message.delta",
                            "message_id": message_id,
                            "delta": content,
                        }
                    )
                elif isinstance(content, list):
                    # Multimodal chunks (V1: extract text parts only).
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            text = part.get("text", "")
                            if text:
                                full_content += text
                                await ws.send_json(
                                    {
                                        **_envelope(conversation_id),
                                        "type": "message.delta",
                                        "message_id": message_id,
                                        "delta": text,
                                    }
                                )

            elif kind == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event["data"].get("input", {})
                # LangChain's astream_events does not always expose tool_call_id
                # in the on_tool_start payload — generate a stable id and reuse
                # it for the matching on_tool_end so clients can correlate.
                pending_tool_call_id = str(uuid.uuid4())
                await ws.send_json(
                    {
                        **_envelope(conversation_id),
                        "type": "tool.call",
                        "name": tool_name,
                        "args": tool_input if isinstance(tool_input, dict) else {},
                        "tool_call_id": pending_tool_call_id,
                    }
                )

            elif kind == "on_tool_end":
                tool_name = event.get("name", "unknown")
                output = event["data"].get("output")
                content = str(output) if output is not None else ""
                tool_call_id = pending_tool_call_id or str(uuid.uuid4())
                await ws.send_json(
                    {
                        **_envelope(conversation_id),
                        "type": "tool.result",
                        "name": tool_name,
                        "content": content,
                        "tool_call_id": tool_call_id,
                    }
                )
                pending_tool_call_id = None
    except Exception as exc:  # noqa: BLE001 — surface as wire event so client can react
        logger.exception("Agent streaming failed: %s", exc)
        finish_reason = "error"
        await _emit_error(
            ws, conversation_id, "agent_error", f"agent streaming failed: {exc}"
        )

    # 3. message.done (always sent, even after agent_error, so client has a
    # well-formed terminal event for this turn).
    await ws.send_json(
        {
            **_envelope(conversation_id),
            "type": "message.done",
            "message_id": message_id,
            "finish_reason": finish_reason,
            "full_content": full_content,
        }
    )


@router.websocket("/ws/chat")
async def ws_chat(ws: WebSocket) -> None:
    """WebSocket streaming chat endpoint.

    Protocol:
      1. Client opens WS at /api/v1/ws/chat.
      2. Client sends one JSON payload per turn (AgentInvokeRequest shape):
         {"messages": [{"role": ..., "content": ...}, ...]}
      3. Server streams ChatEvent JSON events until message.done or error.
      4. Connection stays open — client can send another payload after done/error.

    V1 (no auth): any client may connect. feat-025 will add a bearer-token gate.

    Reference: docs/项目总执行计划.md §24, feature_list.json feat-021.
    """
    await ws.accept()
    conversation_id = str(uuid.uuid4())
    logger.info("WS chat connected conversation_id=%s", conversation_id)

    try:
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                logger.info("WS chat disconnected conversation_id=%s", conversation_id)
                return

            try:
                payload = AgentInvokeRequest.model_validate_json(raw)
            except ValidationError as exc:
                # Schema validation failed — emit error event and keep the
                # connection open so the client can retry with corrected input.
                await _emit_error(
                    ws, conversation_id, "invalid_request", str(exc)
                )
                continue
            except Exception as exc:  # noqa: BLE001 — malformed JSON, etc.
                await _emit_error(
                    ws, conversation_id, "invalid_json", str(exc)
                )
                continue

            lc_messages = _to_langchain(payload.messages)
            await _stream_turn(ws, conversation_id, lc_messages)
    except WebSocketDisconnect:
        logger.info("WS chat disconnected conversation_id=%s", conversation_id)
    except Exception as exc:  # noqa: BLE001 — last-resort guard
        logger.exception("WS chat fatal error conversation_id=%s: %s", conversation_id, exc)
        try:
            await _emit_error(ws, conversation_id, "internal_error", str(exc))
        except Exception:
            pass
