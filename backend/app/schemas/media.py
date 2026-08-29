"""Pydantic schemas matching @multimodal/api-contract (TypeScript frontend).

Mirrors packages/api-contract/src/media.ts so the mobile-app + mini-program
clients can deserialize backend responses without rewriting their TS types.
When you change a schema, update the TS source too.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MediaUploadResponse(BaseModel):
    """POST /api/v1/media/upload response.

    Returned by the multipart upload endpoint. `width` / `height` are filled
    for images (extracted via Pillow); `duration_seconds` is reserved for
    video and is currently always None (V1 does not probe video metadata —
    see NEXT_SESSION.md §3.5 design notes).
    """

    model_config = ConfigDict(extra="forbid")

    media_id: str = Field(description="Server-assigned opaque id (uuid4 hex)")
    url: str = Field(description="Public URL to fetch the file via GET /api/v1/media/{media_id}")
    media_type: str = Field(description="'image' or 'video'")
    size_bytes: int = Field(ge=0, description="Bytes written to disk")
    width: int | None = Field(default=None, ge=0, description="Pixel width (images only)")
    height: int | None = Field(default=None, ge=0, description="Pixel height (images only)")
    duration_seconds: float | None = Field(
        default=None,
        ge=0.0,
        description="Clip duration in seconds (videos; reserved for V2)",
    )
