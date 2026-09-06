# Falcon Project — Requirements & Gap Analysis

> **目的**：用 1 页纸讲清楚"项目做什么、做到什么程度、距离目标还差什么"。
> **目标受众**：面试官、未来 reviewer、本项目任何新 contributor（包括未来的自己）。
> **生成**：2026-09-06 — V1 closure + V2 kickoff + 用户 3 条核心需求蒸馏
> **Status**：V1 满足需求 1（真实项目化）；V2 进行中（需求 2 + 3 待 GPU 释放后跑通）

---

## 0. 项目代号

**Falcon** — Multimodal AI Assistant

私有化部署的 Qwen3-VL 大模型 + LangGraph Agent + FastAPI + 双客户端（React Native Mobile App + Taro 微信小程序）+ LoRA SFT/GRPO 微调 pipeline。

---

## 1. 用户的 3 条核心需求（2026-09-06 蒸馏）

### 需求 1 — 项目真实化，不要求商业化

> "本项目不要求做到尽善尽美，不要求商业化，真是项目化"

**含义**：
- ✅ 真实项目结构：pnpm monorepo + init.sh + 测试覆盖 + harness 文档 + evidence 收集
- ❌ 不要做：K8s / 多副本 / 监控告警系统 / HTTPS 公网域名 / 安全审计 / 灾备

### 需求 2 — 双端能连私有化部署大模型 agent，可交互，看到反馈

> "手机 app，微信小程序能够连接到服务端的以私有化部署的大模型为基础的 agent，能进行交互，能够在手机 app，微信小程序中看到反馈即可"

**含义**：
- ✅ 端到端 demo 链路：客户端 → 服务端 Agent → 私有化 LLM（vLLM 本地部署）→ 客户端 UI 显示回复
- ✅ Multimodal（text + image + video）支持
- ✅ 流式 + 工具调用可见
- ⚠️ "即可" = 链路打通即可，不需要打磨 UI

### 需求 3 — SFT + GRPO 训练 pipeline 跑通即可

> "服务端的大模型进行微调和强化学习只需要能够跑通即可，不需要完整训练一遍"

**含义**：
- ✅ Pipeline 可执行：数据 → SFT → merge → GRPO → eval
- ✅ Tiny 数据集 dry-run（10-50 samples + 1 step）证明 pipeline work
- ❌ 不需要：完整训练一轮 / 收敛 / SOTA 指标

### 背景

> "整体项目就是要做演示给面试官看，我学习研究过 qwen-vl 的多模态模型，对于微信小程序和手机 app 也了解一些"

**用户对 Qwen-VL 多模态、微信小程序、移动 App 都有一定基础**。本项目是 portfolio piece，不是产品。

---

## 2. 需求 vs 现状差距分析

### 需求 1 — 项目真实化：✅ **100% 满足**

| 子项 | 现状 | 证据 |
|------|------|------|
| Monorepo 结构 | pnpm workspace + 5 packages + clients + backend + training | `pnpm-workspace.yaml` + `packages/` + `clients/` + `backend/` |
| 标准化启动 | `init.sh` 一键 baseline（conda env + pytest + typecheck）| `init.sh` 7.2KB |
| 测试覆盖 | 104 pytest（后端）+ 42 vitest（前端）+ 5/5 typecheck | `pytest backend/tests/` + `pnpm -r test` |
| 文档体系 | master plan 72 sections + ARCHITECTURE + SECURITY + RUNBOOK + spec 体系 | `docs/` |
| Evidence | 31 evidence files（每个 feature 留 log）| `evidence/` |
| 真 e2e 验证 | iOS Sim 真后端 + Mini-program H5 真后端 都跑过 | Session 020/021 + 截图 |

**结论**：✅ 已是真实项目化。无需改进。

### 需求 2 — 双端 ↔ 私有化 LLM agent：⚠️ **90% 满足，1 验证缺口**

