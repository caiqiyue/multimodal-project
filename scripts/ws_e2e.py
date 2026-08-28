"""Real e2e WebSocket smoke test for /api/v1/ws/chat.

Connects to the live uvicorn (port 9000), sends a valid AgentInvokeRequest
payload, and captures every ChatEvent-shaped frame until message.done or
error.

V1 verification surface (no vLLM running):
  - Handshake succeeds (HTTP 101 Switching Protocols).
  - All wire events include the ChatEventBase envelope (id / conversation_id / created_at).
  - Without vLLM, the agent fails → error event then message.done with
    finish_reason="error" — this exercises the production error path
    end-to-end.

Run from the server (where uvicorn is bound to 127.0.0.1:9000):
  source /opt/miniconda3/etc/profile.d/conda.sh && conda activate multimodal_ai
  python scripts/ws_e2e.py

Exit code 0 = handshake + at least one event received.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time

import websockets


WS_URL = "ws://127.0.0.1:9000/api/v1/ws/chat"
PAYLOAD = {
    "messages": [{"role": "user", "content": "你好，介绍一下你自己"}],
}


async def run_e2e() -> int:
    started_at = time.time()
    print("[e2e] connecting to " + WS_URL, flush=True)
    async with websockets.connect(WS_URL) as ws:
        elapsed = time.time() - started_at
        print("[e2e] handshake OK ({:.2f}s)".format(elapsed), flush=True)

        await ws.send(json.dumps(PAYLOAD))
        print("[e2e] payload sent, awaiting events...", flush=True)

        events = []
        try:
            for _ in range(50):
                raw = await asyncio.wait_for(ws.recv(), timeout=15.0)
                event = json.loads(raw)
                events.append(event)
                ev_type = event.get("type")
                ev_conv = event.get("conversation_id", "")[:8]
                print("[e2e] event: type={} conv={}...".format(ev_type, ev_conv), flush=True)
                if ev_type in ("message.done", "error"):
                    break
        except asyncio.TimeoutError:
            print("[e2e] TIMEOUT waiting for terminal event", flush=True)
        except websockets.ConnectionClosed:
            print("[e2e] connection closed by server", flush=True)

        elapsed = time.time() - started_at
        print("[e2e] received {} events in {:.2f}s".format(len(events), elapsed), flush=True)

        envelope_ok = all(
            isinstance(e, dict)
            and isinstance(e.get("id"), str)
            and isinstance(e.get("conversation_id"), str)
            and isinstance(e.get("created_at"), int)
            for e in events
        )
        print("[e2e] envelope_ok={}".format(envelope_ok), flush=True)

        types = [e.get("type") for e in events]
        has_start = "message.start" in types
        last = types[-1] if types else None
        has_terminal = last in ("message.done", "error")
        print("[e2e] has_start={} terminal={}".format(has_start, last), flush=True)

        ok = envelope_ok and has_start and has_terminal and len(events) > 0
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run_e2e()))
