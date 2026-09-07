"""Unit tests for services.media_resolver.

The resolver is the bridge between server-relative media URLs in wire
content (which mobile-app / mini-program send after feat-020 upload) and
vLLM's OpenAI-compat image_url field, which needs absolute HTTP URLs or
inline data URLs. We fetch and inline async so vLLM doesn't have to
self-fetch during an in-flight chat completion (which deadlocks because
the FastAPI event loop is blocked).
"""
from __future__ import annotations

import base64

import pytest

from backend.app.schemas.agent import (
    ChatMessage,
    ImageUrlContentBlock,
    ImageUrlPayload,
    TextContentBlock,
)
from backend.app.services.media_resolver import (
    inline_chat_message_media,
    inline_image_urls,
)


@pytest.fixture(autouse=True)
def _backend_url(monkeypatch):
    """Pin backend_public_base_url so relative→absolute conversion is testable."""
    monkeypatch.setenv("BACKEND_PUBLIC_BASE_URL", "http://testserver:9000")


def _text_block(s: str) -> TextContentBlock:
    return TextContentBlock(type="text", text=s)


def _image_block(url: str, detail: str | None = None) -> ImageUrlContentBlock:
    return ImageUrlContentBlock(
        type="image_url",
        image_url=ImageUrlPayload(url=url, detail=detail),
    )


class _FakeResp:
    """Mimics the httpx.Response surface inline_image_urls uses."""

    def __init__(self, content: bytes, content_type: str = "image/jpeg"):
        self.status_code = 200
        self.headers = {"content-type": content_type}
        self.content = content

    def raise_for_status(self) -> None:
        return None


async def test_text_block_passes_through_unchanged():
    blocks = [_text_block("看这张图")]
    out = await inline_image_urls(blocks)
    assert out == blocks


async def test_external_url_passes_through_unchanged():
    """vLLM can fetch external CDN URLs directly — no need to inline."""
    blocks = [_image_block("https://cdn.example.com/img.jpg")]
    out = await inline_image_urls(blocks)
    assert out[0].image_url.url == "https://cdn.example.com/img.jpg"


async def test_relative_url_is_fetched_and_inlined(monkeypatch):
    captured: dict = {}

    async def fake_get(self, url: str):  # noqa: ARG001
        captured["url"] = url
        return _FakeResp(b"fake-jpeg-bytes", "image/jpeg")

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    blocks = [_image_block("/api/v1/media/abc123")]
    out = await inline_image_urls(blocks)

    expected_b64 = base64.b64encode(b"fake-jpeg-bytes").decode("ascii")
    expected = f"data:image/jpeg;base64,{expected_b64}"
    assert captured["url"] == "http://testserver:9000/api/v1/media/abc123"
    assert out[0].image_url.url == expected


async def test_same_origin_absolute_url_is_also_inlined(monkeypatch):
    """An absolute URL pointing at our own backend still needs inlining
    because vLLM's fetch would hit the same event loop we're blocking."""

    async def fake_get(self, url: str):  # noqa: ARG001
        return _FakeResp(b"\x89PNG\r\n\x1a\n", "image/png")

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    blocks = [_image_block("http://testserver:9000/api/v1/media/xyz")]
    out = await inline_image_urls(blocks)

    assert out[0].image_url.url.startswith("data:image/png;base64,")


async def test_fetch_failure_passes_block_through(monkeypatch):
    """If the fetch fails, return the original block — better to let
    vLLM try (and surface its own error) than 422 the user."""

    async def fake_get(self, url: str):  # noqa: ARG001
        raise RuntimeError("connection refused")

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    original = _image_block("/api/v1/media/unreachable")
    out = await inline_image_urls([original])

    assert out[0].image_url.url == "/api/v1/media/unreachable"


async def test_inline_chat_message_media_skips_str_content():
    """Plain text messages don't need media inlining."""
    msgs = [ChatMessage(role="user", content="hello")]
    out = await inline_chat_message_media(msgs)
    assert out == msgs
    assert out[0].content == "hello"


async def test_inline_chat_message_media_handles_mixed_blocks(monkeypatch):
    async def fake_get(self, url: str):  # noqa: ARG001
        return _FakeResp(b"x", "image/png")

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    msgs = [
        ChatMessage(
            role="user",
            content=[
                _text_block("看这张图"),
                _image_block("/api/v1/media/xyz"),
            ],
        )
    ]
    out = await inline_chat_message_media(msgs)

    assert isinstance(out[0].content, list)
    assert out[0].content[0].text == "看这张图"  # text passes through
    assert out[0].content[1].image_url.url.startswith("data:image/png;base64,")


async def test_inline_chat_message_media_does_not_mutate_input(monkeypatch):
    """The resolver must return a new list — input messages stay intact."""

    async def fake_get(self, url: str):  # noqa: ARG001
        return _FakeResp(b"x", "image/jpeg")

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    original_block = _image_block("/api/v1/media/q")
    msg = ChatMessage(role="user", content=[original_block])
    await inline_chat_message_media([msg])

    # Original unchanged — resolver returns a copy.
    assert msg.content[0].image_url.url == "/api/v1/media/q"