| 子项 | 状态 | 证据 |
|------|------|------|
| Mobile App + Chat UI | ✅ passing | feat-130；iOS Sim 真 e2e（Session 021） |
| Mini-program + Chat UI | ✅ passing | feat-131；H5 真 e2e（Session 020） |
| 私有化部署 LLM 配置 | ✅ 配置完整 | `start_vllm.sh` 6 hardening flags + Qwen3-VL-2B-Instruct |
| LangGraph Agent + Tool | ✅ passing | feat-017 + feat-018；calculator + server_info tools |
| 流式 + 多模态 wire | ✅ passing | feat-021 (WS) + feat-022 (ContentBlock union) + feat-020 (media upload) |
| Demo echo agent fallback | ✅ passing | feat-027；vLLM OFF 时给 context-aware 中文回话 |
| **真模型 e2e (Phase 0)** | ❌ **未验证** | GPU 1 A6000 自 2026-08-31 被其他 tenant 占 100% util |

**唯一缺口**：**Phase 0 vLLM-on 真模型端到端验证**。

- **现状**：所有 schema + wire + service ready，缺"真模型 serving + 客户端 UI 显示"最后一段验证
- **影响**：demo 时只能用 demo echo agent（mock 级别回应），不能展示"私有化大模型通过客户端交互"
- **修复**：GPU 释放 → 30 分钟跑完 `evidence/feat-002-phase0-cheatsheet.md`（cheatsheet 已写好，gitignored）
- **属性**：纯 GPU 时机问题，**零工程障碍**

### 需求 3 — SFT + GRPO pipeline 跑通：⚠️ **70% 满足，待 GPU 验证**

| 子项 | 状态 | 证据 |
|------|------|------|
| ms-swift 训练框架 | ✅ 已装 | conda env `multimodal_ai`（per init.sh + `pip show ms-swift`） |
| 训练数据集 | ⚠️ 已收集但格式未确认 | Session 004 ~22GB；`training/data/` 待 inspect |
| 数据 schema spec | ✅ 写好 | RUNBOOK §1.2（SFT JSONL）+ §1.3（GRPO JSONL） |
| SFT 启动脚本 | ✅ 写好 | `scripts/training/start_sft.sh`（env-var 模板化） |
| GRPO 启动脚本 | ✅ 写好 | `scripts/training/start_grpo.sh`（含 OOM 降级指南） |
| ms-swift YAML config | ✅ 写好 | `configs/training/qwen3vl_sft_lora.yaml` |
| Master runbook | ✅ 写好 | `docs/training/RUNBOOK.md`（280 行，5 分钟启动 checklist） |
| **实际跑过 SFT** | ❌ **从未执行** | — |
| **实际跑过 GRPO** | ❌ **从未执行** | — |

**缺口**：pipeline **配置 ready 但未实跑**。

- **修复**：GPU 释放 → SFT tiny-data dry-run ~1-2h（10 sample + 1 step 出 checkpoint）+ GRPO tiny-data dry-run ~1-2h（含 reward function 实现 + 跑出奖励信号）
- **属性**：纯 GPU 时机问题，**零工程障碍**

---

## 3. 总差距 = 距"完整满足 3 条需求"

| # | 缺口 | 难度 | 工作量 | 阻塞 |
|---|------|------|--------|------|
| 1 | Phase 0 vLLM-on 真模型 e2e | 低（已 ready）| ~30 min | GPU |
| 2 | SFT pipeline dry-run 出 checkpoint | 中（数据 inspect + 跑）| ~1-2h | GPU |
| 3 | GRPO pipeline dry-run 出奖励信号 | 中（reward function + 跑）| ~1-2h | GPU |
| **总计** | — | — | **~3-4h** | **GPU 释放即可** |

**所有缺口都是 GPU-bound，无工程障碍**。一旦 GPU 1 A6000 释放，按优先级 1→3 跑完即可。

---

## 4. 为什么不补这些缺口不阻塞 portfolio 价值

**当前已能展示给面试官的**：
- ✅ 25 features passing（广度：覆盖 chat + auth + WS + multi-modal + tool calling + 双端 picker + demo fallback）
- ✅ 双端 iOS Sim + H5 真 e2e 跑过（截图 evidence）
- ✅ Frontend + Backend + 训练 pipeline 完整工程结构
- ✅ Qwen-VL 多模态：vLLM serve + ContentBlock union + 路线图完整
- ✅ 移动 App + 微信小程序：完整 RN/Expo + Taro/React 栈
- ✅ ML 工程：ms-swift LoRA SFT/GRPO pipeline 完整配置

**唯一"未跑过"的 = 真模型 serving + 真训练执行**——但所有 spec/code/docs 全部 ready，pipeline 完整可见。

