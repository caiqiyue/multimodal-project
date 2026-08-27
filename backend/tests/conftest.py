"""Shared pytest fixtures.

Uses FastAPI's TestClient (synchronous wrapper around httpx) so tests run
without spinning up uvicorn. Bcrypt is exercised once at module import
when `backend.app.core.users` runs its seed.
"""

from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    """Yield a TestClient; lifespan events fire on enter / exit."""
    with TestClient(app) as c:
        yield c