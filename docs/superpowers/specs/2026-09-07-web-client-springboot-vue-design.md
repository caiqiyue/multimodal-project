# Web 客户端设计 — Vue 3 + Spring Boot

> **需求来源**：用户 2026-09-07 提出 —— 服务端是 agent，外部有三类界面接触它：手机 App、微信小程序、网页端。前两者已实现，本设计补齐网页端。
> **技术栈**：Vue 3 + Vite（前端）+ Spring Boot 3.3 / JDK 21 / Maven（网页端后端）
> **约束**：遵循 `docs/REQUIREMENTS.md` 三条核心需求 —— 不商业化、链路跑通即可、不过度工程
> **状态**：设计已批准（用户逐段确认 §1-§4），待转 writing-plans 出实施计划

---

## 1. 目标与非目标

### 1.1 目标

网页端用户能够：

1. 登录（复用现有 alice / demo1234 测试账号）
2. 在网页上与服务端 Qwen3-VL agent 对话，回复以**打字机效果**逐字呈现
3. 上传图片 / 视频，随对话一起发给 agent，在页面上看到缩略图
4. 看到工具调用过程（🔧 calculator 等）

请求流向：**Vue → Spring Boot → FastAPI → LangGraph Agent → vLLM → 逐层回传**。

### 1.2 非目标（明确不做）

沿用 `docs/REQUIREMENTS.md` §6，并针对本次新增：

- ❌ Spring Boot 侧不加数据库（MySQL / PG / Redis 都不加）
- ❌ 不做会话历史持久化（feat-019 已 DEFERRED）
- ❌ 不引 Spring Security（认证靠透传，不自己验签）
- ❌ 不在 Java 侧重写 agent 编排（不用 Spring AI 直连 vLLM）
- ❌ 不上 Nginx / HTTPS / Docker / K8s
- ❌ 不做限流、熔断、监控告警
- ❌ 不引 Pinia、不引 UI 组件框架（Element Plus 等）

---

## 2. 整体架构

```
                        ┌─ 手机 App (RN + Expo)  ──────────────┐
                        │                                       │
外部三类界面 ────────────┼─ 微信小程序 (Taro)     ──────────────┤
                        │                                       ↓
                        └─ 网页端 Vue :5173 ──→ SpringBoot :8080 ──→ FastAPI :9000
                                                                        ↓
                                                           LangGraph Agent (+ tools)
                                                                        ↓
                                                           vLLM :8000 → Qwen3-VL-2B
```

### 2.1 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Spring Boot 定位 | **BFF 薄代理**（转发 + 中继） | AI 编排逻辑只在 FastAPI 一处，不重复实现 |
| 现有两端 | **完全不动**（继续直连 FastAPI :9000） | 已 passing 的链路零回归风险 |
| Agent / FastAPI / vLLM | **零改动** | 新链路是纯增量，不侵入已验证的服务端 |
| 流式方案 | Vue ←WS→ SpringBoot ←WS→ FastAPI | 三端体验一致；工具调用实时可见 |
| 上传路径 | Vue → SpringBoot → FastAPI `/media/upload` | 文件只存一份；复用 feat-020 的 size/mime 校验 |
| 认证 | 复用 FastAPI JWT（feat-026），Spring Boot 只透传 | 三端同一套账号体系；Java 侧不验签 |
| 代码位置 | 当前 monorepo 新增两个目录 | 一个 repo / 一个 init.sh / 一套 harness；Zod 契约直接复用 |

### 2.2 三条转发路径

| Vue 请求 | Spring Boot 行为 | 转发到 FastAPI |
|---|---|---|
| `POST :8080/api/web/auth/login` | 透传 body，回传 JWT | `POST /api/v1/auth/login` |
| `POST :8080/api/web/media/upload` | multipart 中继 | `POST /api/v1/media/upload` |
| `WS :8080/api/web/ws/chat` | WS ↔ WS 双向泵 | `WS /api/v1/ws/chat` |

### 2.3 仓库布局