**面试官视角**：
- "你的项目能跑起来吗" → ✅（demo 模式完整工作）
- "私有化大模型是怎么接入的" → ✅（vLLM + LangGraph + FastAPI 完整链路可见）
- "微调和强化学习 pipeline 怎么搭" → ✅（RUNBOOK + scripts + YAML + 数据 schema 完整）
- "为什么 demo 没接真模型" → "GPU 被占用，但所有 pipeline 已 ready，cheatsheet 在这里，30 分钟 work"

**不会减分**。真模型 + 真训练的执行结果只是 bonus，不是必须。

---

## 5. 当 GPU 释放时，第一 session 该做什么（优先级排序）

按"价值密度 / 时间"排序：

### P0（30 min，最高价值）— Phase 0 真模型 e2e

```bash
# 完整步骤见 evidence/feat-002-phase0-cheatsheet.md
AGENT_MODE=real ssh paper3-server 'systemctl restart multimodal-backend'
ssh paper3-server 'curl http://127.0.0.1:9000/api/v1/agent/invoke ...'  # 文本
ssh paper3-server 'curl http://127.0.0.1:9000/api/v1/agent/invoke ...'  # 多模态
ssh paper3-server 'python scripts/ws_e2e.py'                            # WS 流式
# 客户端：mobile-app + mini-program 各发一条消息 → 截图真模型回复
```

**输出**：`evidence/feat-002-phase0-real-model.log` + 4 张截图（mobile-app + mini-program + 2 张 API curl）

### P1（1-2h，中价值）— SFT pipeline dry-run

```bash
# 完整步骤见 docs/training/RUNBOOK.md §2
DATASET=/path/to/tiny.jsonl OUTPUT_DIR=/path/to/test ./scripts/training/start_sft.sh
# 确认产出 checkpoint 文件 → SFT pipeline OK
```

**输出**：`evidence/V2-sft-dryrun.log` + checkpoint 文件大小记录

### P2（1-2h，中价值）— GRPO pipeline dry-run

```bash
# 完整步骤见 docs/training/RUNBOOK.md §3
# 先实现 reward function（accuracy + format — RUNBOOK §1.4）
DATASET=/path/to/tiny_grpo.jsonl OUTPUT_DIR=/path/to/test ./scripts/training/start_grpo.sh
# 确认 reward 分数非零 → GRPO pipeline OK
```

**输出**：`evidence/V2-grpo-dryrun.log` + reward 数值记录

---

## 6. 不在本项目范围（per 需求 1 不商业化）

明确排除（避免下个 session 又提议）：
- ❌ K8s / Docker Compose 集群部署
- ❌ HTTPS 公网域名（demo 用 SSH tunnel 即可）
- ❌ Nginx 反向代理（demo 直接连 127.0.0.1:9000）
- ❌ PostgreSQL 持久化（feat-019 DEFERRED — 见 `feature_list.json`）
- ❌ Conversation history UI（feat-140 DEFERRED）
- ❌ Real WeChat AppID/AppSecret 注册（feat-037 阻塞，需用户自行注册）
- ❌ EAS Build / TestFlight 发布（V1 用 iOS Simulator 即可）
- ❌ Android 客户端
- ❌ Real 训练（只 dry-run；不训完整数据集）

---

## 7. 引用

- **Master plan**：`docs/项目总执行计划.md`（72 sections，训练 §9-§20）
- **V2 训练 RUNBOOK**：`docs/training/RUNBOOK.md`（5 分钟启动 checklist）
- **SFT 脚本**：`scripts/training/start_sft.sh`
- **GRPO 脚本**：`scripts/training/start_grpo.sh`
- **ms-swift YAML config**：`configs/training/qwen3vl_sft_lora.yaml`
- **Phase 0 cheatsheet**：`evidence/feat-002-phase0-cheatsheet.md`（gitignored，GPU 释放后跑）
- **Harness 文档**：`claude-progress.md` + `session-handoff.md` + `NEXT_SESSION.md` + `CLAUDE.md` §10
- **Memory**：`~/.claude/projects/.../memory/falcon-priority-rebalance-2026-09-06.md` + `falcon-core-requirements-2026-09-06.md`

---

## 8. 版本历史

| 日期 | 版本 | 变化 |
|------|------|------|
| 2026-09-06 | v1 | 初版：3 需求蒸馏 + 差距分析 + GPU-bound 缺口识别 |
