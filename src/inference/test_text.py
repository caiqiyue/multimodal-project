"""Smoke test: text-only chat completion against vLLM-served Qwen3-VL-2B.

Session 014 / feat-002 — verify the base model produces a coherent Chinese
explanation through vLLM's OpenAI-compatible endpoint.

Run on paper3-server, after `bash src/inference/start_vllm.sh` has reached
"Application startup complete.":

    python src/inference/test_text.py

Exit code:
    0 — response is non-empty
    1 — vLLM unreachable, response empty, or model not loaded

Environment overrides:
    VLLM_BASE   default http://127.0.0.1:8000/v1
    VLLM_MODEL  default vlm-base
"""
from __future__ import annotations

import os
import sys

from openai import OpenAI

BASE = os.environ.get("VLLM_BASE", "http://127.0.0.1:8000/v1")
MODEL = os.environ.get("VLLM_MODEL", "vlm-base")

client = OpenAI(base_url=BASE, api_key="EMPTY")

try:
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": "你是一个 helpful 助手, 用中文回答. 简洁, 不超过三句话.",
            },
            {
                "role": "user",
                "content": "用一句话解释 Transformer 架构的核心思想.",
            },
        ],
        max_tokens=200,
        temperature=0.3,
    )
except Exception as exc:  # noqa: BLE001 — top-level smoke, fail loud
    print(f"FAIL: chat.completions raised {type(exc).__name__}: {exc}")
    sys.exit(1)

content = resp.choices[0].message.content or ""
usage = resp.usage

print("=== text completion ===")
print(content)
print(f"=== tokens used: total={usage.total_tokens} "
      f"(prompt={usage.prompt_tokens}, completion={usage.completion_tokens}) ===")

if not content.strip():
    print("FAIL: empty response")
    sys.exit(1)

if len(content.strip()) < 5:
    print(f"WARN: response very short ({len(content.strip())} chars)")

# Soft check: response should contain CJK chars (model is multilingual;
# a pure-English reply is acceptable but worth flagging).
if not any("一" <= ch <= "鿿" for ch in content):
    print("INFO: no CJK chars in response (model may have replied in English)")

print("OK")