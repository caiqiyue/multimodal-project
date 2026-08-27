# Frontend Next-Step Decision

> 日期：2026-08-27
> 目的：把当前项目状态、决策依据、推荐下一步和执行顺序固定成仓库内文档，供后续 session 直接复用。

## 1. 当前真实状态

### 已完成且有证据

- `feature_list.json` 已同步 `H_Frontend_MVP`（feat-100~150 + feat-V.1）
- 当前 passing：
  - `feat-100` Mac dev toolchain baseline
  - `feat-101` pnpm monorepo
  - `feat-102` `@multimodal/api-contract`
  - `feat-103` `@multimodal/chat-protocol`
  - `feat-104` `@multimodal/mock-data`
  - `feat-105` MSW framework integrated in both clients
  - `feat-110` mobile-app skeleton
  - `feat-111` mini-program skeleton
  - `feat-V.1` monorepo verification suite
- 双端 mock `/health` 已验证：
  - mobile-app：`msw/native`
  - mini-program H5：MSW Service Worker
  - mini-program weapp：`@tarojs/plugin-mock` sidecar

### 尚未完成但很关键

- mock 层目前**只有** `/health`
- `feat-120` mobile-app Auth 未开始
- `feat-121` mini-program Auth 未开始
- `feat-130/131` Chat 未开始

### 当前外部依赖阻塞

- `feat-026` JWT auth backend 未做
- `feat-021` WebSocket backend 未做
- `feat-037` WeChat AppID / AppSecret 未做

## 2. 决策判断

### 为什么不建议纯 Option A

纯 housekeeping 的价值有限。当前最关键的不再是“编号是否整洁”，而是“前端能不能继续独立推进”。`superseded_by` 映射是有用的，但不构成当前主阻塞。

### 为什么不建议直接硬上完整 Option B

`feat-120` 在状态机里依赖 `feat-026`。如果不先补 mock `/auth/login`，我们最多只能写出静态登录 UI，无法完整走 token 获取、持久化、恢复登录态这些真正有价值的路径。

### 为什么暂不建议 Option C

mini-program Auth 额外受 `feat-037` 影响，需要 WeChat 侧能力。即使能先 mock `wx.login`，它的验证链路仍比 mobile-app 更绕，反馈速度更慢。

### 为什么暂不建议 Option D / E

Chat 直接卡在 `feat-021` WebSocket backend。当前进入 Chat 会让前端工作很快碰到后端墙。

## 3. 推荐路线

推荐采用 **Option A-min + feat-120 前半段**。

这不是“先做文档再做功能”，而是先做最小必要解耦，再立即做能看见产品进展的功能。

### Session 010 推荐目标

1. 扩充 mock 端点
2. 启动 mobile-app Auth

### 具体顺序

1. 给两套 mock 同步补上 `/auth/login`
2. 约定返回体 shape：
   - `access_token`
   - `refresh_token`
   - `token_type`
   - 可选 `user`
3. 如果成本很低，顺手补 `/auth/wechat-mini`
4. 如果 fixtures 已够用，顺手补 `/conversations`
5. 开始 `feat-120`
   - Login screen
   - 表单输入与错误态
   - JWT 存储（`expo-secure-store`）
   - 冷启动恢复登录态
   - 为 future refresh interceptor 预留层

## 4. 执行边界

### 这一步不要做的事

- 不要切回服务器训练主线
- 不要碰 `feat-021` WebSocket backend
- 不要碰真实 `wx.login` 接入
- 不要为“做完整 B”去先写后端 JWT
- 不要改已验证稳定的 MSW 接线方式

### 这一步允许的事

- 扩 mock handlers
- 调整 shared contract 以对齐 auth response
- 做 mobile-app 登录流与本地 token 生命周期
- 增加对应 evidence / handoff / progress 记录

## 5. 建议的验收口径

如果下个 session 走推荐路线，则最小验收可以定义为：

- mock `POST /auth/login` 可返回稳定 JWT payload
- mobile-app 登录页可提交并进入已登录态
- token 可持久化并在重启后恢复
- `feature_list.json`、`claude-progress.md`、`session-handoff.md` 同步更新

## 6. 一句话结论

**最佳下一步不是纯 Option A，也不是直接完整 Option B，而是先补 auth mock，再推进 mobile-app Auth。**