```
multimodal-llm/
├── backend/               FastAPI (Python) —— 不动
├── clients/
│   ├── mobile-app/        RN + Expo —— 不动
│   ├── mini-program/      Taro —— 不动
│   └── web-app/           ← 新增 Vue 3 + Vite（进 pnpm workspace）
├── web-backend/           ← 新增 Spring Boot（Maven，不进 pnpm）
├── packages/              Zod 契约 —— web-app 直接以 workspace:* 复用
└── training/              ms-swift SFT/GRPO —— 不动
```

---

## 3. Spring Boot 侧设计（`web-backend/`）

### 3.1 技术选型

- Spring Boot 3.3.x，JDK 21，Maven
- 依赖仅三样：`spring-boot-starter-webflux`（WebClient 转发）、`spring-boot-starter-websocket`（WS 服务端）、`lombok`
- 测试：JUnit 5 + `mockwebserver`（打桩上游 FastAPI）

### 3.2 包结构

```
web-backend/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/com/falcon/web/
    │   │   ├── WebBackendApplication.java      启动类
    │   │   ├── config/
    │   │   │   ├── UpstreamProperties.java     @ConfigurationProperties("falcon.upstream")
    │   │   │   ├── WebClientConfig.java        WebClient bean（指向 :9000）
    │   │   │   ├── WebSocketConfig.java        注册 /api/web/ws/chat handler
    │   │   │   └── CorsConfig.java             放行 http://localhost:5173
    │   │   ├── controller/
    │   │   │   ├── AuthController.java         POST /api/web/auth/login|refresh
    │   │   │   ├── MediaController.java        POST /api/web/media/upload
    │   │   │   └── HealthController.java       GET /api/web/health（含上游探活）
    │   │   ├── ws/
    │   │   │   ├── ChatRelayHandler.java       Vue 侧 WS 服务端
    │   │   │   └── UpstreamChatClient.java     连 FastAPI 的 WS 客户端 + 双向泵
    │   │   └── dto/
    │   │       ├── LoginRequest.java / LoginResponse.java
    │   │       └── MediaUploadResponse.java
    │   └── resources/application.yml
    └── test/java/com/falcon/web/...
```

### 3.3 WS 双向中继（本次最重的一块）

**会话映射**：Vue 每开一条 WS，`ChatRelayHandler` 为它拉起一条到 FastAPI 的上游 WS，一对一绑定，存于 `ConcurrentHashMap<String sessionId, UpstreamChatClient>`。

**数据流**：

```
Vue --{"messages":[...]}--> ChatRelayHandler --原样--> UpstreamChatClient --> FastAPI
FastAPI --{"type":"message.delta",...}--> UpstreamChatClient --原样--> Vue
```

**核心原则：Spring Boot 不解析 event 内容，只搬运。** `chat-protocol` 的 6 种事件（`message.start` / `message.delta` / `message.done` / `tool.call` / `tool.result` / `error`）将来加字段时，Java 侧无需改动。

**生命周期与清理**（唯一容易漏的地方，必须写测试）：

- Vue 侧断开 → 关闭上游连接 → 从 map 移除
- 上游断开 → 关闭 Vue 侧连接 → 从 map 移除
- `@PreDestroy` 兜底关闭所有残留连接

**建连失败**：上游连不上时，向 Vue 发一个 `{"type":"error","code":"upstream_unavailable",...}` 事件，而不是静默挂死。

### 3.4 认证透传

- Spring Boot **不验签、不存 token、不管理会话**
- `AuthController` 把 FastAPI 签发的 JWT 原样返回给 Vue
- 后续 HTTP 请求的 `Authorization: Bearer xxx` 头由拦截器原样转发到上游
- WS 建连时 token 走 **query param**（浏览器 WebSocket API 无法设置自定义 header）

### 3.5 配置外置

`application.yml`：

```yaml
server:
  port: 8080
falcon:
  upstream:
    base-url: http://127.0.0.1:9000
    ws-path: /api/v1/ws/chat
  cors:
    allowed-origins: http://localhost:5173
```

本地开发配合现有 SSH 隧道 `ssh -N -L 9000:127.0.0.1:9000 paper3-server` 即可连服务器真 agent。零硬编码。

### 3.6 测试计划

约 12-15 个 JUnit 测试，用 MockWebServer 打桩上游：

