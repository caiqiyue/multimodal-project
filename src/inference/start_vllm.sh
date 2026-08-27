#!/bin/bash
# Start vLLM with Qwen3-VL-2B-Instruct on 127.0.0.1:8000 in background.
#
# Session 014 / feat-002 — base model serve + multimodal verification.
#
# Required environment:
#   - conda env `multimodal_ai` active (init.sh §1)
#   - A6000 (49GB) available — Qwen3-VL-2B + vision encoder + KV cache
#     cannot fit on 2080 Ti (11GB). We force CUDA_VISIBLE_DEVICES=1.
#   - CUDA_DEVICE_ORDER=PCI_BUS_ID so torch sees GPU 1=A6000 (not 2080 Ti).
#
# Logs to /tmp/vllm-feat-002.log
# Writes PID to /tmp/vllm-feat-002.pid
# Stops prior instance on the same port (best-effort).
#
# Usage (on paper3-server, from repo root):
#   bash src/inference/start_vllm.sh
#   # wait for "Application startup complete." in $LOG_FILE
#   python src/inference/test_text.py
#   python src/inference/test_image.py
#   python src/inference/test_video.py
#   bash src/inference/stop_vllm.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODEL_PATH="${MODEL_PATH:-/mnt/public/caiqiyue_file/multimodal-project/models/Qwen3-VL-2B-Instruct}"
LOG_FILE="${LOG_FILE:-/tmp/vllm-feat-002.log}"
PID_FILE="${PID_FILE:-/tmp/vllm-feat-002.pid}"
PORT="${PORT:-8000}"

# GPU selection: A6000 only (49GB). 2080 Ti is too small for Qwen3-VL-2B.
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-1}"

# Best-effort kill of any prior vLLM on this port.
if OLD_PID="$(fuser "${PORT}/tcp" 2>/dev/null)" && [ -n "$OLD_PID" ]; then
  echo "killing prior vLLM pid(s) on :$PORT: $OLD_PID"
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
fi
# Also kill by recorded pid file, if stale.
if [ -f "$PID_FILE" ]; then
  OLD=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    echo "killing prior vLLM pid from $PID_FILE: $OLD"
    kill -9 "$OLD" 2>/dev/null || true
    sleep 1
  fi
fi

if [ ! -d "$MODEL_PATH" ]; then
  echo "FAIL: model not found at $MODEL_PATH"
  exit 1
fi

echo "starting vLLM:"
echo "  model:        $MODEL_PATH"
echo "  served-name:  vlm-base"
echo "  host:port:    127.0.0.1:$PORT"
echo "  gpu:          CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
echo "  log:          $LOG_FILE"
echo "  pid file:     $PID_FILE"

# `--trust-remote-code` is required for Qwen3-VL's custom model code.
# `--max-model-len 8192` is plenty for V1 chat (Qwen3-VL default is 40960).
# `--gpu-memory-utilization 0.85` leaves headroom for KV cache growth.
# `--limit-mm-per-prompt image=2,video=1` keeps VRAM predictable for video test.
nohup python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL_PATH" \
  --served-model-name vlm-base \
  --host 127.0.0.1 \
  --port "$PORT" \
  --trust-remote-code \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.85 \
  --limit-mm-per-prompt image=2,video=1 \
  > "$LOG_FILE" 2>&1 &

PID=$!
echo "$PID" > "$PID_FILE"
echo "vLLM started: PID=$PID"
echo "  tail log:    tail -f $LOG_FILE"
echo "  wait until:  'Application startup complete.' appears"