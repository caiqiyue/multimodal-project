"""Shared FastAPI dependencies (e.g. bearer-token → UserRecord)."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.security.utils import get_authorization_scheme_param

from backend.app.core import users as users_store
from backend.app.core.security import InvalidTokenError, decode_token
from backend.app.core.users import UserRecord


def _extract_bearer(authorization: str | None) -> str:
    """Pull the token out of an `Authorization: Bearer <token>` header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    scheme, param = get_authorization_scheme_param(authorization)
    if scheme.lower() != "bearer" or not param:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid Authorization header (expected 'Bearer <token>')",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return param


def get_current_user(authorization: str | None = Header(default=None)) -> UserRecord:
    """Decode the bearer access token and look up the user.

    Returns the UserRecord on success. Raises 401 on any auth failure
    (missing header, bad scheme, expired token, unknown sub).
    """
    token = _extract_bearer(authorization)
    try:
        user_id = decode_token(token, expected_type="access")
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = users_store.find_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token references unknown user",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# Re-export so routers can import from one place.
__all__ = ["get_current_user"]