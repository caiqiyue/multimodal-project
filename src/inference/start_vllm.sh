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

# Activate conda env (start_vllm.sh may run outside an activated shell —
# e.g. via systemd, cron, or simply `bash start_vllm.sh` from $HOME).
if ! command -v python &> /dev/null; then
  if [ -f /opt/miniconda3/etc/profile.d/conda.sh ]; then
    # shellcheck disable=SC1091
    source /opt/miniconda3/etc/profile.d/conda.sh
    conda activate multimodal_ai
  else
    echo "FAIL: python not in PATH and /opt/miniconda3 not found"
    exit 1
  fi
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODEL_PATH="${MODEL_PATH:-/mnt/public/caiqiyue_file/multimodal-project/models/Qwen3-VL-2B-Instruct}"
LOG_FILE="${LOG_FILE:-/tmp/vllm-feat-002.log}"
PID_FILE="${PID_FILE:-/tmp/vllm-feat-002.pid}"
PORT="${PORT:-8000}"

# GPU selection: A6000 only (49GB). 2080 Ti is too small for Qwen3-VL-2B.
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-1}"

# System libstdc++ (6.0.30) lacks CXXABI_1.3.15+ that vLLM/PyTorch were
# linked against. Conda env ships its own libstdc++.so.6.0.35 — prepend
# its lib dir so its symbols are resolved first.
CONDA_LIB="${CONDA_PREFIX:-/opt/miniconda3/envs/multimodal_ai}/lib"
if [ -d "$CONDA_LIB" ]; then
  export LD_LIBRARY_PATH="$CONDA_LIB:${LD_LIBRARY_PATH:-}"
fi

# Disable flashinfer — the conda env ships flashinfer-python 0.6.16 which
# uses PEP 585 generic syntax (array.array[int]) that fails at import time
# with "type 'array.array' is not subscriptable". We run single-GPU with
# no tensor parallel, so vLLM's flashinfer code paths are unused.
export VLLM_USE_FLASHINFER_SAMPLER=0
export VLLM_USE_FLASHINFER_COMM=0

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
# `--gpu-memory-utilization 0.5` — paper3-server is shared with other
# tenants (sear / fedlmg_stage2 envs sometimes hold ~20 GiB on A6000).
# Setting 0.85 made vLLM refuse to start with the residual free memory;
# 0.5 (= 23.7 GiB target) leaves us enough headroom for weights (~5 GiB)
# + KV cache while not stomping on other workloads. Adjust upward if/when
# those workloads are not running.
# `--limit-mm-per-prompt` is parsed by ast.literal_eval, so the value must be
# a Python dict literal: {"image": 2, "video": 1}. Not "image=2,video=1".
# `--enable-auto-tool-choice` + `--tool-call-parser hermes` (feat-018) —
# vLLM's auto tool choice emits `<tool_call>...</tool_call>` blocks parsed by
# the hermes parser, matching Qwen3-VL's chat template. Without these flags,
# vLLM ignores the `tools=` payload from the OpenAI-compatible client and
# ChatOpenAI.bind_tools() is a silent no-op. Hermes is the documented parser
# for Qwen-family tool calls.
nohup python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL_PATH" \
  --served-model-name vlm-base \
  --host 127.0.0.1 \
  --port "$PORT" \
  --trust-remote-code \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.5 \
  --limit-mm-per-prompt '{"image": 2, "video": 1}' \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  > "$LOG_FILE" 2>&1 &

PID=$!
echo "$PID" > "$PID_FILE"
echo "vLLM started: PID=$PID"
echo "  tail log:    tail -f $LOG_FILE"
echo "  wait until:  'Application startup complete.' appears"