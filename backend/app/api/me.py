"""GET /api/v1/me — verifies the bearer access token and returns the user.

Sanity-check endpoint for the frontend: after LoginScreen stores tokens,
ChatScreen can call /me to confirm the token is still good.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import get_current_user
from backend.app.core.users import UserRecord
from backend.app.schemas.auth import UserPublic


router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserPublic)
async def me(current_user: UserRecord = Depends(get_current_user)) -> UserPublic:
    """Return the user record identified by the bearer access token."""
    return UserPublic(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
    )