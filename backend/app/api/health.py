"""Health + banner endpoints (feat-016).

These are the minimum smoke-test endpoints for the FastAPI skeleton:
- GET /         → tiny service banner (no auth, public)
- GET /health   → liveness probe (used by init.sh + curl + nginx upstream check)

Both MUST stay auth-free and cheap — they're hit on every container restart / healthcheck.
"""

from __future__ import annotations

import time

from fastapi import APIRouter

from backend.app.core.config import get_settings


router = APIRouter(tags=["health"])


_START_TIME = time.time()


@router.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Tiny banner. Avoids 404 on `/` so `curl http://127.0.0.1:9000/` looks alive."""
    settings = get_settings()
    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "docs": "/docs",
    }


@router.get("/health")
async def health() -> dict[str, object]:
    """Liveness probe. Returns service name + uptime."""
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "uptime_seconds": round(time.time() - _START_TIME, 3),
    }