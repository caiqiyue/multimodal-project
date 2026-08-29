"""POST /api/v1/media/upload + GET /api/v1/media/{media_id} (feat-020).

Multipart upload with size + mime validation. Files are stored on local disk
under media_data_root; the GET endpoint is unauthenticated because media_id
is a random uuid4 (unguessable).

Constraints (per CLAUDE.md §3.3):
    image <= 10 MB, video <= 50 MB / 30 s

Hard limits enforced here (also exported by backend.app.services.media_storage
for tests):
    mime whitelist = image/jpeg, image/png, image/webp, video/mp4
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from backend.app.api.deps import get_current_user
from backend.app.core.config import Settings, get_settings
from backend.app.core.users import UserRecord
from backend.app.schemas.media import MediaUploadResponse
from backend.app.services import media_storage


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/media", tags=["media"])


@router.post(
    "/upload",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_media(
    file: UploadFile = File(..., description="Image or video file"),
    current_user: UserRecord = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> MediaUploadResponse:
    """Accept a single multipart file. Returns metadata + public URL."""
    data_root = Path(settings.media_data_root)

    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="missing Content-Type header on file part",
        )

    stored = await media_storage.save_upload(
        upload=file,
        user_id=current_user.id,
        data_root=data_root,
    )

    public_url = f"{settings.media_public_base_url.rstrip('/')}/{stored.media_id}"
    return MediaUploadResponse(
        media_id=stored.media_id,
        url=public_url,
        media_type=stored.kind,
        size_bytes=stored.size_bytes,
        width=stored.width,
        height=stored.height,
        duration_seconds=stored.duration_seconds,
    )


@router.get("/{media_id}")
async def serve_media(
    media_id: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    """Serve an uploaded file by id. Public — IDs are random uuid4.

    No auth check: the id space is 128-bit random, so enumeration is infeasible.
    A future ticket can add per-user scoping + signed URLs.
    """
    if not media_storage.is_safe_media_id(media_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid media_id",
        )

    data_root = Path(settings.media_data_root)
    path = media_storage.find_media_file(media_id, data_root)
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="media not found",
        )

    content_type = media_storage.EXT_TO_MIME.get(
        path.suffix.lower(), "application/octet-stream"
    )
    return FileResponse(path, media_type=content_type)
