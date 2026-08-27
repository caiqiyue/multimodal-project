"""Smoke test: video brief description via vLLM-served Qwen3-VL-2B.

Session 014 / feat-002 — verify the base model produces a brief description
of a short synthetic video, sent through vLLM's OpenAI-compatible
/v1/chat/completions using the `video_url` multimodal content type.

To keep the repo lean, this script generates its own sample video in /tmp
(a 16-frame ~2-second clip of a red square moving across a gray field —
chosen so the motion is unambiguous and easy for the model to describe).
No asset files are committed.

Run on paper3-server, after vLLM is up:

    python src/inference/test_video.py

Exit code:
    0 — response is non-empty
    1 — video generation failed, vLLM unreachable, or response empty
"""
from __future__ import annotations

import base64
import os
import sys
import tempfile

import imageio.v2 as imageio  # imageio with v2 API for backwards compat
import numpy as np
from openai import OpenAI

BASE = os.environ.get("VLLM_BASE", "http://127.0.0.1:8000/v1")
MODEL = os.environ.get("VLLM_MODEL", "vlm-base")


def _make_sample_video(path: str) -> tuple[int, int, int]:
    """Write a synthetic clip; return (num_frames, height, width)."""
    h, w = 240, 320
    num_frames = 16
    writer = imageio.get_writer(path, fps=8, codec="libx264")
    try:
        for i in range(num_frames):
            frame = np.full((h, w, 3), 110, dtype=np.uint8)  # mid-gray
            x = int(20 + (i * 18) % (w - 60))
            frame[80:160, x : x + 40, :] = (220, 40, 40)  # red square
            writer.append_data(frame)
    finally:
        writer.close()
    return num_frames, h, w


tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
tmp.close()
try:
    n_frames, h, w = _make_sample_video(tmp.name)
    print(f"generated sample video: {tmp.name} ({n_frames} frames @ {w}x{h})")

    with open(tmp.name, "rb") as fh:
        vid_b64 = base64.b64encode(fh.read()).decode("ascii")
    vid_url = f"data:video/mp4;base64,{vid_b64}"

    client = OpenAI(base_url=BASE, api_key="EMPTY")

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "video_url",
                            "video_url": {"url": vid_url},
                        },
                        {
                            "type": "text",
                            "text": (
                                "用中文简要描述这段视频里发生的事情. "
                                "包括主体物体的颜色, 运动方向, 以及背景."
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

    print(f"=== video brief description ({n_frames} frames) ===")
    print(content)
    print(f"=== tokens used: total={usage.total_tokens} "
          f"(prompt={usage.prompt_tokens}, completion={usage.completion_tokens}) ===")

    if not content.strip():
        print("FAIL: empty response")
        sys.exit(1)

    if len(content.strip()) < 15:
        print(f"WARN: description very short ({len(content.strip())} chars)")

    if not any("一" <= ch <= "鿿" for ch in content):
        print("INFO: no CJK chars in response (model may have replied in English)")

    print("OK")
finally:
    try:
        os.unlink(tmp.name)
    except OSError:
        pass