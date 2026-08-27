"""Pydantic schemas matching @multimodal/api-contract (TypeScript frontend).

Every field here mirrors packages/api-contract/src/auth.ts so the mobile-app +
mini-program clients can deserialize backend responses without rewriting their
TS types. When you change a schema, update the TS source too.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    """POST /api/v1/auth/login body."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, description="Account username")
    password: str = Field(min_length=8, description="Account password")


class UserPublic(BaseModel):
    """Subset of the user record safe to expose to clients.

    avatar_url is optional because not every demo user has one set.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    username: str
    display_name: str
    avatar_url: str | None = None


class LoginResponse(BaseModel):
    """POST /api/v1/auth/login response — also reused by /auth/register + /auth/wechat-mini."""

    model_config = ConfigDict(extra="forbid")

    access_token: str
    refresh_token: str
    user: UserPublic


class RegisterRequest(BaseModel):
    """POST /api/v1/auth/register body (test/demo only; not exposed in production builds)."""

    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1)
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    """POST /api/v1/auth/refresh body."""

    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class RefreshResponse(BaseModel):
    """POST /api/v1/auth/refresh response — rotated token pair (no user blob)."""

    model_config = ConfigDict(extra="forbid")

    access_token: str
    refresh_token: str


class WechatMiniRequest(BaseModel):
    """POST /api/v1/auth/wechat-mini body.

    code is the wx.login() temp credential; encrypted_data + iv are optional
    and used to decrypt phone / unionid in a future phase. V1 ignores them.
    """

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, description="wx.login() code from client")
    encrypted_data: str | None = None
    iv: str | None = None