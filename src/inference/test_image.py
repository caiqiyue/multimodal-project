"""Smoke test: image caption via vLLM-served Qwen3-VL-2B.

Session 014 / feat-002 — verify the base model produces a detailed caption
for an image, sent through vLLM's OpenAI-compatible /v1/chat/completions
using the `image_url` multimodal content type.

Run on paper3-server, after vLLM is up:

    python src/inference/test_image.py
    # or with a custom image:
    TEST_IMAGE_PATH=/path/to/test.jpg python src/inference/test_image.py

Default sample image (committed in repo):
    clients/mobile-app/assets/icon.png    — a small monogram, ~512×512

Exit code:
    0 — response is non-empty
    1 — vLLM unreachable, image not found, or response empty
"""
from __future__ import annotations

import base64
import os
import sys

from openai import OpenAI

BASE = os.environ.get("VLLM_BASE", "http://127.0.0.1:8000/v1")
MODEL = os.environ.get("VLLM_MODEL", "vlm-base")
REPO_ROOT = os.environ.get(
    "REPO_ROOT",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
IMAGE_PATH = os.environ.get(
    "TEST_IMAGE_PATH",
    os.path.join(REPO_ROOT, "clients", "mobile-app", "assets", "icon.png"),
)

if not os.path.isfile(IMAGE_PATH):
    print(f"FAIL: image not found: {IMAGE_PATH}")
    sys.exit(1)

with open(IMAGE_PATH, "rb") as fh:
    img_b64 = base64.b64encode(fh.read()).decode("ascii")
img_url = f"data:image/png;base64,{img_b64}"

client = OpenAI(base_url=BASE, api_key="EMPTY")

try:
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": img_url},
                    },
                    {
                        "type": "text",
                        "text": (
                            "用中文详细描述这张图片. 包括形状, 颜色, "
                            "构图, 以及任何可识别的元素 (文字/图标/符号). "
                            "如未识别到具体内容, 请如实说明."
                        ),
                    },
                ],
            },
        ],
        max_tokens=300,
        temperature=0.3,
    )
except Exception as exc:  # noqa: BLE001
    print(f"FAIL: chat.completions raised {type(exc).__name__}: {exc}")
    sys.exit(1)

content = resp.choices[0].message.content or ""
usage = resp.usage

print(f"=== image caption ({IMAGE_PATH}) ===")
print(content)
print(f"=== tokens used: total={usage.total_tokens} "
      f"(prompt={usage.prompt_tokens}, completion={usage.completion_tokens}) ===")

if not content.strip():
    print("FAIL: empty response")
    sys.exit(1)

if len(content.strip()) < 20:
    print(f"WARN: caption very short ({len(content.strip())} chars) — "
          "may indicate image content not understood")

if not any("一" <= ch <= "鿿" for ch in content):
    print("INFO: no CJK chars in response (model may have replied in English)")

print("OK")