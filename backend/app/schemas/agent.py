"""Pydantic schemas for /api/v1/agent/invoke.

Kept deliberately small and decoupled from any LangChain / LangGraph types so
the wire contract is stable even if the agent framework changes under us.

V2 (feat-022 + feat-020): `ChatMessage.content` accepts either plain text
(legacy) or a list of `ContentBlock`s (text + image_url). The discriminated
union keeps the wire format aligned with packages/api-contract/src/chat.ts
`ContentBlockSchema`.

V3 (Session 035): adds `video_url` blocks. Qwen3-VL serves video via
`--limit-mm-per-prompt {"image": 2, "video": 1}`; vLLM accepts the
non-standard `{"type": "video_url", "video_url": {"url": "..."}}` shape
as a video part. We model it identically to image_url but with a separate
type discriminator so the wire contract stays explicit.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
)


# ===== Content blocks (discriminated union on `type`) =====


class TextContentBlock(BaseModel):
    """A plain-text fragment inside a multi-modal message."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: Annotated[str, StringConstraints(min_length=1, max_length=32_000)]


class ImageUrlPayload(BaseModel):
    """Inner `image_url` object — mirrors the OpenAI spec.

    `url` must be an absolute http(s) URL. We accept server-relative paths
    (`/api/v1/media/{id}`) too — vLLM resolves them through its base URL
    when fetching. `detail` matches OpenAI's options and is forwarded
    verbatim.
    """

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, description="Absolute URL or server-relative path")
    detail: Literal["low", "high", "auto"] | None = None


class ImageUrlContentBlock(BaseModel):
    """A reference to an image by URL."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["image_url"]
    image_url: ImageUrlPayload


class VideoUrlPayload(BaseModel):
    """Inner `video_url` object — mirrors OpenAI's spec (which itself mirrors
    vLLM's `chat.completions` API for multi-modal messages).

    `url` may be absolute http(s) or server-relative (vLLM resolves via its
    base URL). vLLM's `--limit-mm-per-prompt {"image": 2, "video": 1}`
    governs how many of each the model accepts per turn.
    """

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, description="Absolute URL or server-relative path to a video file (e.g. mp4)")


class VideoUrlContentBlock(BaseModel):
    """A reference to a video by URL."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["video_url"]
    video_url: VideoUrlPayload


# Use a true discriminated union so Pydantic dispatches on the `type` field.
ContentBlock = Annotated[
    Union[TextContentBlock, ImageUrlContentBlock, VideoUrlContentBlock],
    Field(discriminator="type"),
]


# ===== Messages =====


class ChatMessage(BaseModel):
    """One turn in a conversation.

    `content` is either:
      - a non-empty string (legacy V1 path; plain text)
      - a list of ContentBlocks (V2 path; multi-modal — text + image_url + video_url)

    Per-shape constraints:
      - str: min_length=1, max_length=32000 (matches the V1 cap)
      - list: 1..MAX_BLOCKS_PER_MESSAGE (validated in _to_langchain since
        Pydantic's `Union` over Union doesn't easily express length bounds
        on the list branch)

    Hard rejection at the schema layer:
      - extra fields → 422 (extra="forbid")
      - empty list / empty string → 422
      - unknown block type → 422 (discriminated union dispatch)
    """

    model_config = ConfigDict(extra="forbid")

    role: str = Field(pattern="^(user|assistant|system)$")
    content: Union[
        Annotated[str, StringConstraints(min_length=1, max_length=32_000)],
        list[ContentBlock],
    ]


class AgentInvokeRequest(BaseModel):
    """POST /api/v1/agent/invoke body — full conversation history (stateless)."""

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(
        min_length=1,
        max_length=64,
        description="Conversation history in chronological order.",
    )


class AgentInvokeResponse(BaseModel):
    """POST /api/v1/agent/invoke response.

    `messages` is the full conversation including the assistant's reply.
    `reply` is a convenience copy of the LAST assistant message's content
    coerced to string (V1 models return plain text; V2+ will preserve block
    shape on assistant messages).
    """

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage]
    reply: str = Field(min_length=1)


# ===== Wire-shape ↔ LangChain coercion helpers (shared by /agent/invoke + /ws/chat) =====


# Hard cap on blocks per message — vLLM Qwen3-VL is well-behaved up to 16.
# Anything above this is almost certainly a misuse. Centralised here so
# the same constant governs both the sync /agent/invoke and the WS /ws/chat
# streaming endpoints (extracted from api/agent.py in Session 029 — without
# it, ws_chat.py was passing Pydantic ContentBlock objects straight to
# LangChain HumanMessage, which rejects non-dict items).
MAX_BLOCKS_PER_MESSAGE = 16


class ContentShapeError(ValueError):
    """Raised when a ContentBlock list fails structural validation."""


def blocks_to_lc_content(blocks: list) -> list[dict[str, Any]]:
    """Convert our Pydantic ContentBlock list to the dict shape LangChain /
    langchain-openai pass to vLLM's OpenAI-compat endpoint.

    Output shape (per OpenAI spec for multi-modal chat completions):
        [
          {"type": "text",      "text": "..."},
          {"type": "image_url", "image_url": {"url": "...", "detail": "..."}},
          {"type": "video_url", "video_url": {"url": "..."}},
        ]

    Raises ``ContentShapeError`` if block count is out of range. Callers
    (HTTP router) wrap the error in a 422; the WS router wraps it in an
    ``error`` wire event.
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
        elif b.type == "video_url":
            out.append({
                "type": "video_url",
                "video_url": b.video_url.model_dump(exclude_none=True),  # type: ignore[attr-defined]
            })
        else:  # defensive — discriminator should prevent this branch
            raise ContentShapeError(f"unsupported content block type: {b.type}")
    return out
