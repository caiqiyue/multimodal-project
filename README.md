# Multimodal AI Assistant（多模态 AI 助手）

> **本项目是一个端到端的多模态 AI 助手产品**：从模型训练（SFT + GRPO）→ vLLM 推理 → LangGraph Agent 编排 → FastAPI + WebSocket 后端 → Nginx + HTTPS 公网网关 → React Native 移动 App + Taro 微信小程序双客户端。
>
> **核心模型**：Qwen3-VL-2B（视觉理解/中文/3 模态：text + image + video）
>
> **代码同步原则**：本地修改 → push 到 GitHub → SSH 进服务器 → 服务器 pull。**禁止任何形式的本地 → 服务器直接文件传输**（scp/rsync/SFTP/WebDAV/NFS/SMB/VS Code Remote-SSH 直传）。详见 `CLAUDE.md` §1。

---

## 1. 这是什么

`multimodal-project` 是一个**学习为主 / 全栈交付**的项目，目标是跑通"训练 → 推理 → 服务 → 上线"的完整链路：

1. **训练侧**：在 Qwen3-VL-2B-Instruct 基础上，用 LoRA 做 SFT，再做 Image GRPO（避开开放式 caption RL 这种不稳的任务），最后 merge 出最终模型。
2. **推理侧**：用 vLLM 起 OpenAI-compatible API，启用 prefix caching，对并发/吞吐/TTFT/TPOT 做系统性 benchmark。
3. **Agent 侧**：用 LangGraph 把 vLLM 包装成 Agent，加 calculator + server_info 两个 tool。
4. **后端侧**：FastAPI 提供 REST + WebSocket，统一鉴权（JWT），PostgreSQL 存用户/会话/消息/媒体元数据。
5. **网关侧**：Nginx :443 反代到 FastAPI :9000（WSS 走 WebSocket upgrade），配 Let's Encrypt 证书。
6. **客户端**：React Native（Expo + TypeScript）做 Android/iOS App；Taro（React + TypeScript）做微信小程序。两条线用 `packages/api-contract` + `packages/chat-protocol` 共享类型和 WS 协议。

**V1（当前）**：Image GRPO + Mobile App + Mini Program；Text/Image/Video 三模态推理；单 PostgreSQL 实例；Agent 简单 Tool Calling。

**V2（延期）**：Video GRPO / 语音 / 视频通话 / Redis / iOS EAS。

完整路线图：[docs/项目总执行计划.md](docs/项目总执行计划.md)（72 节 / 7 阶段 / 52 步）。

---

## 2. 系统架构（7 层 + 2 客户端）

```
                          ┌─────────────┐ ┌─────────────┐
                          │ Mobile App  │ │ 微信小程序  │
                          │ React Native│ │ Taro+React  │
                          └──────┬──────┘ └──────┬──────┘
                                 │ HTTPS / WSS   │
                                 └───────┬───────┘
                                         ▼
                                  ┌──────────────┐
                                  │   Nginx      │  Layer 7 公网网关
                                  │   :443       │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │   FastAPI    │  Layer 6 业务后端
                                  │   :9000      │  (127.0.0.1)
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ LangGraph    │  Layer 5 Agent
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    vLLM      │  Layer 4 推理
                                  │   :8000      │  (127.0.0.1)
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Qwen3-VL    │  Layer 3 模型
                                  └──────────────┘
```

完整分层、模块清单、数据流、端口映射：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 3. 仓库结构（Monorepo）

