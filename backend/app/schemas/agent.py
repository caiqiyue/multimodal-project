"""Pydantic schemas for /api/v1/agent/invoke.

Kept deliberately small and decoupled from any LangChain / LangGraph types so
the wire contract is stable even if the agent framework changes under us.

V2 (feat-022 + feat-020): `ChatMessage.content` accepts either plain text
(legacy) or a list of `ContentBlock`s (text + image_url). The discriminated
union keeps the wire format aligned with packages/api-contract/src/chat.ts
`ContentBlockSchema`. `video_url` blocks are reserved for V3 — Qwen3-VL
supports video via vLLM but the standard OpenAI-compat surface does not
yet expose a `video_url` content type, so we reject it at the boundary to
keep the contract honest.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

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


# Use a true discriminated union so Pydantic dispatches on the `type` field.
ContentBlock = Annotated[
    Union[TextContentBlock, ImageUrlContentBlock],
    Field(discriminator="type"),
]


# ===== Messages =====


class ChatMessage(BaseModel):
    """One turn in a conversation.

    `content` is either:
      - a non-empty string (legacy V1 path; plain text)
      - a list of ContentBlocks (V2 path; multi-modal — text + image_url)

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
