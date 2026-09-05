"""Agent package — exposes a single ``get_agent()`` factory that dispatches
between the demo-mode echo agent (feat-027) and the real LangGraph agent
(graph.py) based on ``settings.agent_mode``.

Callers (api/agent.py, api/ws_chat.py) import only ``get_agent()`` from
this module — they don't need to know which backend is active. vLLM-up /
vLLM-down flips are a config change, not a code change.
"""
from __future__ import annotations

from backend.app.agent.echo_agent import EchoAgent
from backend.app.agent.graph import get_agent as _get_real_agent
from backend.app.core.config import settings


def get_agent():
    """Return the active agent backend.

    Dispatches on ``settings.agent_mode``:
    - ``"demo"`` → ``EchoAgent()`` (no vLLM dependency, context-aware reply)
    - ``"real"`` → compiled LangGraph agent from ``graph.py`` (calls vLLM)

    The agent factory is invoked at request time (not module import time) so
    ops can flip ``AGENT_MODE`` env var and restart uvicorn to switch backends
    without code changes.
    """
    if settings.agent_mode == "demo":
        return EchoAgent()
    return _get_real_agent()


__all__ = ["get_agent"]
