# Frontend MVP Design — Mac Local Monorepo (Expo + Taro)

**Date**: 2026-08-24
**Status**: Approved (pending user spec review)
**Author**: Bob (Claude) via brainstorming session
**Codename**: Falcon

---

## 1. Background & Goal

### 原计划（V1 - 50 features）
完整全栈：Linux 训练 (SFT + GRPO) → vLLM 推理 → LangGraph Agent → FastAPI 后端 → Nginx 公网 API → React Native App + Taro 微信小程序。

### 当前目标（重新定义）
**跑通 + 理解整个流程**。不追求发布。

### 关键约束（来自用户）
- ❌ 不上架 App Store
- ❌ 不发布微信小程序
- ✅ 所有功能都要完成（前端层）
- 🖥️ Mac 本地：开发前端代码（小程序 + 手机 App）
- 🐧 Linux 服务器：模型 + agent（**暂停**，等前端差不多再回来）

### Mac 工具链现状（实测）
| 工具 | 状态 |
|------|------|
| Node v25.6.1 / npm / pnpm 10.32.1 | ✅ |
| Homebrew / Git / Docker | ✅ |
| Xcode (完整版) | ❌ 只有 CLT |
| Android Studio + JDK + adb | ❌ |
| 微信开发者工具 | ❌ |
| CocoaPods / Watchman | ❌ |
| macOS 26.3 (arm64) | ✅ |

---

## 2. Scope

### ✅ IN（现在做）
- Mac 本地全功能前端（Expo App + Taro 小程序）
- 共享 packages（api-contract + chat-protocol + mock-data）
- MSW (Mock Service Worker) 模拟后端
- Mac dev 工具链补齐

### ⏸ DEFER（暂停，等前端差不多再做）
- Stage B: feat-003~010（LoRA SFT + GRPO + 训练数据 + 评测 + merge）
- Stage C inference benchmarks: feat-012~015（KV cache 分析、prefix cache、并发、TTFT/TPOT）
- Stage D Agent/Backend: feat-016~021（FastAPI + LangGraph + WebSocket + PostgreSQL + media upload）
- Stage E Public API: feat-022~026（域名 + HTTPS + Nginx + WS ticket auth + JWT）

### ❌ OUT（V1 不做）
- App Store / Google Play 上架
- 微信小程序上传 / 审核
- WeChat appid 注册
- iOS EAS Build / TestFlight
- miniprogram-ci 上传

### ⚠️ V1 vs V2 边界保持原定义
- V1：text + image + video 三模态 + Image GRPO + App + 小程序
- V2：Video GRPO / 语音 / 视频通话 / Redis / iOS native build

---

## 3. Architecture

### 3.1 Monorepo 结构（pnpm workspace）

```
multimodal-project/
├── package.json                  ← pnpm workspace 根
├── pnpm-workspace.yaml
├── tsconfig.base.json            ← 共享 TS 配置（strict mode）
├── .npmrc
├── .gitignore
├── README.md                     ← 顶层说明（更新为前端优先）
├── docs/                         ← 已有文档保留
│   ├── 项目总执行计划.md        ← 标注 [Stage B-E deferred]
│   └── ...
├── clients/
│   ├── mobile-app/               ← Expo SDK 51+ (TS)
│   │   ├── app/                  ← Expo Router（文件路由）
│   │   │   ├── (auth)/           ← login/register 组
│   │   │   ├── (tabs)/           ← 主界面组
│   │   │   │   ├── index.tsx     ← Chat
│   │   │   │   ├── conversations.tsx
│   │   │   │   └── profile.tsx
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/                  ← fetch 封装、token 管理
│   │   ├── mocks/                ← MSW handlers (Web target)
│   │   │   ├── handlers/
│   │   │   ├── browser.ts
│   │   │   └── fixtures.ts
│   │   ├── app.json              ← Expo 配置
│   │   └── package.json
│   └── mini-program/             ← Taro 4 (TS)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── auth/
│       │   │   │   ├── login.tsx
│       │   │   │   └── register.tsx
│       │   │   ├── chat/
│       │   │   │   ├── index.tsx
│       │   │   │   └── detail.tsx
│       │   │   ├── conversations/index.tsx
│       │   │   ├── profile/index.tsx
│       │   │   └── settings/index.tsx
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── mocks/            ← MSW handlers (H5 + 微信小程序)
│       │   └── app.tsx
│       ├── project.config.json   ← 小程序配置
│       └── package.json
└── packages/
    ├── api-contract/             ← API TS 类型 (Zod schemas + 推导类型)
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── auth.ts           ← login/register/refresh 类型
    │   │   ├── chat.ts           ← chat send/stream 类型
    │   │   ├── media.ts          ← 上传/下载类型
    │   │   ├── conversation.ts
    │   │   └── user.ts
    │   └── package.json
    ├── chat-protocol/            ← WS/SSE 消息协议
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── events.ts         ← message.start / delta / done
    │   │   ├── envelope.ts       ← 通用消息信封
    │   │   └── content.ts        ← text/image_url/video_url 内容块
    │   └── package.json
    └── mock-data/                ← 共享 mock fixtures
        ├── src/
        │   ├── users.ts          ← 3-5 个测试用户
        │   ├── conversations.ts  ← 5-10 条会话
        │   ├── messages.ts       ← 示例消息流
        │   └── media.ts            ← 测试图片/视频 URL
        └── package.json
```

