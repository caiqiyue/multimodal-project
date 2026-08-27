"""JWT + password hashing primitives.

Backend counterpart to the mobile-app / mini-program secure-storage layer that
holds tokens. Tokens are HS256 JWTs signed with settings.jwt_secret; refresh
tokens carry `type: "refresh"`, access tokens carry `type: "access"`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt as _bcrypt
import jwt

from backend.app.core.config import get_settings


# ----- Errors -----


class InvalidTokenError(Exception):
    """Token decode failed (signature, expiry, format)."""


class TokenTypeMismatchError(Exception):
    """Decoded token's `type` claim doesn't match what the caller expected."""


# ----- Password hashing -----


def hash_password(plain: str) -> str:
    """bcrypt-hash a plaintext password (cost 12 default)."""
    if not isinstance(plain, str) or not plain:
        raise ValueError("password must be a non-empty string")
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt comparison. Returns False on any error."""
    if not isinstance(plain, str) or not isinstance(hashed, str):
        return False
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ----- JWT helpers -----


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: str) -> str:
    """Sign a short-lived access token (default 30 min)."""
    settings = get_settings()
    now = _now()
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    """Sign a long-lived refresh token (default 14 days)."""
    settings = get_settings()
    now = _now()
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.refresh_token_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> str:
    """Verify signature + expiry + type. Returns user_id (sub claim).

    Raises:
        InvalidTokenError: signature/format/expiry problem
        TokenTypeMismatchError: token's `type` doesn't match expected_type
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"invalid token: {exc}") from exc

    token_type = payload.get("type")
    if token_type != expected_type:
        raise TokenTypeMismatchError(
            f"expected type={expected_type}, got type={token_type!r}"
        )

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise InvalidTokenError("token missing or invalid sub claim")
    return sub