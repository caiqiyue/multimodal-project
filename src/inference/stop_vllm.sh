#!/bin/bash
# Stop vLLM started by start_vllm.sh.
#
# Session 014 / feat-002 — convenience for cleanup after verification runs.

PID_FILE="${PID_FILE:-/tmp/vllm-feat-002.pid}"
PORT="${PORT:-8000}"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "stopping vLLM pid $PID"
    kill "$PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
      echo "  still alive, force-kill"
      kill -9 "$PID" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
fi

# Also kill anything still bound to the port.
if OLD_PID="$(fuser "${PORT}/tcp" 2>/dev/null)" && [ -n "$OLD_PID" ]; then
  echo "killing leftover on :$PORT: $OLD_PID"
  kill -9 $OLD_PID 2>/dev/null || true
fi

echo "vLLM stopped"