# Training Pipeline Runbook — V2 Launch Guide

> **目的**：让"启动训练"在 5 分钟内可执行 — 数据在哪、用什么命令、记什么指标。
> **范围**：LoRA SFT（Text + Image + Video）→ LoRA merge → Image GRPO（第一版）→ 最终 vLLM serve
> **详细 spec**：`docs/项目总执行计划.md` §9–§20（72 节路线图中的训练阶段）— 本文是它的"启动摘要版"，不重复细节。
> **生成**：2026-09-06 V2 kickoff（priority rebalance — 训练为主目标，chat 产品为 scaffolding）
> **前置假设**：服务器 `paper3-server`（Ubuntu + A6000 48GB），conda env `multimodal_ai` 已配（per `init.sh`）

---

## 0. 5 分钟启动 checklist

```bash
# 1. SSH + 工作目录
ssh paper3-server
cd /mnt/public/caiqiyue_file/multimodal-project

# 2. 激活 env
conda activate multimodal_ai

# 3. GPU 空闲（确认独占）
nvidia-smi | head -20          # A6000 应是 ~0% util；被别人占就先协调
watch -n 1 nvidia-smi          # 训练前持续观察 30s

# 4. 验证关键依赖版本
pip show torch transformers ms-swift vllm | grep -E "^(Name|Version)"

# 5. 准备数据（下面 §1）
# 6. 启动 SFT（下面 §2）— 或 GRPO（§3）
```

---

## 1. 训练数据

### 1.1 数据集位置

按 `docs/项目总执行计划.md` §11 规划：

| 类型 | 数量（第一版建议） | 位置（约定） |
|------|--------|------|
| Text SFT | 1000 | `training/data/sft/text.jsonl` |
| Image SFT | 1000 | `training/data/sft/image.jsonl` |
| Video SFT | 100~200 | `training/data/sft/video.jsonl` |
| GRPO（Image only 第一版） | 500~2000 | `training/data/grpo/image.jsonl` |

Session 004 已收集 ~22GB 数据 — 先 `ls -lh training/data/` 看现有文件分布，再按需补足。

### 1.2 SFT JSONL schema

每行一个样本（OpenAI 多模态 chat format）：

```json
{
  "messages": [
    {"role": "user",      "content": "<image>分析这张图片。"},
    {"role": "assistant", "content": "图片中..."}
  ],
  "images": ["/data/images/example.jpg"]
}
```

视频样本用 `<video>` placeholder + `videos` 数组代替 `images` 数组。

### 1.3 GRPO JSONL schema（与 SFT 不同！）

GRPO **不要**提供 assistant message — 模型自己生成，由 reward function 打分：

```json
{
  "messages": [
    {"role": "user", "content": "<image>有几个球？"}
  ],
  "images": ["/data/image.jpg"],
  "solution": "3"
}
```

`solution` 是 ground truth；reward function 用 `prediction` vs `solution` 打分。

### 1.4 Reward function（第一版：Accuracy + Format）

按 §16：

```python
# accuracy_reward：模型答对得 1.0，否则 0.0
def accuracy_reward(prediction: str, solution: str) -> float:
    return 1.0 if prediction.strip() == solution.strip() else 0.0

# format_reward：模型必须用 <answer>...</answer> 包答案
import re
def format_reward(text: str) -> float:
    return 1.0 if re.search(r"<answer>.*?</answer>", text, re.S) else 0.0
```

---

## 2. LoRA SFT（Phase 3）

### 2.1 命令（推荐第一版 hyperparams from §12）

