"""Tests for feat-021 WebSocket streaming chat endpoint.

Coverage:
- WS handshake (101 Switching Protocols)
- Stream sequence: message.start → message.delta* → message.done
- Tool streaming: tool.call → tool.result → message.delta* → message.done
- Error handling: invalid JSON / missing fields → error event
- Wire shape: every event carries the ChatEventBase envelope (id, conversation_id, created_at)
- Regressions: feat-017 /agent/invoke still works; feat-018 tools still bound

The real LangGraph Agent is replaced by an in-process stub backed by
`FakeListChatModel` so pytest does not need vLLM running. Two stub topologies:
- `simple_stub`: call_llm → END (no tools)
- `tool_stub`: call_llm → tools (if tool_calls) → call_llm → END
"""
from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from backend.app.agent.graph import AgentState
from backend.app.main import app
import backend.app.agent.graph as graph_module


# ===== stub infrastructure =====

_STUB_REPLY = "你好世界"


@tool
def _stub_calc(expression: str) -> str:
    """Stub calculator — deterministic output for tool-streaming tests."""
    return f"stub_result:{expression}"


def _build_simple_stub_agent():
    """call_llm → END. Exercises the no-tool streaming path."""
    fake = FakeListChatModel(responses=[_STUB_REPLY])

    def call_llm(state):
        response = fake.invoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("call_llm", call_llm)
    graph.add_edge(START, "call_llm")
    graph.add_edge("call_llm", END)
    return graph.compile()


def _build_tool_stub_agent():
    """call_llm → tools → call_llm → END. Exercises tool.call / tool.result streaming."""
    fake = FakeListChatModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "_stub_calc", "args": {"expression": "23*47"}, "id": "t1"},
                ],
            ),
            AIMessage(content="23 * 47 = 1081"),
        ]
    )
    llm_with_tools = fake.bind_tools([_stub_calc])

    def call_llm(state):
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state):
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("call_llm", call_llm)
    graph.add_node("tools", ToolNode([_stub_calc]))
    graph.add_edge(START, "call_llm")
    graph.add_conditional_edges("call_llm", should_continue)
    graph.add_edge("tools", "call_llm")
    return graph.compile()


@pytest.fixture
def simple_stub(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    graph_module.reset_agent()
    stub = _build_simple_stub_agent()
    monkeypatch.setattr(graph_module, "_agent", stub)
    yield stub
    graph_module.reset_agent()


@pytest.fixture
def tool_stub(monkeypatch: pytest.MonkeyPatch) -> Iterator[object]:
    graph_module.reset_agent()
    stub = _build_tool_stub_agent()
    monkeypatch.setattr(graph_module, "_agent", stub)
    yield stub
    graph_module.reset_agent()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


# ===== helper =====


def _consume_until_done(ws, max_events: int = 20) -> list[dict]:
    """Read events until message.done / error, or max_events reached."""
    events: list[dict] = []
    for _ in range(max_events):
        try:
            event = ws.receive_json()
        except Exception:
            break
        events.append(event)
        if event["type"] in ("message.done", "error"):
            break
    return events


# ===== handshake =====


def test_ws_handshake_succeeds_and_first_event_is_message_start(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
        first = ws.receive_json()
    assert first["type"] == "message.start"


# ===== simple stream =====


def test_ws_simple_streams_start_delta_done_sequence(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
        events = _consume_until_done(ws)
    types = [e["type"] for e in events]
    assert types[0] == "message.start", types
    assert "message.delta" in types, types
    assert types[-1] == "message.done", types


def test_ws_message_delta_concatenates_to_full_reply(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
        events = _consume_until_done(ws)
    done = next(e for e in events if e["type"] == "message.done")
    deltas = [e["delta"] for e in events if e["type"] == "message.delta"]
    assert "".join(deltas) == done["full_content"]
    assert _STUB_REPLY in done["full_content"]


# ===== envelope shape =====


def test_ws_envelope_fields_present_on_every_event(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
        events = _consume_until_done(ws)
    assert events, "expected at least one event"
    for event in events:
        assert "id" in event and isinstance(event["id"], str)
        assert "conversation_id" in event and isinstance(event["conversation_id"], str)
        assert "created_at" in event and isinstance(event["created_at"], int)


# ===== tool streaming =====


def test_ws_tool_call_emits_tool_call_then_tool_result(client, tool_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "23*47"}]})
        events = _consume_until_done(ws, max_events=15)
    types = [e["type"] for e in events]
    assert "tool.call" in types, types
    assert "tool.result" in types, types
    # tool.call before tool.result
    assert types.index("tool.call") < types.index("tool.result"), types
    # Both before message.done
    done_idx = types.index("message.done")
    assert types.index("tool.call") < done_idx
    assert types.index("tool.result") < done_idx


def test_ws_tool_call_payload_shape(client, tool_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "23*47"}]})
        events = _consume_until_done(ws, max_events=15)
    call = next(e for e in events if e["type"] == "tool.call")
    assert call["name"] == "_stub_calc"
    assert call["args"] == {"expression": "23*47"}
    assert isinstance(call["tool_call_id"], str)
    assert call["tool_call_id"]  # non-empty