```
multimodal-project/
├── README.md                       ← 本文件
├── LICENSE                         ← MIT
├── requirements.txt                ← Python 训练 + 后端依赖
├── .gitignore                      ← 强忽略：harness / secrets / weights / data
├── CLAUDE.md                       ← ⭐ 主操作文档（Claude 必读，git ignored）
├── AGENTS.md                       ← 跨 agent 指针（git ignored）
├── init.sh                         ← Linux baseline 验证脚本（git ignored）
├── feature_list.json               ← 任务状态机（git ignored）
├── claude-progress.md              ← Session 连续性日志（git ignored）
├── session-handoff.md              ← Session 交接卡（git ignored）
├── clean-state-checklist.md        ← Session 末 6 项清单（git ignored）
├── evidence/                       ← Feature 验证日志（git ignored）
│
├── docs/                           ← 项目文档
│   ├── 项目总执行计划.md           ← ⭐ 完整路线图（72 节）
│   ├── 服务器运维手册.md           ← 服务器运维（含 §12 multimodal-project）
│   ├── 信息.txt                    ← 密钥速查（git ignored）
│   ├── ARCHITECTURE.md             ← 架构图（git ignored）
│   ├── SECURITY.md                 ← 安全规范（git ignored）
│   ├── harness机制.md              ← Harness 5 子系统（git ignored）
│   ├── 总目标.md                   ← 已废弃（删除）
│   └── ...
│
├── training/                       ← 训练侧
│   ├── scripts/
│   │   ├── 00_check_env.sh
│   │   ├── 01_sft.sh
│   │   ├── 02_test_base_vllm.sh
│   │   ├── 03_grpo.sh
│   │   ├── 04_eval_compare.sh
│   │   └── 05_merge.sh
│   ├── data/
│   │   ├── build_sft.py
│   │   ├── build_grpo.py
│   │   ├── inspect_dataset.py
│   │   ├── sft/                    ← git ignored（数据）
│   │   └── grpo/                   ← git ignored（数据）
│   ├── reward/
│   │   ├── accuracy_reward.py
│   │   ├── format_reward.py
│   │   └── test_*.py
│   └── outputs/                    ← git ignored（checkpoint）
│
├── model-serving/                  ← vLLM 推理 + benchmark
│   ├── serve_final.sh
│   ├── benchmark/
│   └── cache/                      ← git ignored
│
├── backend/                        ← FastAPI 后端
│   ├── app/
│   │   ├── main.py
│   │   ├── api/                    ← REST 路由
│   │   ├── ws/                     ← WebSocket handlers
│   │   ├── auth/                   ← JWT
│   │   ├── agent/                  ← LangGraph
│   │   ├── db/                     ← SQLAlchemy / Alembic
│   │   └── schemas/                ← Pydantic
│   ├── tests/
│   └── uploads/                    ← git ignored
│
├── clients/                        ← 客户端
│   ├── mobile-app/                 ← Expo + React Native
│   └── wechat-mini/                ← Taro + 微信小程序
│
├── packages/                       ← 共享 TS
│   ├── api-contract/               ← API DTO + 类型
│   └── chat-protocol/              ← WebSocket 消息协议
│
├── infra/                          ← 部署
│   ├── nginx/
│   ├── systemd/
│   └── postgres/
│
└── data/                           ← git ignored
    ├── samples/
    └── media/
```

---

## 4. 技术栈


| 层 | 技术 |
|----|------|
| 模型 | Qwen3-VL-2B-Instruct（视觉语言模型，3 模态 text/image/video） |
| 训练框架 | ms-swift（LoRA SFT + GRPO） |
| 推理框架 | vLLM（KV Cache / PagedAttention / Continuous Batching / Prefix Cache） |
| Agent 编排 | LangGraph + LangChain（OpenAI 兼容 API） |
| 后端 | FastAPI + WebSocket + Uvicorn + SQLAlchemy 2.0 + Alembic |
| 数据库 | PostgreSQL 15+ |
| 鉴权 | JWT (HS256, PyJWT) |
| 网关 | Nginx + Let's Encrypt |
| Mobile App | React Native + Expo + TypeScript + expo-secure-store + expo-image-picker |
| Mini Program | Taro + React + TypeScript + miniprogram-ci |
| 共享 | TypeScript 包（api-contract + chat-protocol） |
| CI/CD | EAS Build（App）+ miniprogram-ci（小程序） |

---

## 5. 7 阶段路线图（摘要）

| Stage | 主导层 | 关键产物 | 参考 § |
|-------|--------|---------|--------|
| A. Model | 模型层 | Qwen3-VL + vLLM 三模态测试 | §8-10 |
| B. Training | 训练层 | LoRA SFT → GRPO → Merge | §11-19 |
| C. Inference | 推理层 | Final vLLM + 性能 benchmark | §20 |
| D. Agent | 后端 + Agent | FastAPI + LangGraph + DB + Media + WS | §21-25 |
| E. Public API | 网关层 | Domain + HTTPS + Nginx + WSS + Auth | §26-30 |
| F. Mobile App | 客户端 1 | Expo + 登录 + 聊天 + 流式 + 历史 + APK | §28-35 |
| G. WeChat Mini Program | 客户端 2 | Taro + wx.login + 聊天 + 流式 + 上传 | §37-52 |

详细 52 步执行清单见 `docs/项目总执行计划.md` §65；50 个 feature 跟踪见 `feature_list.json`。

---

## 6. 数据流

### 6.1 客户端 → 后端（聊天）

```
用户输入（App / 小程序）
   ↓
HTTP Auth → JWT
   ↓
WSS /ws/chat?ticket=xxx（30s 短时 ticket）
   ↓
FastAPI WebSocket Handler
   ↓
LangGraph Agent → vLLM :8000（流式）
   ↓
message.start → message.delta* → message.done
   ↓
客户端逐字渲染
```

### 6.2 客户端 → 后端（图片）

```
选择图片 → POST /api/v1/media/upload → {media_id}
   ↓
WSS chat.send(content + media_ids)
   ↓
Agent → vLLM chat completion with image
   ↓
流式返回分析结果
```

---

## 7. 安全 / 同步原则（CRITICAL）

### 7.1 代码同步红线

**唯一允许**：本地（Windows）修改 → `git push` 到 GitHub → `ssh paper3-server` → 服务器 `git pull`。

**❌ 严禁**（任意一种都违反红线）：
- `scp` / `rsync` 把本地文件传到服务器
- `SFTP` / `FTP` / `WebDAV` / `NFS` / `SMB` 上传
- VS Code Remote-SSH 直接编辑服务器文件
- 在服务器 `wget` / `curl` 从 Windows 拉代码
- 任何 IDE 的"本地文件传输"扩展

