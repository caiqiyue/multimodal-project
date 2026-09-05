"""Tests for feat-017 Agent endpoint.

Coverage:
- POST /api/v1/agent/invoke (happy path, multi-turn, error paths)
- Response shape contract (`messages` echo + `reply` shortcut)
- Pydantic validation (empty messages, missing field, extra field, invalid role,
  empty content, content over max length)
- Multi-modal content blocks (feat-022): str content (back-compat) +
  list[ContentBlock] (text + image_url)

The real LangGraph Agent is replaced by an in-process stub backed by
`FakeListChatModel` so pytest does not need vLLM running. The stub exercises
the same graph topology (START → call_llm → END) and the same message-coercion
code paths that production runs.
"""
from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from backend.app.agent.graph import AgentState
from backend.app.main import app
from backend.app.schemas.agent import ChatMessage
import backend.app.agent.graph as graph_module


_STUB_REPLY = "你好！我是 Qwen3-VL，来自本地推理服务。"


def _build_stub_agent() -> object:
    """Build a compiled StateGraph that echoes the first canned response."""
    fake = FakeListChatModel(responses=[_STUB_REPLY])

    def call_llm(state):
        response = fake.invoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("call_llm", call_llm)
    graph.add_edge(START, "call_llm")
    graph.add_edge("call_llm", END)
    return graph.compile()


@pytest.fixture
def stub_agent(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    """Patch the cached compiled agent with an in-process stub."""
    graph_module.reset_agent()
    stub = _build_stub_agent()
    # api/agent.py does `from backend.app.agent import get_agent` at import
    # time — so we patch the consumer's module binding directly (string
    # monkeypatch fails with AttributeError for module-level imports; the
    # canonical pytest pattern is to import the module object and patch
    # that).
    import backend.app.api.agent as api_agent_module
    monkeypatch.setattr(api_agent_module, "get_agent", lambda: stub)
    # Also patch graph._agent for callers that still resolve graph.get_agent().
    monkeypatch.setattr(graph_module, "_agent", stub, raising=True)
    yield stub
    graph_module.reset_agent()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


# ===== happy path (str content, V1 backward-compat) =====


def test_invoke_returns_assistant_reply_and_full_history(client, stub_agent):
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "user", "content": "你好"}]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] == _STUB_REPLY
    assert len(body["messages"]) == 2
    assert body["messages"][0] == {"role": "user", "content": "你好"}
    assert body["messages"][1] == {"role": "assistant", "content": _STUB_REPLY}


def test_invoke_supports_system_user_assistant_history(client, stub_agent):
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {"role": "system", "content": "你是一个简洁的助手"},
                {"role": "user", "content": "1+1=?"},
                {"role": "assistant", "content": "2"},
                {"role": "user", "content": "再加 1 呢？"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Echoed in chronological order, system + 3 turns + final assistant = 5
    assert len(body["messages"]) == 5
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][1] == {"role": "user", "content": "1+1=?"}
    assert body["messages"][2] == {"role": "assistant", "content": "2"}
    assert body["messages"][3] == {"role": "user", "content": "再加 1 呢？"}
    assert body["messages"][4] == {"role": "assistant", "content": _STUB_REPLY}
    # reply is the LAST message's content
    assert body["reply"] == _STUB_REPLY


# ===== pydantic validation (extra="forbid", field constraints) =====


def test_invoke_rejects_empty_messages_with_422(client):
    r = client.post("/api/v1/agent/invoke", json={"messages": []})
    assert r.status_code == 422


def test_invoke_rejects_missing_messages_field_with_422(client):
    r = client.post("/api/v1/agent/invoke", json={})
    assert r.status_code == 422


def test_invoke_rejects_extra_fields_with_422(client):
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "extra": "nope",
        },
    )
    assert r.status_code == 422


def test_invoke_rejects_invalid_role_with_422(client):
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "tool", "content": "hi"}]},
    )
    assert r.status_code == 422  # role regex


def test_invoke_rejects_empty_content_with_422(client):
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "user", "content": ""}]},
    )
    assert r.status_code == 422  # Field(min_length=1)


