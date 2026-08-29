"""Tests for feat-020 media upload endpoint.

Coverage:
- POST /api/v1/media/upload
  - happy path: jpeg/png/webp return 201 + metadata + extract width/height
  - happy path: video/mp4 returns 201 (no width/height/duration yet)
  - 401 missing/invalid auth
  - 415 wrong mime (.exe) + 415 malformed image (claimed jpeg, garbage bytes)
  - 413 image > 10 MB + 413 video > 50 MB
  - 400 empty file
- GET /api/v1/media/{media_id}
  - happy path: round-trip fetch of an uploaded file
  - 404 unknown id
  - 400 unsafe id (path traversal)
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.core.config import Settings, get_settings
from backend.app.core.users import UserRecord
from backend.app.main import app


# ===== Fixtures =====


def _make_test_user() -> UserRecord:
    """Mirror of alice in backend.app.core.users (test fixture only)."""
    return UserRecord(
        id="user_001",
        username="alice",
        display_name="Alice Demo",
        avatar_url=None,
        password_hash="x",  # not used by get_current_user in tests
    )


@pytest.fixture
def tmp_data_root(tmp_path) -> Iterator[Path]:
    """Provide a per-test media data root and override get_settings so the
    router writes into it. Cleared on teardown by tmp_path.
    """
    new_root = tmp_path / "media"
    new_root.mkdir()

    def _override() -> Settings:
        return Settings(
            media_data_root=str(new_root),
            media_public_base_url="/api/v1/media",
        )

    app.dependency_overrides[get_settings] = _override
    yield new_root
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def auth_client(tmp_data_root) -> Iterator[TestClient]:
    """TestClient with a stubbed get_current_user that returns alice."""
    from backend.app.api.deps import get_current_user

    def _fake_current_user() -> UserRecord:
        return _make_test_user()

    app.dependency_overrides[get_current_user] = _fake_current_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def anon_client(tmp_data_root) -> Iterator[TestClient]:
    """TestClient with no auth override (real 401 path)."""
    with TestClient(app) as c:
        yield c


def _png_bytes(width: int = 32, height: int = 24, color: str = "red") -> bytes:
    """Generate a minimal valid PNG in memory."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(width: int = 64, height: int = 48) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color="blue").save(buf, format="JPEG")
    return buf.getvalue()


def _webp_bytes(width: int = 16, height: int = 16) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color="green").save(buf, format="WEBP")
    return buf.getvalue()


# ===== POST /api/v1/media/upload =====


def test_upload_jpeg_returns_201_with_metadata(auth_client):
    body = _jpeg_bytes(64, 48)
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("photo.jpg", body, "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["media_type"] == "image"
    assert data["size_bytes"] == len(body)
    assert data["width"] == 64
    assert data["height"] == 48
    assert data["duration_seconds"] is None
    assert data["url"].endswith(f"/{data['media_id']}")
    # media_id is uuid4 hex — 32 lowercase alnum chars
    assert len(data["media_id"]) == 32
    assert all(c.isalnum() for c in data["media_id"])


def test_upload_png_returns_201(auth_client):
    body = _png_bytes(8, 8)
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("icon.png", body, "image/png")},
    )
    assert r.status_code == 201
    assert r.json()["media_type"] == "image"


def test_upload_webp_returns_201(auth_client):
    body = _webp_bytes()
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("anim.webp", body, "image/webp")},
    )
    assert r.status_code == 201
    assert r.json()["media_type"] == "image"


def test_upload_mp4_returns_201_without_dimensions(auth_client):
    # V1 doesn't probe video metadata — just verify it stores + returns 201.
    fake_mp4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200  # 224 bytes, looks like mp4 header
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("clip.mp4", fake_mp4, "video/mp4")},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["media_type"] == "video"
    assert data["width"] is None
    assert data["height"] is None


def test_upload_without_auth_returns_401(anon_client):
    r = anon_client.post(
        "/api/v1/media/upload",
        files={"file": ("photo.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert r.status_code == 401


def test_upload_with_invalid_token_returns_401(anon_client):
    r = anon_client.post(
        "/api/v1/media/upload",
        headers={"Authorization": "Bearer not-a-real-token"},
        files={"file": ("photo.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert r.status_code == 401


def test_upload_wrong_mime_returns_415(auth_client):
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("malware.exe", b"MZ\x00\x00", "application/octet-stream")},
    )
    assert r.status_code == 415
    assert "unsupported content-type" in r.json()["detail"].lower()


def test_upload_claimed_jpeg_with_garbage_bytes_returns_415(auth_client):
    # Mime says jpeg but body is not a real image.
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("fake.jpg", b"this is not a jpeg", "image/jpeg")},
    )
    assert r.status_code == 415
    assert "not a valid image" in r.json()["detail"].lower()


def test_upload_oversize_image_returns_413(auth_client):
    # 11 MB of zero bytes — well over the 10 MB image cap. Size check fires
    # BEFORE image validation, so we never reach Pillow.
    big = b"\x00" * (11 * 1024 * 1024)
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("huge.jpg", big, "image/jpeg")},
    )
    assert r.status_code == 413
    assert "too large" in r.json()["detail"].lower()


def test_upload_oversize_video_returns_413(auth_client):
    # 51 MB video — over the 50 MB cap.
    big = b"\x00" * (51 * 1024 * 1024)
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("huge.mp4", big, "video/mp4")},
    )
    assert r.status_code == 413
    assert "too large" in r.json()["detail"].lower()


def test_upload_empty_file_returns_400(auth_client):
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert r.status_code == 400
    assert "empty" in r.json()["detail"].lower()


def test_upload_writes_file_under_user_dir(auth_client, tmp_data_root):
    body = _jpeg_bytes()
    r = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("photo.jpg", body, "image/jpeg")},
    )
    assert r.status_code == 201
    media_id = r.json()["media_id"]
    written = list((tmp_data_root / "user_001").glob(f"{media_id}.*"))
    assert len(written) == 1
    assert written[0].read_bytes() == body


# ===== GET /api/v1/media/{media_id} =====


def test_get_uploaded_file_roundtrip(auth_client):
    body = _jpeg_bytes(40, 30)
    up = auth_client.post(
        "/api/v1/media/upload",
        files={"file": ("photo.jpg", body, "image/jpeg")},
    )
    assert up.status_code == 201
    media_id = up.json()["media_id"]

    r = auth_client.get(f"/api/v1/media/{media_id}")
    assert r.status_code == 200
    assert r.content == body
    assert r.headers["content-type"].startswith("image/jpeg")


def test_get_unknown_media_id_returns_404(auth_client):
    r = auth_client.get("/api/v1/media/deadbeefdeadbeefdeadbeefdeadbeef")
    assert r.status_code == 404


def test_get_with_path_traversal_returns_400(auth_client):
    # FastAPI decodes %2F to '/' before routing, so this becomes a nested path.
    # Either 400 (validation) or 404 (no match) is acceptable — the critical
    # thing is no 500 and no path traversal succeeds.
    r = auth_client.get("/api/v1/media/..%2F..%2Fetc%2Fpasswd")
    assert r.status_code in (400, 404)


def test_get_with_invalid_chars_returns_400(auth_client):
    r = auth_client.get("/api/v1/media/not_a_uuid!")
    assert r.status_code == 400
