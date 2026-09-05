"""Tests for feat-027 Demo-mode echo agent.

Coverage:
- EchoAgent.invoke() returns a dict in the same shape as the real LangGraph
  agent ({"messages": [AIMessage(content=...)]}) so callers don't branch.
- EchoAgent.astream_events() yields an on_chat_model_stream event with the
  reply as a single chunk — matches the shape ws_chat.py's existing
  on_chat_model_stream handler consumes.
- _build_reply_text() handles both V1 str content (back-compat) and V2
  ContentBlock[] (text + image_url) — the schema widening landed in
  feat-026 (Session 028).
- Edge cases: no user message, only images, only text, multi-block.

Pure unit tests — no FastAPI client, no vLLM, no DB. The whole point of the
demo agent is to be runnable in environments where neither vLLM nor a
database is available (GPU tenant contention, demos, CI without GPU).
"""
from __future__ import annotations

import pytest

from backend.app.agent.echo_agent import EchoAgent, _build_reply_text
from backend.app.schemas.agent import (
    ChatMessage,
    ImageUrlContentBlock,
    ImageUrlPayload,
    TextContentBlock,
)


# ===== _build_reply_text: pure function coverage =====


def test_build_reply_text_text_only_string():
    """V1 path: content is plain string. Reply mentions the text."""
    msgs = [ChatMessage(role="user", content="hello")]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "hello" in reply
    assert reply.startswith("（")  # Chinese parens — confirmed Chinese output


def test_build_reply_text_text_only_array():
    """V2 path: content is list[ContentBlock] with a single text block."""
    msgs = [
        ChatMessage(
            role="user",
            content=[TextContentBlock(type="text", text="hello array")],
        )
    ]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "hello array" in reply


def test_build_reply_text_with_image_url():
    """V2 path: single image_url block. Reply mentions image count."""
    msgs = [
        ChatMessage(
            role="user",
            content=[
                TextContentBlock(type="text", text="看这张图"),
                ImageUrlContentBlock(
                    type="image_url",
                    image_url=ImageUrlPayload(url="http://x/y.jpg"),
                ),
            ],
        )
    ]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "1 张图片" in reply
    assert "看这张图" in reply  # text snippet also surfaced


def test_build_reply_text_only_images_no_text():
    """Multi-image message with no text block: reply surfaces count only."""
    msgs = [
        ChatMessage(
            role="user",
            content=[
                ImageUrlContentBlock(type="image_url", image_url=ImageUrlPayload(url="http://x/1.jpg")),
                ImageUrlContentBlock(type="image_url", image_url=ImageUrlPayload(url="http://x/2.jpg")),
                ImageUrlContentBlock(type="image_url", image_url=ImageUrlPayload(url="http://x/3.jpg")),
            ],
        )
    ]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "3 张图片" in reply


def test_build_reply_text_no_user_message():
    """All-system messages: surface a placeholder (defensive — request
    validation rejects empty messages, but a request with only system
    messages is still possible)."""
    msgs = [ChatMessage(role="system", content="system prompt only")]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    # No text/image content surfaced
    assert "张图片" not in reply


def test_build_reply_text_long_text_truncated():
    """Text > 100 chars is truncated (cap to keep demo reply readable)."""
    long_text = "a" * 200
    msgs = [ChatMessage(role="user", content=long_text)]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    # Should contain 100 'a's but not 200
    assert reply.count("a") == 100


def test_build_reply_text_picks_last_user_message():
    """Multi-turn history: only the last user message is echoed (matches
    real agent behaviour — the agent only responds to the latest user
    turn)."""
    msgs = [
        ChatMessage(role="user", content="first question"),
        ChatMessage(role="assistant", content="first answer"),
        ChatMessage(role="user", content="second question"),
    ]
    reply = _build_reply_text(msgs)
    assert "second question" in reply
    assert "first question" not in reply


# ===== Real-caller path: api/agent.py passes LangChain messages after _to_langchain =====