### 3.2 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Monorepo 工具 | **pnpm workspace** | 已装；hoisting 干净；TS 支持好 |
| 共享范围 | **类型 + 协议 + mock data**（**不共享 UI 组件**） | Taro 和 RN 渲染机制不同，UI 共享会引入复杂适配 |
| UI 库 | **不引入 Tailwind / shadcn / Vant / Antd** | 保持依赖最小；后期可加 |
| TypeScript | **strict mode** | 跨 client 一致性靠类型保证 |
| mobile-app 路由 | **Expo Router** | 文件路由 = RN 主流；TS 友好 |
| mini-program 路由 | **Taro pages** | Taro 原生 pages + 配置路由 |
| mobile-app 状态管理 | **React useState + Context**（轻量） | V1 不需要 Redux/Zustand |
| mini-program 状态管理 | **Taro hooks (useState/useReducer)** | 同上 |
| Chat 流式协议 | **SSE (Server-Sent Events)** | Web/iOS/H5 全部支持；无需 WS 服务器 |
| Token 存储 | **expo-secure-store** (mobile) / **Taro.setStorageSync 加密** (mini) | V1 简化版 |
| 图片选择 | **expo-image-picker** (mobile) / **wx.chooseMedia** (mini) | 平台原生 API |

### 3.3 不引入的东西（YAGNI）
- ❌ Tailwind CSS / UnoCSS / shadcn-ui / Vant / Antd Mobile
- ❌ Redux / Zustand / Jotai / Recoil
- ❌ React Query / SWR / RTK Query（V1 用 fetch + 自封装 hooks 即可）
- ❌ LangChain / LangGraph 在客户端（仅后端用）
- ❌ PostgreSQL / Redis 在客户端（仅后端用）
- ❌ Nginx / certbot 在 Mac
- ❌ EAS Build / miniprogram-ci

---

## 4. Mock Layer（MSW）

### 4.1 MSW 集成策略

两套 client 各自集成 MSW：
- **mobile-app (Expo)**：MSW Web target via Service Worker（默认集成；mobile-app 主推 Web target，iOS Simulator 同样走 SW）
- **mini-program (Taro)**：**H5 模式走 MSW Web target via Service Worker；小程序模式走 `tarojs-plugin-mock`（拦截 wx.request + 上传）**。两个 target 共用同一份 `packages/mock-data` fixtures

### 4.2 Mock 端点清单

| endpoint | method | 用途 | 客户端使用方 |
|---------|--------|------|-------------|
| `/api/v1/auth/login` | POST | 用户名密码登录 | 登录页 |
| `/api/v1/auth/register` | POST | 注册（V1 测试用） | 注册页 |
| `/api/v1/auth/refresh` | POST | 刷新 token | HTTP 拦截器 |
| `/api/v1/auth/wechat-mini` | POST | wx.login 换 token | 小程序启动 |
| `/api/v1/users/me` | GET / PATCH | 当前用户信息 | Profile 页 |
| `/api/v1/conversations` | GET / POST | 会话列表 / 新建 | 会话列表页 |
| `/api/v1/conversations/:id/messages` | GET | 历史消息 | Chat 加载历史 |
| `/api/v1/chat/stream` | POST (SSE) | 流式 chat | Chat 输入发送 |
| `/api/v1/media/upload` | POST (multipart) | 上传图片/视频 | Chat 图片/视频选择 |
| `/api/v1/media/:id` | GET | 下载媒体 | Chat 显示媒体 |

### 4.3 Chat 流式协议（chat-protocol）