```bash
# 命令行形式（直接跑）
swift sft \
    --model Qwen/Qwen3-VL-2B-Instruct \
    --dataset training/data/sft/train.jsonl \
    --val_dataset training/data/sft/val.jsonl \
    --tuner_type lora \
    --torch_dtype bfloat16 \
    --num_train_epochs 1 \
    --per_device_train_batch_size 1 \
    --gradient_accumulation_steps 8 \
    --learning_rate 1e-4 \
    --lora_rank 8 \
    --lora_alpha 32 \
    --target_modules all-linear \
    --freeze_vit true \
    --freeze_aligner true \
    --gradient_checkpointing true \
    --max_length 2048 \
    --output_dir training/outputs/sft
```

**或** 用 YAML config（详见 §5）：

```bash
swift sft --config configs/training/qwen3vl_sft_lora.yaml
```

### 2.2 必须记录的指标（§13）

```
train loss
eval loss
GPU VRAM (nvidia-smi)
effective batch size (= per_device * grad_accum * world_size)
learning rate
LoRA rank / alpha
image token limit
video frame count
training time (hours)
checkpoint size (GB)
```

### 2.3 V1 已落地的 start 脚本骨架

`scripts/training/start_sft.sh` — 用 env vars 模板化路径，避免硬编码：

```bash
# 用法：DATASET=/path/to/train.jsonl OUTPUT_DIR=/path/to/output ./scripts/training/start_sft.sh
# 或：先 export 再跑
```

---

## 3. Image GRPO（Phase 4 — 第一版只做 Image）

### 3.1 推荐任务（§14）

| 任务 | 数据集示例 |
|------|------|
| CLEVR | 视觉计数（几个球？） |
| 视觉计数 | RefCOCO / CountBench |
| 视觉数学 | GeoQA / MathV |
| OCR | TextVQA |
| 视觉选择题 | ScienceQA-Vision |

**必须 ground truth** — 没有 GT 的任务不能 GRPO。

### 3.2 第一轮显存策略（§17）

```yaml
num_generations: 2        # 组内生成数（从 2 起，逐步涨）
max_completion_length: 256
batch_size: 1
gradient_checkpointing: true
```

显存不够时按这个顺序降级：

1. 减 num_generations
2. 减 max_completion_length
3. 减 image tokens
4. 减 max_length
5. 暂时关闭 vLLM rollout（用 HF 推理代替）
6. 再考虑 QLoRA

### 3.3 启动

```bash
# 完整命令（参考 ms-swift 当前版本）：swift rlhf --help 先确认参数
swift rlhf \
    --rlhf_type grpo \
    --model Qwen/Qwen3-VL-2B-Instruct \
    --dataset training/data/grpo/image.jsonl \
    --reward_funcs accuracy format \
    --num_generations 2 \
    --max_completion_length 256 \
    --output_dir training/outputs/grpo
```

⚠️ **ms-swift 版本兼容性**：上面参数按 ms-swift >=4.0 写。**正式跑前先跑 `swift rlhf --help` 确认参数名**，不同 minor 版本字段可能略不同。

`scripts/training/start_grpo.sh` 已模板化路径。

### 3.4 Video GRPO：第一版不做

§18 明确说明 Qwen3-VL 当前 image rollout 路径相对成熟，video rollout 在训练端和 vLLM 端的 multimodal prompt 对齐上仍可能遇到版本相关问题。**第一版只做 Image GRPO**。

---

## 4. 模型合并（Phase 5）

```bash
swift export \
    --adapters training/outputs/grpo/YOUR_CHECKPOINT \
    --merge_lora true
```

输出到：`training/outputs/merged/qwen3-vl-final/`

---

## 5. vLLM serve 合并后模型（Phase 6）

```bash
vllm serve training/outputs/merged/qwen3-vl-final \
    --served-model-name vlm-agent-model \
    --host 127.0.0.1 \
    --port 8000 \
    --max-model-len 4096 \
    --gpu-memory-utilization 0.85 \
    --enable-prefix-caching
```

⚠️ 复用 `start_vllm.sh` 6 hardening flags（已写在 repo 根）— 把 `--model` 换成 merged path 即可。

---

## 6. Base vs SFT vs GRPO 三组评测

