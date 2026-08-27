# Backend (FastAPI)

Qwen3-VL 驱动的 multimodal AI assistant 后端。Stage D / E (docs/项目总执行计划.md §21-§26)。

## 启动

```bash
# 服务器侧（conda env multimodal_ai）
conda activate multimodal_ai
cp .env.example .env  # 首次：复制并填 secrets（.env 必须 gitignored + chmod 600）
uvicorn backend.app.main:app --host 127.0.0.1 --port 9000
# 验证
curl http://127.0.0.1:9000/health
open http://127.0.0.1:9000/docs   # OpenAPI UI
```

## 目录结构

```
backend/
├── app/
│   ├── main.py            # FastAPI app factory + lifespan + middleware
│   ├── api/
│   │   └── health.py      # GET / + GET /health (feat-016)
│   └── core/
│       └── config.py      # Pydantic Settings — single source of truth
├── .env.example           # 占位 env；.env 真实值不入 Git
└── README.md              # 本文件
```

## Feature 进度

| feature | 端点 | 状态 |
|---------|------|------|
| feat-016 | `GET /`, `GET /health`, `GET /docs`, `GET /openapi.json` | ✅ passing |
| feat-026 | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/wechat-mini`, `GET /api/v1/me` | ⬜ planned (this session) |
| feat-021 | `WS /api/v1/ws/chat` | ⬜ blocked by feat-017/018 |

## 安全

- 仅监听 `127.0.0.1`（Nginx 反代到 `:443` 才能对外）
- 详见 docs/SECURITY.md §2.2 + §1.4