```
POST /api/v1/chat/stream
Content-Type: application/json
Authorization: Bearer <token>
Body:
{
  "conversation_id": "uuid",
  "message": {
    "role": "user",
    "content": [
      {"type": "text", "text": "这张图片里有什么？"},
      {"type": "image_url", "image_url": {"url": "https://..."}}
    ]
  }
}

Response (SSE):
event: message.start
data: {"id": "msg_001", "role": "assistant", "created_at": 1234}

event: message.delta
data: {"delta": "这张图片"}

event: message.delta
data: {"delta": "展示了"}

event: message.done
data: {"id": "msg_001", "finish_reason": "stop", "usage": {"total_tokens": 156}}
```

### 4.4 内容块（content.ts）

支持三种 content block：
- `text` — 纯文本
- `image_url` — 图片 URL（V1 支持 URL，不支持 base64）
- `video_url` — 视频 URL（V1 仅 1 帧缩略图 + 描述，不真播视频）

### 4.5 切换真后端的迁移路径

前端代码 0 改动，只需：
1. 设 `EXPO_PUBLIC_API_BASE_URL=https://api.example.com`（mobile-app）
2. 设 `TARO_APP_API_BASE_URL=https://api.example.com`（mini-program）
3. 关掉 MSW（开发模式下 `MSW_ENABLED=false`）

---

## 5. Implementation Phases（Foundation-first）

| Phase | 时长 | 内容 | 产出（DoD） |
|-------|------|------|-------------|
| **P0** Mac 工具链 | 1-2h | 安装 Xcode + 微信开发者工具 + CocoaPods + Watchman | 微信开发者工具能打开小程序；Xcode 能 launch iOS Simulator |
| **P1** Monorepo 骨架 | 2-3h | pnpm workspace + tsconfig + 4 packages 骨架 + 2 clients 骨架 | `pnpm install` 成功；`pnpm dev` 起 Expo；`pnpm dev:h5` 起 Taro H5 |
| **P2** 共享 packages | 3-4h | api-contract (Zod schema + 类型) + chat-protocol (events) + mock-data (fixtures) + MSW 框架 | MSW 在两个 client 都生效；DevTools Network 看到 mock 响应 |
| **P3** Auth 跨 client | 4-6h | mobile-app + mini-program 同步实现：login + register + token 存储 + refresh 拦截 | 两套 client 都能登入登出；token 自动 refresh |
| **P4** Chat 跨 client | 6-8h | mobile-app + mini-program 同步实现：Chat 主页 + 流式接收 + text/image/video content | 两套 client 都能跟"AI"对话（多模态）；流式显示 |
| **P5** 周边功能 | 4-6h | 会话列表 + media upload + settings + profile（两套 client 同步） | V1 前端功能完整 |
| **P6** 收尾 + 文档 | 2h | 仓库顶层 README 更新 + 接入真后端的 handoff doc | 新 session 能直接 `./init.sh` + `pnpm dev` 起来 |

**总耗时预估**：~22-31 小时专注工作（约 4-6 天，每天 5h）

---

## 6. Verification (Definition of Done)

### 6.1 Phase 级 DoD
每个 Phase 完成的硬性标准：

- [ ] `pnpm install` 一键装齐所有依赖（无 peer warnings 致命）
- [ ] `pnpm --filter mobile-app typecheck` 通过
- [ ] `pnpm --filter mini-program typecheck` 通过
- [ ] `pnpm --filter mobile-app dev` 启动 Expo（Web 模式 + iOS Simulator）
- [ ] `pnpm --filter mini-program dev:weapp` 启动微信开发者工具
- [ ] MSW 拦截生效，DevTools Network 面板能看到 mock 响应
- [ ] 关键流程录屏或截图存 `evidence/feat-XXX/`
- [ ] feature_list.json 对应 feature 标 passing（含 evidence 引用）

### 6.2 跨 client 一致性验证
- [ ] 同一份 mock data 在两套 client 上 UI 行为一致
- [ ] 同一份类型（api-contract）编译通过两套 client
- [ ] 同一份 mock endpoint 在两套 client 都返回相同 fixture

### 6.3 端到端用户流（V1 验收）
完整跑通：
1. 打开 App/小程序 → 看到登录页
2. 注册测试账号 → 自动登录
3. 跳到 Chat 页 → 输入 "你好"
4. 流式看到 "AI" 响应（mock 返回示例文本）
5. 发图片：选择本地图片 → mock 上传 → "AI" 描述图片
6. 切到会话列表 → 看到刚才的会话
7. 点 Profile → 看到用户信息
8. 退出登录 → 回到登录页

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mac 装 Xcode 失败（磁盘空间 / 权限） | Med | High | Mac arm64 通常 OK；准备 fallback = 仅 Web target |
| 微信开发者工具与 Taro 版本不兼容 | Low | Med | Taro 4 + 微信开发者工具最新版兼容性已验证 |
| MSW 在微信小程序环境不工作 | High | Med | 准备 fallback：mock data 直接 hardcode 在 hooks 里（开发模式） |
| 两套 client 的 UI 行为不一致 | Med | Low | 用同一份 mock fixtures + 截图对比验收 |
| Expo SDK 版本升级破坏 | Low | Med | 锁定 Expo SDK 51+，不主动升级 |
| Taro 4 API 文档不全 | Med | Low | 准备 fallback = Taro 3 + 文档更全 |

