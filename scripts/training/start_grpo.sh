#!/bin/bash
# start_grpo.sh — Image GRPO 启动骨架（Qwen3-VL-2B-Instruct）
#
# 用法：
#   export DATASET=/path/to/grpo.jsonl
#   export OUTPUT_DIR=/path/to/output
#   ./scripts/training/start_grpo.sh
#
# 或一次性：
#   DATASET=... OUTPUT_DIR=... ./scripts/training/start_grpo.sh
#
# 前置：
#   - conda activate multimodal_ai
#   - GPU 空闲（nvidia-smi 检查）
#   - 数据集已按 RUNBOOK §1.3 准备（messages + images + solution）
#   - reward function（RUNBOOK §1.4）已写
#
# 第一版只做 Image GRPO（Video GRPO 暂不做 — RUNBOOK §3.4）
#
# 参考：
#   - RUNBOOK §3
#   - docs/项目总执行计划.md §14–§18
#
# ⚠️ 正式跑前先 `swift rlhf --help` 确认 ms-swift 当前版本参数名
# ⚠️ GRPO 显存需求比 SFT 大很多 — 先按 §3.2 第一轮配置（num_generations=2）跑通再调

set -euo pipefail

# ===== Required env vars (with sensible defaults) =====
MODEL="${MODEL:-Qwen/Qwen3-VL-2B-Instruct}"
DATASET="${DATASET:-training/data/grpo/image.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-training/outputs/grpo}"
NUM_GENERATIONS="${NUM_GENERATIONS:-2}"
MAX_COMPLETION_LENGTH="${MAX_COMPLETION_LENGTH:-256}"
PER_DEVICE_BATCH="${PER_DEVICE_BATCH:-1}"
GRAD_ACCUM="${GRAD_ACCUM:-8}"
LEARNING_RATE="${LEARNING_RATE:-1e-6}"
REWARD_FUNCS="${REWARD_FUNCS:-accuracy format}"
LORA_RANK="${LORA_RANK:-8}"

# ===== Sanity check =====
if [[ ! -f "$DATASET" ]]; then
    echo "ERROR: DATASET file not found: $DATASET" >&2
    echo "  Set DATASET env var or create the file (see RUNBOOK §1.3 for schema)" >&2
    exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
    echo "ERROR: swift command not found. Run: conda activate multimodal_ai" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "=== Image GRPO 启动 ==="
echo "  MODEL:                $MODEL"
echo "  DATASET:              $DATASET"
echo "  OUTPUT_DIR:           $OUTPUT_DIR"
echo "  NUM_GENERATIONS:      $NUM_GENERATIONS"
echo "  MAX_COMPLETION_LEN:   $MAX_COMPLETION_LENGTH"
echo "  REWARD_FUNCS:         $REWARD_FUNCS"
echo "  LR:                   $LEARNING_RATE"
echo
echo "  ⚠️ 显存策略按 RUNBOOK §3.2 第一轮:"
echo "    num_generations=2, max_completion_length=256, grad_ckpt=true"
echo "  ⚠️ OOM 时按以下顺序降级:"
echo "    1. 减 num_generations  2. 减 max_completion_length  3. 减 image tokens"
echo "    4. 减 max_length  5. 关 vLLM rollout  6. 改 QLoRA"
echo

swift rlhf \
    --rlhf_type grpo \
    --model "$MODEL" \
    --dataset "$DATASET" \
    --reward_funcs $REWARD_FUNCS \
    --num_generations "$NUM_GENERATIONS" \
    --max_completion_length "$MAX_COMPLETION_LENGTH" \
    --per_device_train_batch_size "$PER_DEVICE_BATCH" \
    --gradient_accumulation_steps "$GRAD_ACCUM" \
    --learning_rate "$LEARNING_RATE" \
    --lora_rank "$LORA_RANK" \
    --gradient_checkpointing true \
    --output_dir "$OUTPUT_DIR" \
    "$@"

echo
echo "=== GRPO 训练完成 ==="
echo "  LoRA adapter: $OUTPUT_DIR"
echo "  下一步：合并 LoRA + vLLM serve"
echo "    swift export --adapters $OUTPUT_DIR/best --merge_lora true"
echo "  评测：Base vs SFT vs GRPO 三组对比 — RUNBOOK §6"