**理由**：
1. 保持 GitHub 是 single source of truth
2. 防止本地和服务器代码状态分裂
3. 防止模型权重 / 密钥意外泄露

详见 [CLAUDE.md §1](CLAUDE.md)（主文档）。

### 7.2 密钥与凭证

- 所有密钥（SSH / API Key / 微信 AppSecret / 数据库密码 / JWT secret）**仅在服务器 `.env` 中**，**绝不入 Git**
- `docs/信息.txt`（含服务器密码 + MiniMax API key）**git ignored**
- 客户端（App / 小程序）**不得持有任何 secret**，只能持有 access_token
- 模型权重 + 训练数据**绝不入 Git**（单文件 GB 级）

详见 [docs/SECURITY.md](docs/SECURITY.md)。

---

## 8. 环境要求


| 资源 | 配置 |
|------|------|
| GPU 服务器 | Linux + RTX 2080 Ti (GPU 0) + RTX A6000 (GPU 1) |
| Python | 3.11+ |
| Conda env | `multimodal_ai` |
| CUDA | 12.4+ |
| 磁盘 | 至少 200GB（模型权重 + 数据） |
| 网络 | 公网 IP（NAT，已设域名 `1u72c85740.zicp.fun`） |
| 域名 | `api.example.com`（V1 阶段 E 注册） |

---

## 9. 快速上手（开发流程）

### 9.1 准备阶段（一次性）

1. 克隆项目：`git clone git@github.com:caiqiyue/multimodal-project.git`
2. 进入目录：`cd multimodal-project`
3. 读 [CLAUDE.md](CLAUDE.md) 主文档
4. 读 [docs/项目总执行计划.md](docs/项目总执行计划.md)
5. 读 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
6. 读 [docs/SECURITY.md](docs/SECURITY.md)
7. SSH 配置：`ssh paper3-server`（参考 `docs/服务器运维手册.md` §12.1）

### 9.2 单次 Session 流程

1. **本地读 / 改代码**（Windows）
2. **`git add` + `git commit -m "feat-XXX: ..."`**
3. **`git push` 到 GitHub**
4. **`ssh paper3-server` 进服务器**
5. **`cd /mnt/public/caiqiyue_file/multimodal-project && git pull`**
6. **服务器上跑验证**（训练 / 推理 / 部署）
7. **evidence/ 写日志**
8. **回本地更新 feature_list.json + claude-progress.md**
9. **`git push`**
10. 跑 `./clean-state-checklist.md` 确认 clean state

---

## 10. 验证 / Evidence 标准

每个 feature 标 `passing` 必须有：

- 验证步骤完整跑通（脚本输出 / curl 响应 / UI 截图）
- 证据落 `evidence/feat-XXX-name.log` 或 `evidence/feat-XXX-name.md`
- `feature_list.json` 更新状态 + 引用 evidence 路径
- commit message 含 feature ID（`feat-XXX`）

---

## 11. 路线图

- **V1（当前）**：训练 + 推理 + Agent + 后端 + 网关 + App + 小程序
- **V2（延期）**：Video GRPO / 语音 ASR+TTS / 视频通话 / Redis / iOS EAS

完整规划见 [docs/项目总执行计划.md](docs/项目总执行计划.md)。

---

## 12. 文档导航


| 文档 | 用途 | git 状态 |
|------|------|---------|
| [CLAUDE.md](CLAUDE.md) | **主文档**，Claude 必读，含代码同步红线 | ignored |
| [AGENTS.md](AGENTS.md) | 跨 agent 指针 | ignored |
| [docs/项目总执行计划.md](docs/项目总执行计划.md) | 72 节完整路线图 | tracked |
| [docs/服务器运维手册.md](docs/服务器运维手册.md) | 服务器运维（含 §12 multimodal-project） | tracked |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 7 层架构图 + 数据流 | ignored |
| [docs/SECURITY.md](docs/SECURITY.md) | SSH / 密钥 / 端口安全规范 | ignored |
| [docs/harness机制.md](docs/harness机制.md) | Harness 5 子系统详解 | ignored |
| [init.sh](init.sh) | Linux baseline 验证脚本 | ignored |
| [feature_list.json](feature_list.json) | 50 个 feature 状态机 | ignored |
| [claude-progress.md](claude-progress.md) | Session 连续性日志 | ignored |
| [evidence/](evidence/) | Feature 验证日志 | ignored |

---

## 13. License

MIT — 详见 [LICENSE](LICENSE)。

---

## 14. 致谢

- **Qwen3-VL**（Alibaba / Tongyi Qianwen）— 视觉语言模型基础
- **ms-swift**（ModelScope）— 训练框架
- **vLLM**（UC Berkeley）— 推理框架
- **LangGraph / LangChain** — Agent 编排
- **FastAPI** + **PostgreSQL** + **Nginx** — 后端生态
- **React Native** + **Expo** + **Taro** — 客户端框架
<!-- Sync chain test: 2026-08-23T13:49:46Z | commit abb0301+1 | local->github->server pull verified -->