- 登录转发：成功回传 JWT / 上游 401 → 原样回传 401
- multipart 中继：文件正确转发 / 上游 413 → 原样回传
- WS 双向泵：Vue → 上游、上游 → Vue 各方向的帧搬运
- 断连清理：Vue 断开清上游、上游断开清 Vue、map 不泄漏
- health：上游可达 / 不可达两种状态

---

## 4. Vue 侧设计（`clients/web-app/`）

### 4.1 技术选型

- Vue 3 + Vite + TypeScript，`<script setup>` 单文件组件
- 路由：`vue-router`
- 状态：**不引 Pinia** —— 两个页面用 composable + `ref` 足够
- 样式：手写 scoped CSS，不引 UI 框架
- 契约：`@multimodal/api-contract` + `@multimodal/chat-protocol` 以 `workspace:*` 引入。Vite 原生支持 TS 路径解析，不会遇到小程序那个 `moduleResolution: node` 的 subpath 坑

### 4.2 目录结构（镜像 mobile-app，便于对照）

```
clients/web-app/
├── package.json / vite.config.ts / tsconfig.json / index.html
└── src/
    ├── main.ts                    createApp + router
    ├── App.vue                    <router-view>
    ├── router/index.ts            /login → /chat（含未登录守卫）
    ├── lib/
    │   ├── api.ts                 fetch 封装（baseURL = :8080/api/web）
    │   ├── auth.ts                login() → 存 token
    │   ├── tokenStorage.ts        localStorage（对应 mobile 的 SecureStore）
    │   ├── upload-media.ts        FormData + 前置 size/mime 校验
    │   └── ws-chat-client.ts      ← 从 mobile-app 移植
    ├── composables/
    │   └── useChatStream.ts       ← 移植 mobile-app hook（React → Vue ref）
    ├── components/chat/
    │   ├── MessageBubble.vue      用户/助手气泡 + 图片缩略图
    │   ├── StreamingText.vue      带光标的流式文本
    │   ├── ToolCallCard.vue       🔧 工具调用可视化
    │   ├── MediaPreview.vue       已选文件预览（发送前）
    │   ├── ImagePickerButton.vue  📎 <input type="file">
    │   ├── ChatInput.vue          输入框 + 发送
    │   └── ConnectionStatus.vue   ● 已连接 / 连接中 / 断开
    └── views/
        ├── LoginView.vue
        └── ChatView.vue
```

### 4.3 移植策略

**`ws-chat-client.ts`** —— 本来就是写给浏览器原生 `WebSocket` 的（见 `clients/mobile-app/src/lib/ws-chat-client.ts`，159 行），几乎零改动即可复用。

**`useChatStream.ts`** —— 把 React 的 `useState` / `useCallback` 换成 Vue 的 `ref` / 普通函数，逻辑一比一搬运。

> **⚠️ 移植时必须保留的一行逻辑**（Session 020 修过的真 bug）：
> assistant 消息必须使用**服务端下发的 `message_id`（UUID）**作为 key，而不是本地计数器（如 `asst-1`）。否则后续 `message.delta` 永远附不上对应气泡，UI 上表现为「助手气泡永远是空的」。

### 4.4 页面设计

**`/login`**：用户名 + 密码 + 登录按钮。成功后存 token 并跳 `/chat`。

**`/chat`**：

```
│ Falcon Web                    ● 已连接
├──────────────────────────────────────
│                  你好，这张图是什么？ │
│                  [🖼 缩略图]         │
│ Qwen: 这是一只猫▌
│ 🔧 calculator(23*47) → 1081
├──────────────────────────────────────
│ 📎 [输入消息...              ] [发送]
```

### 4.5 测试计划

Vitest + `@vue/test-utils`，约 12-15 个测试：

- `ws-chat-client`：6 种事件正确分发到对应回调
- `useChatStream`：delta 累加、`message_id` 关联、tool_call 挂载
- `upload-media`：size 超限拒绝、mime 白名单外拒绝

并入现有 `pnpm -r test`。

---

## 5. 交付步骤与 Feature ID

