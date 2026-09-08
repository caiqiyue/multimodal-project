"""FastAPI application factory + lifespan.

Boots the multimodal-ai-assistant backend on 127.0.0.1:9000 (per docs/SECURITY.md §2.2).

Endpoints mounted:
- GET /, /health                          → feat-016 (banner + liveness)
- GET /docs, /openapi.json                → FastAPI auto
- POST /api/v1/auth/login                 → feat-026
- POST /api/v1/auth/refresh               → feat-026
- POST /api/v1/auth/register              → feat-026 (test-only)
- POST /api/v1/auth/wechat-mini           → feat-026 (V1 stub; feat-037 makes real)
- GET  /api/v1/me                         → feat-026 (bearer-protected)
- POST /api/v1/agent/invoke               → feat-017 (LangGraph → vLLM)
- WS   /api/v1/ws/chat                     → feat-021 (token + tool streaming)
- POST /api/v1/media/upload               → feat-020 (multipart media upload)
- GET  /api/v1/media/{media_id}           → feat-020 (public file serve)

Reference: docs/项目总执行计划.md §21 + §23 + §24, feat-016 + feat-017 + feat-020 + feat-021 + feat-026 in feature_list.json.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api import agent, auth, health, me, media, ws_chat
from backend.app.core.config import get_settings


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Log startup/shutdown banners. Real services (DB, vLLM, agent) attach later."""
    settings = get_settings()
    logger.info(
        "Starting multimodal-backend env=%s host=%s port=%d",
        settings.environment,
        settings.host,
        settings.port,
    )
    yield
    logger.info("Stopping multimodal-backend")


def create_app() -> FastAPI:
    """Application factory. Called by uvicorn: `uvicorn backend.app.main:app`."""
    settings = get_settings()

    app = FastAPI(
        title="Multimodal AI Assistant Backend",
        version="0.1.0",
        description=(
            "Auth + chat + media orchestration for the Qwen3-VL-powered assistant. "
            "See docs/项目总执行计划.md §21-§26 for the full roadmap."
        ),
        lifespan=lifespan,
    )

    # CORS — V1 dev: allow all. Tighten in PROD when api.example.com lands (feat-022/023/024).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.environment != "production" else [settings.allowed_origins],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Banner + health (feat-016)
    app.include_router(health.router)

    # Auth + me (feat-026). auth.router already declares prefix="/auth";
    # we mount under /api/v1 to keep room for /api/v1/chat, /api/v1/media later.
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(me.router, prefix="/api/v1")

    # Agent (feat-017) — synchronous LangGraph → vLLM chat invocation.
    app.include_router(agent.router, prefix="/api/v1")

    # WebSocket streaming (feat-021) — astream_events-based token + tool
    # streaming over a persistent connection. The `prefix` kwarg applies to
    # websocket routes the same way it does to HTTP routes, so this mounts at
    # /api/v1/ws/chat (the @router.websocket decorator declares "/ws/chat").
    app.include_router(ws_chat.router, prefix="/api/v1")

    # Media upload (feat-020) — multipart upload + public file serve.
    app.include_router(media.router, prefix="/api/v1")

    return app


app = create_app()