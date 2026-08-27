"""Tests for feat-026 auth endpoints.

Coverage:
- POST /api/v1/auth/login (happy path + wrong password + missing field + short password)
- POST /api/v1/auth/register (happy path + duplicate username)
- POST /api/v1/auth/refresh (happy path + invalid refresh + wrong-type token)
- POST /api/v1/auth/wechat-mini (happy path + empty code)
- GET  /api/v1/me (happy path + missing header + invalid token + expired token)
"""

from __future__ import annotations

import time

import jwt
import pytest

from backend.app.core.config import get_settings


# ===== /auth/login =====


def test_login_success_returns_jwt_pair_and_user(client):
    r = client.post("/api/v1/auth/login", json={"username": "alice", "password": "alice1234"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["username"] == "alice"
    assert body["user"]["id"] == "user_001"
    assert body["user"]["display_name"] == "Alice Demo"
    assert body["user"]["avatar_url"].startswith("https://")
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
    assert isinstance(body["refresh_token"], str) and len(body["refresh_token"]) > 20
    assert body["access_token"] != body["refresh_token"]


def test_login_rejects_wrong_password_with_401(client):
    r = client.post("/api/v1/auth/login", json={"username": "alice", "password": "wrong-pwd"})
    assert r.status_code == 401
    assert "invalid username or password" in r.json()["detail"].lower()


def test_login_rejects_unknown_user_with_401(client):
    r = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "abcd1234"})
    assert r.status_code == 401


def test_login_rejects_missing_username_with_422(client):
    r = client.post("/api/v1/auth/login", json={"password": "abcd1234"})
    assert r.status_code == 422  # Pydantic validation


def test_login_rejects_short_password_with_422(client):
    r = client.post("/api/v1/auth/login", json={"username": "alice", "password": "short"})
    assert r.status_code == 422


def test_login_rejects_extra_fields_with_422(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice1234", "extra": "nope"},
    )
    assert r.status_code == 422  # model_config extra="forbid"


# ===== /auth/register =====


def test_register_creates_user_and_returns_tokens(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"username": "carol", "password": "carol1234", "display_name": "Carol Demo"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["username"] == "carol"
    assert body["user"]["id"] == "user_004"
    assert "access_token" in body
    assert "refresh_token" in body


def test_register_duplicate_username_returns_409(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"username": "alice", "password": "alice1234", "display_name": "Alice 2"},
    )
    assert r.status_code == 409


def test_register_rejects_short_password(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"username": "dave", "password": "short", "display_name": "Dave"},
    )
    assert r.status_code == 422


# ===== /auth/refresh =====


def test_refresh_rotates_token_pair(client):
    # Get initial pair
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice1234"},
    ).json()
    old_refresh = login["refresh_token"]

    # Refresh
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body and "refresh_token" in body
    # Rotation is intended — new refresh should differ from the old one.
    assert body["refresh_token"] != old_refresh


def test_refresh_rejects_access_token_used_as_refresh(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice1234"},
    ).json()
    # Try to "refresh" with an access token — should be rejected by type check
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": login["access_token"]})
    assert r.status_code == 401


def test_refresh_rejects_garbage_token(client):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert r.status_code == 401


# ===== /auth/wechat-mini =====


def test_wechat_mini_happy_path_returns_alice_tokens(client):
    r = client.post("/api/v1/auth/wechat-mini", json={"code": "demo-code-001"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["username"] == "alice"
    assert "access_token" in body and "refresh_token" in body


def test_wechat_mini_rejects_empty_code_with_400(client):
    r = client.post("/api/v1/auth/wechat-mini", json={"code": ""})
    assert r.status_code == 422  # Field(min_length=1)


def test_wechat_mini_rejects_missing_code_with_422(client):
    r = client.post("/api/v1/auth/wechat-mini", json={})
    assert r.status_code == 422


# ===== /me =====


def test_me_returns_authenticated_user(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "bob", "password": "bob12345"},
    ).json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}

    r = client.get("/api/v1/me", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["username"] == "bob"
    assert body["id"] == "user_002"


def test_me_rejects_missing_authorization_header(client):
    r = client.get("/api/v1/me")
    assert r.status_code == 401
    assert "missing" in r.json()["detail"].lower()


def test_me_rejects_non_bearer_scheme(client):
    r = client.get("/api/v1/me", headers={"Authorization": "Basic xyz"})
    assert r.status_code == 401


def test_me_rejects_invalid_token(client):
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_me_rejects_expired_token(client):
    """Manually craft an expired JWT and confirm /me rejects it."""
    settings = get_settings()
    payload = {
        "sub": "user_001",
        "type": "access",
        "iat": int(time.time()) - 7200,
        "exp": int(time.time()) - 3600,  # expired 1h ago
    }
    expired = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()


def test_me_rejects_refresh_token_used_as_access(client):
    """A refresh token shouldn't pass the /me access-token check."""
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice1234"},
    ).json()
    r = client.get(
        "/api/v1/me",
        headers={"Authorization": f"Bearer {login['refresh_token']}"},
    )
    assert r.status_code == 401


# ===== /health still works (regression — feat-016) =====


def test_health_still_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"