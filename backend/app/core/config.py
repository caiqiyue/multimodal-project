"""Centralized settings via Pydantic Settings.

Reads from `.env` (gitignored) and environment variables. Single source of truth for
backend configuration — no other module should call `os.environ.get(...)` directly.

Reference: docs/SECURITY.md §1.4 (server .env), pydantic-settings v2 docs.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime knobs in one place.

    Override precedence (highest first): explicit env vars > .env file > defaults.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Identity
    service_name: str = "multimodal-backend"
    version: str = "0.1.0"
    environment: str = "development"

    # Network binding — bound to 127.0.0.1 only (docs/SECURITY.md §2.2)
    host: str = "127.0.0.1"
    port: int = 9000

    # CORS — comma-separated origins for production; "*" rejected in PROD path
    allowed_origins: str = "*"

    # Auth (feat-026 will read these; declared here so the Settings object is complete)
    jwt_secret: str = "dev-only-secret-replace-in-prod-please-use-32-bytes-random"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # WeChat mini program (feat-037 placeholder; required by feat-026 /auth/wechat-mini)
    wx_appid: str = ""
    wx_appsecret: str = ""

    # vLLM (feat-002 + feat-017). Server-side Agent wraps this as an
    # OpenAI-compatible ChatOpenAI client. `api_key` is ignored by vLLM
    # (it doesn't validate), but langchain-openai requires a non-empty string.
    vllm_base_url: str = "http://127.0.0.1:8000/v1"
    vllm_model: str = "vlm-base"
    vllm_api_key: str = "EMPTY"
    vllm_temperature: float = 0.7
    vllm_timeout_seconds: float = 60.0

    # Media upload (feat-020). Local-disk storage for V1 (no object-store dependency).
    # Files are written under media_data_root / user_id / media_id.ext; the
    # public link is media_public_base_url + '/' + media_id.
    media_data_root: str = "/data/media"
    media_public_base_url: str = "/api/v1/media"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings instance — pydantic-settings loads .env exactly once."""
    return Settings()