def test_ws_tool_result_payload_shape(client, tool_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "23*47"}]})
        events = _consume_until_done(ws, max_events=15)
    result = next(e for e in events if e["type"] == "tool.result")
    assert result["name"] == "_stub_calc"
    assert "stub_result:" in result["content"]
    assert isinstance(result["tool_call_id"], str)
    assert result["tool_call_id"]


def test_ws_tool_call_and_result_share_id(client, tool_stub):
    """The tool.call and tool.result for one invocation must share tool_call_id."""
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": [{"role": "user", "content": "23*47"}]})
        events = _consume_until_done(ws, max_events=15)
    call = next(e for e in events if e["type"] == "tool.call")
    result = next(e for e in events if e["type"] == "tool.result")
    assert call["tool_call_id"] == result["tool_call_id"]


# ===== error handling =====


def test_ws_invalid_json_emits_error_event(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_text("not valid json")
        events = _consume_until_done(ws, max_events=3)
    assert any(e["type"] == "error" for e in events), events


def test_ws_missing_messages_field_emits_error_event(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({})
        events = _consume_until_done(ws, max_events=3)
    assert any(e["type"] == "error" for e in events), events


def test_ws_empty_messages_array_emits_error_event(client, simple_stub):
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"messages": []})
        events = _consume_until_done(ws, max_events=3)
    assert any(e["type"] == "error" for e in events), events


# ===== connection reusability =====


def test_ws_connection_stays_open_after_error(client, simple_stub):
    """An error on one message does not close the connection — client can retry."""
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({})  # bad payload
        events1 = _consume_until_done(ws, max_events=3)
        assert any(e["type"] == "error" for e in events1)

        ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
        events2 = _consume_until_done(ws, max_events=10)
        assert events2[-1]["type"] == "message.done"


# ===== regressions: prior features still work =====


def test_invoke_still_works_after_ws_mount(client, simple_stub):
    """feat-017 /agent/invoke regression — adding WS must not break the sync endpoint."""
    r = client.post(
        "/api/v1/agent/invoke",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200
    assert r.json()["reply"] == _STUB_REPLY


def test_health_still_works(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ===== router mounting =====


def test_ws_router_is_mounted_under_api_v1(client, simple_stub):
    """The WS route lives at /api/v1/ws/chat (NOT /ws/chat).

    Without the /api/v1 prefix, the server closes the handshake immediately
    and TestClient raises WebSocketDisconnect on enter. Catching that confirms
    the prefix is enforced.
    """
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/chat") as ws:
            ws.send_json({"messages": [{"role": "user", "content": "hi"}]})
            ws.receive_json()