def test_build_reply_text_accepts_langchain_messages():
    """Real callers in api/agent.py + api/ws_chat.py convert ChatMessage
    → LangChain HumanMessage/AIMessage/SystemMessage via _to_langchain
    BEFORE calling agent.invoke(). Demo agent must accept the LangChain
    shape, not just Pydantic ChatMessage.

    LangChain messages have `.type` ('human'/'ai'/'system'), not `.role`.
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    msgs = [
        SystemMessage(content="system prompt"),
        HumanMessage(content="first user"),
        AIMessage(content="first ai"),
        HumanMessage(content="second user via langchain"),
    ]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "second user via langchain" in reply
    assert "first user" not in reply


def test_build_reply_text_langchain_multimodal_content():
    """LangChain multi-modal HumanMessage.content is a list of dicts
    (OpenAI spec shape) — not Pydantic ContentBlock instances. Demo
    agent must handle both dicts and objects.
    """
    from langchain_core.messages import HumanMessage
    msgs = [
        HumanMessage(content=[
            {"type": "text", "text": "langchain multi-modal"},
            {"type": "image_url", "image_url": {"url": "http://x/img.jpg"}},
            {"type": "image_url", "image_url": {"url": "http://x/img2.jpg"}},
        ])
    ]
    reply = _build_reply_text(msgs)
    assert "demo mode" in reply
    assert "2 张图片" in reply
    assert "langchain multi-modal" in reply


# ===== EchoAgent class: same interface as real LangGraph agent =====


def test_echo_agent_invoke_returns_dict_with_messages():
    """Real agent returns {"messages": [AIMessage(...)]} from .invoke().
    Demo agent must match so api/agent.py's _from_langchain() works
    unchanged."""
    agent = EchoAgent()
    msgs = [ChatMessage(role="user", content="hi")]
    result = agent.invoke({"messages": msgs})
    assert isinstance(result, dict)
    assert "messages" in result
    assert len(result["messages"]) == 1
    reply_msg = result["messages"][0]
    assert hasattr(reply_msg, "content")
    assert "demo mode" in reply_msg.content
    assert "hi" in reply_msg.content


def test_echo_agent_invoke_accepts_real_langchain_messages():
    """Real callers pass LangChain message objects (after _to_langchain).
    Demo agent must accept the heterogeneous list and find the last
    HumanMessage-equivalent role."""
    from langchain_core.messages import HumanMessage
    agent = EchoAgent()
    result = agent.invoke({"messages": [HumanMessage(content="hi via langchain")]})
    reply = result["messages"][0].content
    assert "hi via langchain" in reply
    assert "demo mode" in reply


@pytest.mark.asyncio
async def test_echo_agent_astream_events_yields_chat_model_stream():
    """ws_chat.py's _stream_turn() awaits agent.astream_events(...). Demo
    agent must yield at least one on_chat_model_stream event whose chunk
    has a .content attribute carrying the reply text."""
    import asyncio

    agent = EchoAgent()
    msgs = [ChatMessage(role="user", content="stream test")]

    events = []
    async for event in agent.astream_events({"messages": msgs}, version="v2"):
        events.append(event)

    assert len(events) >= 1
    chat_stream_events = [e for e in events if e["event"] == "on_chat_model_stream"]
    assert len(chat_stream_events) == 1

    chunk = chat_stream_events[0]["data"]["chunk"]
    assert hasattr(chunk, "content")
    assert "stream test" in chunk.content
    assert "demo mode" in chunk.content


def test_echo_agent_invoke_handles_content_block_list():
    """End-to-end: V2 multi-modal message through the class."""
    agent = EchoAgent()
    msgs = [
        ChatMessage(
            role="user",
            content=[
                TextContentBlock(type="text", text="what color"),
                ImageUrlContentBlock(
                    type="image_url",
                    image_url=ImageUrlPayload(url="http://x/red.jpg"),
                ),
            ],
        )
    ]
    reply = agent.invoke({"messages": msgs})["messages"][0].content
    assert "demo mode" in reply
    assert "1 张图片" in reply
    assert "what color" in reply


def test_echo_agent_invoke_empty_messages_list():
    """Defensive: empty messages list still returns a coherent reply."""
    agent = EchoAgent()
    result = agent.invoke({"messages": []})
    reply = result["messages"][0].content
    assert "demo mode" in reply