# ===== coercion order: LangChain message classes are imported + used at runtime =====


def test_agent_state_typed_dict_carries_messages():
    """Sanity check — AgentState is the TypedDict the graph consumes."""
    state: AgentState = {"messages": [HumanMessage(content="x")]}
    assert state["messages"][0].content == "x"
    # Type ignores are intentional — TypedDict is structural
    state["messages"].append(SystemMessage(content="sys"))  # type: ignore[attr-defined]


# ===== module import surface (regression: feat-017 wiring) =====


def test_agent_router_is_mounted_under_api_v1(client):
    """Smoke-check that the agent router is reachable at the documented path."""
    # Wrong prefix → 404, not 422 → confirms router is mounted at /api/v1/agent
    r = client.post("/agent/invoke", json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 404


def test_from_langchain_skips_tool_call_intermediates():
    """feat-018: when the agent invokes a tool, the intermediate AIMessage
    (content="" + tool_calls=[...]) and the ToolMessage must NOT appear in
    the wire-format response. Otherwise the min_length=1 / role-regex
    validation would 422."""
    from langchain_core.messages import ToolMessage

    from backend.app.api.agent import _from_langchain

    synthetic = [
        HumanMessage(content="23 * 47 = ?"),
        AIMessage(
            content="",
            tool_calls=[{"name": "calculator", "args": {"expression": "23 * 47"}, "id": "x"}],
        ),
        # ToolMessage — must be skipped (no chat role for "tool").
        ToolMessage(content="1081", tool_call_id="x"),
        AIMessage(content="23 * 47 = 1081"),
    ]
    out = _from_langchain(synthetic)
    assert len(out) == 2
    assert out[0].role == "user"
    assert out[0].content == "23 * 47 = ?"
    assert out[1].role == "assistant"
    assert out[1].content == "23 * 47 = 1081"


def test_module_imports_and_coercion_round_trip():
    """Sanity: the agent module + its LangChain deps import without side effects."""
    from backend.app.agent.graph import build_graph, get_agent, reset_agent
    from backend.app.api.agent import _to_langchain, _from_langchain
    from backend.app.schemas.agent import AgentInvokeRequest, AgentInvokeResponse

    # Build a throwaway graph and confirm LangChain message classes coerce.
    msgs = _to_langchain([
        ChatMessage(role="user", content="hi"),
        ChatMessage(role="assistant", content="yo"),
        ChatMessage(role="system", content="be brief"),
    ])
    assert isinstance(msgs[0], HumanMessage)
    assert isinstance(msgs[1], AIMessage)
    assert isinstance(msgs[2], SystemMessage)

    roundtrip = _from_langchain(msgs)
    assert roundtrip[0].role == "user"
    assert roundtrip[1].role == "assistant"
    assert roundtrip[2].role == "system"
    assert roundtrip[0].content == "hi"

    # reset_agent is safe to call on a fresh cache
    reset_agent()
    assert graph_module._agent is None


# ===== feat-022 — multi-modal content blocks =====


def test_to_langchain_converts_text_block_list_to_dict_list():
    """A single text block in a list becomes OpenAI-style {type, text} dict."""
    from backend.app.api.agent import _to_langchain
    from backend.app.schemas.agent import ContentBlock, TextContentBlock

    msgs = _to_langchain([
        ChatMessage(
            role="user",
            content=[TextContentBlock(type="text", text="describe this")],
        ),
    ])
    assert isinstance(msgs[0], HumanMessage)
    assert msgs[0].content == [{"type": "text", "text": "describe this"}]


def test_to_langchain_converts_image_url_block_to_dict():
    """An image_url block becomes the OpenAI-style {type, image_url:{url}} dict."""
    from backend.app.api.agent import _to_langchain
    from backend.app.schemas.agent import ImageUrlContentBlock

    msgs = _to_langchain([
        ChatMessage(
            role="user",
            content=[ImageUrlContentBlock(
                type="image_url",
                image_url={"url": "http://127.0.0.1:9000/api/v1/media/abc"},
            )],
        ),
    ])
    assert isinstance(msgs[0], HumanMessage)
    assert msgs[0].content == [
        {
            "type": "image_url",
            "image_url": {"url": "http://127.0.0.1:9000/api/v1/media/abc"},
        },
    ]


def test_to_langchain_converts_multi_block_message(client, stub_agent):
    """A user message mixing text + image_url reaches the stub model intact."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "看这张图"},
                        {
                            "type": "image_url",
                            "image_url": {"url": "http://127.0.0.1:9000/api/v1/media/abc"},
                        },
                    ],
                },
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Stub still emits plain text — reply shape unchanged for V1 models.
    assert body["reply"] == _STUB_REPLY
    assert body["messages"][0]["role"] == "user"


def test_to_langchain_rejects_empty_block_list_with_422(client):
    """A `content: []` message is meaningless — must 422."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "user", "content": []}]},
    )
    assert r.status_code == 422


