"""Async resolver that inlines server-relative image URLs as data URLs.

Why this exists
---------------
vLLM needs to fetch image URLs itself when handling multi-modal chat
completions. Our chat-completion request is synchronous from FastAPI's
perspective — it blocks the event loop until vLLM finishes streaming the
full reply. If we hand vLLM a server-relative URL like
``/api/v1/media/{id}``, vLLM issues an HTTP fetch against our own backend,
but the loop is blocked so the GET handler can't run → deadlock (observed
during Phase 0 vLLM-on e2e: vLLM logs ``HTTP fetch failed ... timeout=5s,
20s, 80s`` before erroring out, and the client times out at 60s).

The fix is to fetch the bytes ourselves in an async context, then inline
as ``data:image/...;base64,...`` so vLLM doesn't need to do any further
HTTP work. External URLs (different host) are returned unchanged —
vLLM can fetch those directly because they're not on our event loop.
"""
from __future__ import annotations

import base64
import logging

import httpx

from backend.app.core.config import get_settings
from backend.app.schemas.agent import (
    ChatMessage,
    ImageUrlContentBlock,
    ImageUrlPayload,
)


logger = logging.getLogger(__name__)


async def _inline_one_url(url: str, base: str) -> str | None:
    """Fetch a server-relative or same-origin absolute URL and base64-inline it.

    Returns ``None`` if the URL is external (different origin) or the fetch
    fails. Callers pass the original block through in those cases — better
    to let vLLM try (and fail cleanly) than 422 the user.
    """
    if url.startswith(("http://", "https://")):
        if not url.startswith(base):
            return None  # external — vLLM can fetch directly
        fetch_url = url
    elif url.startswith("/"):
        fetch_url = base + url
    else:
        return None  # unknown scheme — leave alone

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(fetch_url)
            resp.raise_for_status()
            ctype_raw = resp.headers.get("content-type", "image/jpeg")
            ctype = ctype_raw.split(";", 1)[0].strip() or "image/jpeg"
            b64 = base64.b64encode(resp.content).decode("ascii")
        return f"data:{ctype};base64,{b64}"
    except Exception as exc:  # noqa: BLE001 — best-effort resolver
        logger.warning(
            "media_resolver: fetch %s failed (%s); passing through", fetch_url, exc
        )
        return None


async def inline_image_urls(blocks: list) -> list:
    """Async-fetch server-relative image_url blocks and inline as data URLs.

    Text blocks pass through unchanged. External image URLs (different
    origin) also pass through — vLLM can fetch those directly. On fetch
    failure the original block is preserved (best-effort).
    """
    settings = get_settings()
    base = settings.backend_public_base_url.rstrip("/")
    out: list = []
    for b in blocks:
        # discriminator dispatch — TextContentBlock has no image_url attr
        if not isinstance(b, ImageUrlContentBlock):
            out.append(b)
            continue
        data_url = await _inline_one_url(b.image_url.url, base)
        if data_url is None:
            out.append(b)
        else:
            out.append(b.model_copy(update={"image_url": ImageUrlPayload(url=data_url)}))
    return out


async def inline_chat_message_media(messages: list[ChatMessage]) -> list[ChatMessage]:
    """For each message with list content, inline server-relative media URLs.

    str-content messages pass through unchanged. Returns a new list of
    ChatMessage instances (input not mutated) so the caller can pass the
    resolved copy to the agent without losing the original wire shape.
    """
    out: list[ChatMessage] = []
    for m in messages:
        if isinstance(m.content, str):
            out.append(m)
            continue
        new_blocks = await inline_image_urls(m.content)
        out.append(m.model_copy(update={"content": new_blocks}))
    return out
