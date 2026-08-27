"""In-memory user store for V1.

This is intentionally simple: a module-level dict + a tiny set of helpers.
Production (feat-019+) replaces this with a SQLAlchemy model + Postgres
behind the same interface (find_by_username, find_by_id, create).

Demo credentials match packages/mock-data/src/users.ts so the frontend's
mock layer (alice/alice1234 etc.) keeps working as soon as it points at
this real backend.

IMPORTANT: bcrypt hashes are computed at import time. The first import is
~250ms; subsequent imports hit the module cache.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.core.security import hash_password


@dataclass(frozen=True)
class UserRecord:
    """Internal user representation. Never returned to clients directly."""

    id: str
    username: str
    display_name: str
    password_hash: str
    avatar_url: str | None = None


def _seed_users() -> dict[str, UserRecord]:
    """V1 demo fixtures — passwords hashed at boot."""
    return {
        "alice": UserRecord(
            id="user_001",
            username="alice",
            display_name="Alice Demo",
            avatar_url="https://i.pravatar.cc/150?u=alice",
            password_hash=hash_password("alice1234"),
        ),
        "bob": UserRecord(
            id="user_002",
            username="bob",
            display_name="Bob Demo",
            avatar_url="https://i.pravatar.cc/150?u=bob",
            password_hash=hash_password("bob12345"),
        ),
        "demo": UserRecord(
            id="user_003",
            username="demo",
            display_name="Demo User",
            password_hash=hash_password("demo1234"),
        ),
    }


# Mutable backing store so /auth/register can append. The keys are usernames
# (lowercased to enforce case-insensitive uniqueness) but the records carry
# the original-case username.
_USERS: dict[str, UserRecord] = _seed_users()


def find_by_username(username: str) -> UserRecord | None:
    """Case-insensitive username lookup."""
    if not isinstance(username, str):
        return None
    return _USERS.get(username.lower())


def find_by_id(user_id: str) -> UserRecord | None:
    """Primary-key lookup by user id (user_001, user_002, ...)."""
    if not isinstance(user_id, str):
        return None
    for record in _USERS.values():
        if record.id == user_id:
            return record
    return None


def username_exists(username: str) -> bool:
    return find_by_username(username) is not None


def create_user(username: str, password_hash: str, display_name: str) -> UserRecord:
    """Append a new user. Caller is responsible for hashing the password.
    Username is normalized to lowercase for case-insensitive uniqueness.
    """
    if username_exists(username):
        raise ValueError(f"username already taken: {username}")
    next_id = f"user_{len(_USERS) + 1:03d}"
    record = UserRecord(
        id=next_id,
        username=username,
        display_name=display_name,
        password_hash=password_hash,
    )
    _USERS[username.lower()] = record
    return record


def all_usernames() -> list[str]:
    """Test/debug helper. Not exposed via HTTP."""
    return sorted(_USERS.keys())