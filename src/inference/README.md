# src/inference — vLLM serve + multimodal smoke tests

Session 014 / **feat-002**: Serve base Qwen3-VL-2B-Instruct via vLLM on
`127.0.0.1:8000` and verify text / image / video all produce coherent
responses.

> Scope: base model only. No SFT, no GRPO, no fine-tuned adapter. This is
> the prerequisite for any downstream training (feat-003 onwards) and for
> the agent layer (feat-017).

## Files

| File | Purpose |
|------|---------|
| `start_vllm.sh` | Background launcher. Forces A6000 (`CUDA_VISIBLE_DEVICES=1`) + `CUDA_DEVICE_ORDER=PCI_BUS_ID`, kills any prior vLLM, logs to `/tmp/vllm-feat-002.log`. |
| `stop_vllm.sh` | Cleanup. Kills the PID file, fuser fallback. |
| `test_text.py` | OpenAI-compat chat completion, text-only prompt about Transformer. Expects ≥1 Chinese response line. |
| `test_image.py` | OpenAI-compat chat completion with `image_url` content type. Reads `clients/mobile-app/assets/icon.png` (overridable via `TEST_IMAGE_PATH`). |
| `test_video.py` | Generates a 16-frame synthetic mp4 (red square moving on gray) in /tmp, sends via `video_url`. |

## Usage (on paper3-server)

```bash
cd /mnt/public/caiqiyue_file/multimodal-project

# 1. confirm baseline (init.sh) is healthy
bash init.sh    # check: conda env active, model present, GPU visible

# 2. start vLLM in background
bash src/inference/start_vllm.sh
# tail -f /tmp/vllm-feat-002.log
# wait for "Application startup complete." (typically 60-90 s for Qwen3-VL-2B)

# 3. verify model is registered
curl -s http://127.0.0.1:8000/v1/models | jq

# 4. run the three smoke tests
python src/inference/test_text.py
python src/inference/test_image.py
python src/inference/test_video.py

# 5. cleanup
bash src/inference/stop_vllm.sh
```

## Hardware notes

- **GPU**: must run on A6000 (49GB). The 2080 Ti (11GB) cannot hold
  Qwen3-VL-2B + vision encoder + KV cache. `start_vllm.sh` hard-codes
  `CUDA_VISIBLE_DEVICES=1` — change to `0` only if you've moved to a
  single-GPU machine.
- **VRAM headroom**: `--gpu-memory-utilization 0.85` leaves 15% for
  fragmentation; safe with A6000's 49GB.
- **`--max-model-len 8192`**: enough for chat + image + short video.
  Qwen3-VL's full 40960 context needs KV cache growth we don't need
  for V1 verification.

## What this verifies

Per `feature_list.json` → feat-002 verification:

- ✅ vLLM starts with `--served-model-name vlm-base` in background
- ✅ `GET /v1/models` returns `vlm-base`
- ✅ `test_text.py` → coherent Chinese completion
- ✅ `test_image.py` → image caption (length ≥ 20 chars sanity)
- ✅ `test_video.py` → video description (length ≥ 15 chars sanity)
- ✅ Cleanup via `stop_vllm.sh`

Pass conditions are intentionally soft (`>= 10/20/15 chars`, optional
CJK check) — we're verifying vLLM's Qwen3-VL multimodal pipeline
actually works end-to-end against a real model, not asserting content
correctness (that's feat-005's job).

## Dependencies

All already installed via `init.sh` / `requirements.txt`:

- `vllm==0.27.1`
- `openai==3.3.1` (Python client)
- `Pillow` + `numpy` (for test_video synthetic frames)
- `imageio[ffmpeg]` (mp4 writer)

## Refs

- `feature_list.json` → feat-002
- `docs/项目总执行计划.md` §10 (Stage A inference)
- `docs/服务器运维手册.md` §3.3 (GPU 分配) + §12.3 (A6000 recommendation)