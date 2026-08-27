"""Pydantic schemas for /api/v1/agent/invoke.

Kept deliberately small and decoupled from any LangChain / LangGraph types so
the wire contract is stable even if the agent framework changes under us.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    """One turn in a conversation.

    `role` is restricted to the three standard chat roles; raw LangChain /
    OpenAI message shapes are coerced server-side. `content` is plain text
    for V1 (no multimodal payload — that lands with feat-018+ feat-033).
    """

    model_config = ConfigDict(extra="forbid")

    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(min_length=1, max_length=32_000)


class AgentInvokeRequest(BaseModel):
    """POST /api/v1/agent/invoke body — full conversation history (stateless)."""

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage] = Field(
        min_length=1,
        max_length=64,
        description="Conversation history in chronological order.",
    )


class AgentInvokeResponse(BaseModel):
    """POST /api/v1/agent/invoke response.

    `messages` is the full conversation including the assistant's reply.
    `reply` is a convenience copy of the last message's content for clients
    that don't want to walk the messages array.
    """

    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessage]
    reply: str = Field(min_length=1)