---

## 8. feature_list.json 映射策略

### 8.1 原 feature 状态变更

| 原 ID | 标题 | 新状态 |
|-------|------|--------|
| feat-001 | Linux GPU 环境就绪 | ✅ passing（不变） |
| feat-002 | vLLM 三模态推理 | ⏸ deferred |
| feat-003~010 | Stage B 训练 | ⏸ deferred (8 个) |
| feat-011 | vLLM merged 部署 | ⏸ deferred |
| feat-012~015 | Stage C benchmark | ⏸ deferred (4 个) |
| feat-016~021 | Stage D Agent/Backend | ⏸ deferred (6 个) |
| feat-022~026 | Stage E Public API | ⏸ deferred (5 个) |
| feat-027~036 | Stage F Mobile App | 🔄 重映射到 P3/P4/P5 mobile-app 部分 |
| feat-037~046 | Stage G WeChat Mini | 🔄 重映射到 P3/P4/P5 mini-program 部分 |

### 8.2 新增 feature（Mac 基础设施 + 共享 + 客户端）

| 新 ID | 优先级 | 阶段 | 标题 |
|-------|--------|------|------|
| feat-100 | 1 | P0 | Mac dev 工具链补齐（Xcode + 微信开发者工具 + CocoaPods） |
| feat-101 | 2 | P1 | pnpm monorepo 初始化 + clients/ + packages/ 骨架 |
| feat-102 | 3 | P2 | api-contract package（Zod schema + 类型导出） |
| feat-103 | 4 | P2 | chat-protocol package（events + 协议定义） |
| feat-104 | 5 | P2 | mock-data package（共享 fixtures） |
| feat-105 | 6 | P2 | MSW 框架在两套 client 集成 |
| feat-110 | 7 | P1/P3 | mobile-app 骨架（Expo + Expo Router + 基础屏） |
| feat-111 | 8 | P1/P3 | mini-program 骨架（Taro + pages + 基础屏） |
| feat-120 | 9 | P3 | mobile-app Auth（login + token 存储 + cold-start 恢复 + refresh 拦截） |
| feat-121 | 10 | P3 | mini-program Auth（wx.login + /auth/wechat-mini + token 存储 + cold-start 恢复） |
| feat-130 | 11 | P4 | mobile-app Chat（Chat 主页 + 流式 + text/image/video content） |
| feat-131 | 12 | P4 | mini-program Chat（Chat 主页 + 流式 + text/image/video content） |
| feat-140 | 13 | P5 | mobile-app 周边（会话列表 + media upload + settings + profile） |
| feat-141 | 14 | P5 | mini-program 周边（会话列表 + media upload + settings + profile） |
| feat-150 | 15 | P6 | 仓库顶层 README + 接入真后端 handoff 文档 |

### 8.3 feat-027~046 重映射（来源映射表）

| 原 ID | 新 ID |
|-------|-------|
| feat-027 Expo init | feat-110 |
| feat-028 App login | feat-120 |
| feat-029 App Chat | feat-130 |
| feat-030~036 App 周边 | feat-140 |
| feat-037 Taro init | feat-111 |
| feat-038~046 小程序周边 | feat-121 + feat-131 + feat-141 |

---

## 9. Out of Scope（明确不做）

- ❌ 任何形式的代码直传服务器（CLAUDE.md §1 红线保持）
- ❌ 跑任何训练 / 推理 / agent 代码
- ❌ 连接真实后端 / V1
- ❌ 真机部署 / App Store / Google Play
- ❌ 微信小程序提交 / 审核
- ❌ WeChat appid 申请
- ❌ iOS EAS Build（仅本地 expo start）
- ❌ miniprogram-ci 上传

---

## 10. Success Metrics

V1（前端 MVP）成功的硬标准：