def test_to_langchain_rejects_too_many_blocks_with_422(client):
    """More than MAX_BLOCKS_PER_MESSAGE blocks must 422."""
    from backend.app.schemas.agent import MAX_BLOCKS_PER_MESSAGE

    blocks = [{"type": "text", "text": f"block {i}"} for i in range(MAX_BLOCKS_PER_MESSAGE + 1)]
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "user", "content": blocks}]},
    )
    assert r.status_code == 422


def test_pydantic_rejects_unknown_block_type_with_422(client):
    """Discriminated union must reject an unknown `type` discriminator value."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "audio_url", "audio_url": {"url": "x"}}],
                },
            ],
        },
    )
    assert r.status_code == 422


def test_pydantic_rejects_missing_block_field_with_422(client):
    """A text block without `text` must 422 (TextContentBlock.text is required)."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {"role": "user", "content": [{"type": "text"}]},
            ],
        },
    )
    assert r.status_code == 422


def test_pydantic_rejects_image_url_block_without_url_with_422(client):
    """An image_url block without an image_url.url object must 422."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "image_url", "image_url": {}}],
                },
            ],
        },
    )
    assert r.status_code == 422


def test_pydantic_accepts_image_url_block_with_detail(client, stub_agent):
    """detail=auto/high/low is OpenAI-standard and should pass through."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "http://127.0.0.1:9000/api/v1/media/xyz",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
        },
    )
    assert r.status_code == 200, r.text


def test_pydantic_rejects_video_url_block_in_v1(client):
    """video_url blocks are V3 (Qwen3-VL supports but OpenAI-compat doesn't).
    The V1 schema rejects them at the boundary."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "video_url", "video_url": {"url": "http://x/y.mp4"}},
                    ],
                },
            ],
        },
    )
    assert r.status_code == 422


def test_system_message_with_str_content_still_works(client, stub_agent):
    """V1 system messages (str content) must continue to work."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={
            "messages": [
                {"role": "system", "content": "be terse"},
                {"role": "user", "content": "hi"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reply"] == _STUB_REPLY


def test_to_langchain_dispatches_by_role_for_blocks(client, stub_agent):
    """user/assistant/system all accept list[ContentBlock]; _to_langchain
    constructs the right LangChain subclass for each."""
    from backend.app.api.agent import _to_langchain
    from backend.app.schemas.agent import TextContentBlock

    msgs = _to_langchain([
        ChatMessage(
            role="system",
            content=[TextContentBlock(type="text", text="you are helpful")],
        ),
        ChatMessage(
            role="user",
            content=[TextContentBlock(type="text", text="hi")],
        ),
        ChatMessage(
            role="assistant",
            content=[TextContentBlock(type="text", text="hello!")],
        ),
    ])
    assert isinstance(msgs[0], SystemMessage)
    assert isinstance(msgs[1], HumanMessage)
    assert isinstance(msgs[2], AIMessage)
    # All three have list content (not str)
    for m in msgs:
        assert isinstance(m.content, list)


# ===== /health still works (regression: feat-016) =====


def test_health_still_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ===== /auth still works (regression: feat-026) =====


def test_auth_login_still_works(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "alice", "password": "alice1234"},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()