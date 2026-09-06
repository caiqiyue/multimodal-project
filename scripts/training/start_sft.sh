#!/bin/bash
# start_sft.sh — LoRA SFT 启动骨架（Qwen3-VL-2B-Instruct）
#
# 用法：
#   export DATASET=/path/to/train.jsonl
#   export VAL_DATASET=/path/to/val.jsonl
#   export OUTPUT_DIR=/path/to/output
#   ./scripts/training/start_sft.sh
#
# 或一次性：
#   DATASET=... VAL_DATASET=... OUTPUT_DIR=... ./scripts/training/start_sft.sh
#
# 前置：
#   - conda activate multimodal_ai
#   - GPU 空闲（nvidia-smi 检查）
#   - 数据集已按 RUNBOOK §1.2 准备
#
# 参考：
#   - RUNBOOK §2.1
#   - docs/项目总执行计划.md §12
#
# ⚠️ 正式跑前先 `swift sft --help` 确认 ms-swift 当前版本参数名
# ⚠️ 本脚本是骨架；具体 lora_rank / learning_rate / num_train_epochs 按数据规模调

set -euo pipefail

# ===== Required env vars (with sensible defaults) =====
MODEL="${MODEL:-Qwen/Qwen3-VL-2B-Instruct}"
DATASET="${DATASET:-training/data/sft/train.jsonl}"
VAL_DATASET="${VAL_DATASET:-training/data/sft/val.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-training/outputs/sft}"
LORA_RANK="${LORA_RANK:-8}"
LORA_ALPHA="${LORA_ALPHA:-32}"
LEARNING_RATE="${LEARNING_RATE:-1e-4}"
NUM_EPOCHS="${NUM_EPOCHS:-1}"
PER_DEVICE_BATCH="${PER_DEVICE_BATCH:-1}"
GRAD_ACCUM="${GRAD_ACCUM:-8}"
MAX_LENGTH="${MAX_LENGTH:-2048}"

# ===== Sanity check =====
if [[ ! -f "$DATASET" ]]; then
    echo "ERROR: DATASET file not found: $DATASET" >&2
    echo "  Set DATASET env var or create the file (see RUNBOOK §1.2 for schema)" >&2
    exit 1
fi

if [[ ! -f "$VAL_DATASET" ]]; then
    echo "WARN: VAL_DATASET not found: $VAL_DATASET — training without eval"
fi

if ! command -v swift >/dev/null 2>&1; then
    echo "ERROR: swift command not found. Run: conda activate multimodal_ai" >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "=== LoRA SFT 启动 ==="
echo "  MODEL:        $MODEL"
echo "  DATASET:      $DATASET"
echo "  VAL_DATASET:  $VAL_DATASET"
echo "  OUTPUT_DIR:   $OUTPUT_DIR"
echo "  LORA_RANK:    $LORA_RANK"
echo "  LORA_ALPHA:   $LORA_ALPHA"
echo "  LR:           $LEARNING_RATE"
echo "  EPOCHS:       $NUM_EPOCHS"
echo "  BATCH:        $PER_DEVICE_BATCH x $GRAD_ACCUM"
echo "  MAX_LENGTH:   $MAX_LENGTH"
echo

swift sft \
    --model "$MODEL" \
    --dataset "$DATASET" \
    --val_dataset "$VAL_DATASET" \
    --tuner_type lora \
    --torch_dtype bfloat16 \
    --num_train_epochs "$NUM_EPOCHS" \
    --per_device_train_batch_size "$PER_DEVICE_BATCH" \
    --gradient_accumulation_steps "$GRAD_ACCUM" \
    --learning_rate "$LEARNING_RATE" \
    --lora_rank "$LORA_RANK" \
    --lora_alpha "$LORA_ALPHA" \
    --target_modules all-linear \
    --freeze_vit true \
    --freeze_aligner true \
    --gradient_checkpointing true \
    --max_length "$MAX_LENGTH" \
    --output_dir "$OUTPUT_DIR" \
    "$@"

echo
echo "=== SFT 训练完成 ==="
echo "  LoRA adapter: $OUTPUT_DIR"
echo "  下一步：合并 LoRA + vLLM serve"
echo "    swift export --adapters $OUTPUT_DIR/best --merge_lora true"