| ID | 内容 | 验证方式 |
|---|---|---|
| `feat-160` | JDK 21 + Maven 工具链就绪 | `mvn -v` + `java -version` |
| `feat-161` | Spring Boot 骨架 + health + 上游探活 | `curl :8080/api/web/health` → 200 |
| `feat-162` | Auth 转发 | `curl` 登录拿到真 JWT |
| `feat-163` | Media multipart 中继 | `curl` 传图拿到 `media_id` |
| `feat-164` | **WS 双向中继** | 脚本模拟 Vue 连 WS，看到 delta 流过来 |
| `feat-165` | Vue 骨架 + 路由 + 登录页 | `pnpm dev` 能登进去 |
| `feat-166` | Vue 对话页（流式 + 工具 + 上传） | 浏览器看到打字机效果 |
| `feat-167` | 端到端验收 | 3 张截图进 `evidence/` |

**执行顺序严格自下而上** —— 每步都能独立验证，不依赖下一步。每个 feature 一个 atomic commit，message 带 feature ID（CLAUDE.md §3.3）。

**同步流程**：全部本地开发 → `git push` → 服务器 `git pull`。不使用任何直传方式（CLAUDE.md §1 红线）。

---

## 6. 验收标准（Definition of Done）

功能验收：

- [ ] 浏览器打开 `:5173` → alice / demo1234 登录成功
- [ ] 发「你好你是谁」→ 看到逐字冒出的回复
- [ ] 发一张图 + 「这张图是什么」→ 页面显示缩略图 + 模型描述
- [ ] 发「23 乘 47 等于几」→ 看到 🔧 calculator 卡片 + 结果 1081

回归验收（零回归）：

- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm -r test` 全绿
- [ ] `mvn test`（web-backend）全绿
- [ ] `pytest backend/tests/` 全绿
- [ ] mobile-app / mini-program 链路未受影响

Evidence：

- [ ] 3 张截图进 `evidence/`（文本对话 / 图片对话 / 工具调用）
- [ ] `evidence/feat-167-web-e2e.log` 记录完整验收过程

---

## 7. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| **GPU 被占，真模型跑不了** | 无法展示真模型回复 | 用 `AGENT_MODE=demo` 的 echo agent（feat-027）验收链路。链路正确性与模型回什么无关；GPU 释放后切 `AGENT_MODE=real`，**Java / Vue 零改动** |
| **WS 连接泄漏** | 长跑后连接数耗尽 | 两头都清 + `@PreDestroy` 兜底；专门写断连测试（§3.6） |
| **CORS** | Vue 请求被浏览器拦 | `CorsConfig` 显式放行 `http://localhost:5173` |
| **上游不可达（隧道断）** | 页面静默挂死 | health 端点带上游探活；WS 建连失败下发明确 `error` 事件 |
| **`message_id` 关联漏移植** | 助手气泡永远空白 | §4.3 已标注为必须保留项；`useChatStream` 测试覆盖此路径 |

---

## 8. 工作量预估

| 阶段 | 预估 |
|------|------|
| feat-160 装 JDK/Maven | 15 分钟 |
| feat-161~164 Spring Boot 侧 | 2-3 小时（WS 中继占大半） |
| feat-165~166 Vue 侧 | 1.5-2 小时（大量移植复用） |
| feat-167 端到端验收 | 30 分钟 |
| **合计** | **4-6 小时** |

---

## 9. 引用

- **需求基线**：`docs/REQUIREMENTS.md`（3 条核心需求 + 不在范围清单）
- **操作约束**：`CLAUDE.md` §1（git flow 红线）+ §3.3（Hard Constraints）+ §3.4（DoD）
- **现有架构**：`docs/ARCHITECTURE.md`
- **待移植源码**：`clients/mobile-app/src/lib/ws-chat-client.ts` + `src/hooks/useChatStream.ts`
- **上游 API**：`backend/app/api/auth.py` / `media.py` / `ws_chat.py`
- **共享契约**：`packages/api-contract/src/chat.ts` + `packages/chat-protocol/src/events.ts`
- **Feature 状态机**：`feature_list.json`

---

## 10. 版本历史

| 日期 | 版本 | 变化 |
|------|------|------|
| 2026-09-07 | v1 | 初版：用户逐段确认 §1-§4 后落库 |
