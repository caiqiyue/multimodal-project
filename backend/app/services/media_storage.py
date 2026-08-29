"""Media storage helpers (feat-020).

Local-disk storage for V1. No external object-store dependency.

Layout:
    {data_root}/{user_id}/{media_id}{ext}

Design notes (see NEXT_SESSION.md §3.5):
- File name uses uuid4().hex — 32 random chars, unguessable, collision-safe.
- Path is per-user so a future admin tool can scope listings; for V1 we
  scan all user dirs on GET (N is tiny — every user has ~10 files max).
- Image width/height are extracted inline via Pillow because we already
  have the bytes in memory (size cap is enforced before write). For videos
  we skip metadata probing — V1 does not shell out to ffprobe.
"""

from __future__ import annotations

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError


logger = logging.getLogger(__name__)


# Limits (single source of truth — also referenced by tests).
MAX_IMAGE_BYTES = 10 * 1024 * 1024     # 10 MB
MAX_VIDEO_BYTES = 50 * 1024 * 1024     # 50 MB

# Mime whitelist. Single source of truth; tests import these names too.
IMAGE_MIMES: frozenset[str] = frozenset({"image/jpeg", "image/png", "image/webp"})
VIDEO_MIMES: frozenset[str] = frozenset({"video/mp4"})
ALL_MIMES: frozenset[str] = IMAGE_MIMES | VIDEO_MIMES

MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
}

# Chunk size for streaming reads off the wire.
READ_CHUNK_BYTES = 64 * 1024


@dataclass(frozen=True)
class StoredMedia:
    """Result of a successful write.

    Immutable so callers cannot accidentally re-target the disk location.
    """

    media_id: str
    absolute_path: Path
    kind: str           # 'image' or 'video'
    size_bytes: int
    width: int | None
    height: int | None
    duration_seconds: float | None


def classify_mime(mime: str | None) -> str:
    """Return 'image' or 'video' or raise HTTPException(415)."""
    if mime in IMAGE_MIMES:
        return "image"
    if mime in VIDEO_MIMES:
        return "video"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=f"unsupported content-type: {mime!r} (allowed: jpeg/png/webp/mp4)",
    )


def _size_cap_for(kind: str) -> int:
    return MAX_IMAGE_BYTES if kind == "image" else MAX_VIDEO_BYTES


async def save_upload(
    upload: UploadFile,
    user_id: str,
    data_root: Path,
) -> StoredMedia:
    """Read the upload, validate size + (for images) format, write to disk.

    Raises HTTPException(400/413/415) on validation failure. The bytes are
    read fully into memory (max 50 MB) before write so we can probe image
    dimensions via Pillow and so size enforcement is atomic. For V1 this
    is simpler and safer than streaming-to-temp + rename.
    """
    kind = classify_mime(upload.content_type)
    cap = _size_cap_for(kind)

    total = 0
    chunks: list[bytes] = []
    while True:
        chunk = await upload.read(READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > cap:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"file too large ({kind} max {cap // (1024 * 1024)} MB)",
            )
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="empty file",
        )

    body = b"".join(chunks)

    width: int | None = None
    height: int | None = None
    if kind == "image":
        try:
            with Image.open(io.BytesIO(body)) as img:
                width, height = img.size
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            logger.info("media rejected: not a valid image (%s)", exc)
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"file is not a valid image (mime: {upload.content_type})",
            ) from exc

    media_id = uuid.uuid4().hex
    ext = MIME_TO_EXT[upload.content_type or ""]
    user_dir = data_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    final_path = user_dir / f"{media_id}{ext}"
    final_path.write_bytes(body)

    logger.info(
        "media saved user=%s id=%s kind=%s size=%d path=%s",
        user_id, media_id, kind, total, final_path,
    )

    return StoredMedia(
        media_id=media_id,
        absolute_path=final_path,
        kind=kind,
        size_bytes=total,
        width=width,
        height=height,
        duration_seconds=None,
    )


def find_media_file(media_id: str, data_root: Path) -> Path | None:
    """Locate a stored file by id, scanning per-user dirs.

    Returns None if not found. Caller decides whether 404 is appropriate.
    Path traversal is blocked by `is_safe_media_id`.
    """
    if not is_safe_media_id(media_id) or not data_root.is_dir():
        return None
    for user_dir in data_root.iterdir():
        if not user_dir.is_dir():
            continue
        # Media_id is uuid4 hex (32 chars) — name match is exact.
        for path in user_dir.glob(f"{media_id}.*"):
            if path.is_file():
                return path
    return None


def is_safe_media_id(media_id: str) -> bool:
    """Reject path traversal and non-uuid chars."""
    if not media_id or len(media_id) > 64:
        return False
    return all(c.isalnum() or c == "-" for c in media_id)


# Map file extension -> content-type for FileResponse.
EXT_TO_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
}