1. ✅ `pnpm install && pnpm dev` 一键起两个 client
2. ✅ mobile-app 在 iOS Simulator + Web 都能跑
3. ✅ mini-program 在微信开发者工具 + H5 都能跑
4. ✅ 两套 client 都能完整跑完登录 → chat → 上传媒体 → 退出
5. ✅ 所有共享 types 在两套 client 编译通过
6. ✅ evidence/feat-XXX/ 有截图或录屏
7. ✅ 后端 ready 后只改 baseURL + 关 MSW 即可对接

---

## 11. Open Questions

无（所有关键问题已在 brainstorming 中澄清）。

---

## 12. References

- 原 72 节路线图：`docs/项目总执行计划.md`（标注 deferred 段落）
- V1 总览：`README.md`（更新为前端优先）
- 操作手册：`CLAUDE.md`（红线保持）
- 路线图：`docs/项目总执行计划.md`

---

## 13. Implementation Status

> **Source of truth**: [`feature_list.json`](feature_list.json) 的 `features[]` 数组 + 每行 `status: not_started | in_progress | passing | blocked | skipped`。本节只是人类可读快照。

> **Implementation log**: [`claude-progress.md`](../../claude-progress.md)（append-only session log）+ [`session-handoff.md`](../../session-handoff.md)（长 session 交接卡）。

### 当前状态（截至 2026-08-27，Session 011）

**H_Frontend_MVP（11/16 passing）**：

| ID | 标题 | status | commit |
|----|------|--------|--------|
| feat-100 | Mac dev 工具链补齐 | passing | — |
| feat-101 | pnpm monorepo 初始化 | passing | — |
| feat-102 | api-contract package | passing | — |
| feat-103 | chat-protocol package | passing | — |
| feat-104 | mock-data package | passing | — |
| feat-105 | MSW 框架双端集成 | passing | — |
| feat-110 | mobile-app 骨架 | passing | — |
| feat-111 | mini-program 骨架 | passing | — |
| feat-120 | mobile-app Auth（mock-first） | passing | f829028 |
| feat-121 | mini-program Auth（mock-first） | passing | 3c9d731 |
| feat-130 | mobile-app Chat | not_started | — |
| feat-131 | mini-program Chat | not_started | — |
| feat-140 | mobile-app 周边 | not_started | — |
| feat-141 | mini-program 周边 | not_started | — |
| feat-150 | README + 切真后端 handoff | not_started | — |
| feat-V.1 | monorepo verification 套件 | passing | 9ab7de4 |

**D_Agent_Backend / E_Public_API（冻结中）**：

| ID | 标题 | status | 说明 |
|----|------|--------|------|
| feat-016 | FastAPI 骨架 | not_started | 留给用户 SSH 进 paper3-server 做；Mac 本地 session 不连服务器 |
| feat-021 | WebSocket 聊天 | not_started | 同上 |
| feat-026 | JWT auth（login / refresh / wechat-mini） | not_started | 同上；前端 `authFetch()` 已留 401 TODO 钩子 |

### 与本 spec §8.2 的差异（design vs reality）

| ID | spec 写 | 实际落地 | 原因 |
|----|--------|----------|------|
| feat-120 | "login + register + token 存储 + refresh 拦截" | login + token 存储 + cold-start 恢复 + refresh 拦截（仅 401 TODO 钩子） | Session 010 mock-first；register 留待 feat-026 真后端 |
| feat-121 | "login + register + token 存储 + refresh 拦截" | wx.login + /auth/wechat-mini + token 存储 + cold-start 恢复（仅 401 TODO 钩子） | Session 011 mock-first；register 留待 feat-026 真后端；刷新拦截同上 |

> **核心 mock-first 决策**：两个 client 的 Auth 都是 mock-first；register / 真 refresh interceptor / 真后端交换 = 等 feat-026 + feat-037 就位后再做。决策依据见 [docs/2026-08-27-frontend-next-step-decision.md](../../2026-08-27-frontend-next-step-decision.md)。

### 关键边界（每次 session 末都要重读）

- WIP=1：不混跑前端 + 服务器训练主线
- 不 scp/rsync 任何代码（CLAUDE.md §1 红线）
- 客户端不持有 secret（vLLM key / DB 密码 / 微信 AppSecret）
- 不切真后端直到 feat-026 + feat-037 同时就位
- mock `/auth/wechat-mini` 任何非空 code 都返回 alice（user_001）tokens；这是 mock 层短路的"占位"，不是真 wx.login 行为
- Node ESM 25+ 不自动 `.js → .ts` 改写：`packages/*/src/index.ts` 必须显式 `.ts` 扩展（Session 011 fix）
- Taro 4 page 文件必须 `default export`（Expo/Metro 允许 named export，两者约定不同）