### 6.1 评测集约定

固定 1 份评测集（不放训练数据里），三组模型各跑一遍：

```bash
EVAL_SET=training/data/eval/holdout.jsonl

# Base
vllm serve Qwen/Qwen3-VL-2B-Instruct --served-model-name vlm-base ...
# 跑 EVAL_SET → output_base.jsonl

# SFT
vllm serve training/outputs/merged/sft-qwen3-vl-final --served-model-name vlm-sft ...
# 跑 EVAL_SET → output_sft.jsonl

# GRPO
vllm serve training/outputs/merged/qwen3-vl-final --served-model-name vlm-grpo ...
# 跑 EVAL_SET → output_grpo.jsonl
```

### 6.2 评测指标对比表（写到 evidence/）

| Model | Accuracy | Format | Latency p50 | Latency p95 | Token/s |
|-------|----------|--------|-------------|-------------|---------|
| Base  | ?        | ?      | ?           | ?           | ?       |
| SFT   | ?        | ?      | ?           | ?           | ?       |
| GRPO  | ?        | ?      | ?           | ?           | ?       |

写入 `evidence/V2-eval-{date}.md` 作 portfolio 证据。

---

## 7. 监控 + Checkpoint + Recovery

### 7.1 实时监控（训练时另一个终端）

```bash
# GPU 状态
watch -n 5 nvidia-smi

# 训练日志（swift 默认写到 output_dir/trainer_state.json + 日志文件）
tail -f training/outputs/sft/trainer.log   # 实际路径看 swift 输出

# Loss 曲线（V1 用 tensorboard；ms-swift 默认会写）
tensorboard --logdir training/outputs/sft/runs --bind 0.0.0.0 --port 6006
```

### 7.2 Checkpoint

ms-swift 默认每个 epoch 存一次 checkpoint 到 `output_dir/checkpoint-N/`。**磁盘预算**：每个 ckpt ~2-5GB（LoRA adapter），保留最近 3 个 + best。

### 7.3 失败恢复

```bash
# 从最近的 checkpoint resume
swift sft --model ... --resume_from_checkpoint training/outputs/sft/checkpoint-1000
```

### 7.4 显存 OOM 紧急降级

如果中途 OOM，按 §3.2 顺序减 `num_generations` / `max_completion_length` / `image_tokens` / `max_length`，然后 resume。

---

## 8. 故障排查速查

| 症状 | 排查 |
|------|------|
| `swift: command not found` | `conda activate multimodal_ai` — swift 是 env 内的命令 |
| CUDA OOM | §3.2 降级顺序 |
| vLLM 启动后 `/v1/models` 返 404 | 等 ~60s ready；检查 `--gpu-memory-utilization` 别太高 |
| GRPO reward 全是 0 | 检查 reward function 输入格式；看 `swift rlhf` 文档的 `reward_funcs` 入参 |
| 数据集加载失败 | 检查 JSONL schema（§1.2/§1.3）；ms-swift 严格要求 `<image>` / `<video>` placeholder |

---

## 9. 后续 phase（V2+ 不在本 runbook）

- V2.1：FastAPI `/agent/invoke` 接 merged 模型（已实现，V1 改 `vllm_model` env var 即可）
- V2.2：Base vs SFT vs GRPO 三组 A/B eval（§6）
- V3：Video GRPO（待 Qwen3-VL + ms-swift + vLLM 版本稳定）

---

## 10. 引用

- `docs/项目总执行计划.md` §9（安装）+ §11（SFT 数据）+ §12（SFT 命令）+ §13（指标）+ §14–§18（GRPO）+ §19（merge）+ §20（vLLM）
- `init.sh` — conda env 配 + baseline 检查
- `start_vllm.sh` — 6 hardening flags（Qwen3-VL + tool calling）
- 复用 `backend/app/core/config.py::Settings.vllm_*` — 训练完切真模型无需改代码
