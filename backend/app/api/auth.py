"""POST /api/v1/auth/{login, refresh, register, wechat-mini}.

Demo + V1 endpoints. Register is intentionally simple and only used for
local testing — production signup (feat-019+) goes through a proper flow
with email verification and password reset.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from backend.app.core import users as users_store
from backend.app.core.security import (
    InvalidTokenError,
    TokenTypeMismatchError,
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from backend.app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    UserPublic,
    WechatMiniRequest,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/auth", tags=["auth"])


def _user_public(record) -> UserPublic:
    return UserPublic(
        id=record.id,
        username=record.username,
        display_name=record.display_name,
        avatar_url=record.avatar_url,
    )


def _issue_tokens(user_id: str) -> tuple[str, str]:
    return create_access_token(user_id), create_refresh_token(user_id)


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    """Username + password → JWT pair + user record."""
    user = users_store.find_by_username(body.username)
    if user is None or not verify_password(body.password, user.password_hash):
        logger.info("login attempt failed for username=%r", body.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid username or password",
        )
    access, refresh = _issue_tokens(user.id)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_public(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest) -> RefreshResponse:
    """Exchange a valid refresh token for a fresh access+refresh pair (rotation)."""
    user_id = _safe_decode_refresh(body.refresh_token)
    user = users_store.find_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh token references unknown user",
        )
    access, new_refresh = _issue_tokens(user.id)
    return RefreshResponse(access_token=access, refresh_token=new_refresh)


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest) -> LoginResponse:
    """Test-only signup. Always returns 201 + tokens (caller is auto-logged-in).

    Production signup (feat-019+) replaces this with email-verification flow.
    """
    if users_store.username_exists(body.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"username already taken: {body.username}",
        )
    record = users_store.create_user(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    access, refresh = _issue_tokens(record.id)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_public(record),
    )


@router.post("/wechat-mini", response_model=LoginResponse)
async def wechat_mini(body: WechatMiniRequest) -> LoginResponse:
    """Exchange wx.login() code for tokens.

    V1: stub — any non-empty code resolves to the alice demo user (matches the
    mock layer in packages/mock-data/src/auth.ts:mockWechatMini).

    feat-037 (WeChat AppID/AppSecret) lands the real flow:
        1. POST https://api.weixin.qq.com/sns/jscode2session with code + appid + secret
        2. Get openid + session_key (or error)
        3. find-or-create user by openid
        4. Issue tokens
    """
    if not body.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="code is required",
        )
    # V1 stub: any non-empty code → alice (matches frontend mock)
    record = users_store.find_by_id("user_001")
    if record is None:  # pragma: no cover — defensive only
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="demo user user_001 not found",
        )
    access, refresh = _issue_tokens(record.id)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_public(record),
    )


def _safe_decode_refresh(token: str) -> str:
    try:
        return decode_token(token, expected_type="refresh")
    except (InvalidTokenError, TokenTypeMismatchError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc