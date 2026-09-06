# feat-019 PostgreSQL Persistence — Design Spec

**Date**: 2026-09-06 (spec written; design decisions locked Session 031 on 2026-09-05)
**Status**: Design phase complete, pending user spec review → writing-plans → implementation
**Author**: Bob (Claude) via brainstorming (Session 031)
**Codename**: Falcon
**Stage**: D_Agent_Backend / step 23
**Reference**: `feature_list.json` feat-019, `docs/项目总执行计划.md` §25

---

## 0. TL;DR

Add persistent conversation history so the chat product can survive server restarts and the frontend can show "past conversations" (unblocks **feat-140 mobile-app ambient screens**).

- **2 tables**: `conversations` (id, created_at, updated_at) + `messages` (id, conversation_id, role, content, created_at).
- **`messages.content` = JSONB** that mirrors the wire `ChatMessage.content` union (`str` *or* `list[ContentBlock]`).
- **Anonymous ownership** in V1 (no `user_id` FK); V2 (feat-025) adds the column.
- **`conversation_id` is optional** on both `/agent/invoke` (request body) and `/ws/chat` (query param). Absent → server creates one and returns it. Present → appends. **V1 demo clients need zero changes.**
- **Read API**: `GET /conversations` (list by `updated_at DESC`, paginated) + `GET /conversations/{id}` (full history).
- **Stack**: PostgreSQL 14 (apt on paper3-server) + SQLAlchemy 2.0 async + Alembic autogenerate + asyncpg.

Estimated: **~20 files** (12 new + 8 modified), **~30 new pytest**, **10 atomic commits**, **2.5-3h** server-to-server.

---

## 1. Background & Goal

### 1.1 Why persistence now

The chat product today is **stateless** — every `/agent/invoke` and every WS turn ships the full history in the request payload. That's fine for a single demo session but blocks three real product needs:

| Need | Today | After feat-019 |
|------|-------|----------------|
| Server restart loses history | ❌ | ✅ |
| Frontend "past conversations" screen (feat-140) | ❌ | ✅ |
| Future user_id binding (feat-025 WS auth) | ❌ | trivially additive |

### 1.2 Why not later

- **Mobile-app conversation screen (feat-140)** is the next major UX investment and *requires* a server-side history endpoint.
- **V1 GPU is busy** (1× A6000 at 100% util since 2026-08-31). Persistence is **vLLM-independent** — same reason Session 024/025/028/029 succeeded without vLLM.

### 1.3 What this spec is NOT

- **Not** training-line work (feat-001~050 frozen).
- **Not** WS auth (feat-025).
- **Not** user management (in-memory users stays; this feature adds no user-facing tables).
- **Not** media persistence (media is file-based on disk — feat-020; out of scope here).

---

## 2. Scope

### 2.1 ✅ IN (this feature)

1. PostgreSQL 14 installed via `apt` on paper3-server with `multimodal` superuser + `multimodal_ai` database.
2. Two tables: `conversations`, `messages`. JSONB content. Two indexes (`updated_at DESC` for list; `(conversation_id, created_at ASC)` for history fetch).
3. Async SQLAlchemy 2.0 engine + session factory + `get_db()` FastAPI dependency.
4. ORM models + Alembic init + 1 initial migration.
5. `ConversationService` (repository pattern) in `backend/app/services/conversations.py`: `create`, `get_or_create`, `get`, `list_recent`, `list_messages`, `append_message`, `touch`.
6. `GET /api/v1/conversations?limit=&offset=` — paginated list by `updated_at DESC`.
7. `GET /api/v1/conversations/{id}` — full message history with chat-shape content blocks.
8. `POST /api/v1/agent/invoke` — **optional** `conversation_id` in request body; **always** returned in response. Server auto-creates when absent.
9. `WS /api/v1/ws/chat?conversation_id=...` — optional query param read on handshake; **same envelope `conversation_id` field** in every wire event. Server creates one when absent.
10. `backend/README.md` updated with PostgreSQL setup section.

### 2.2 ⏸ DEFER (NOT in this feature)

- `user_id` FK everywhere (V2 / feat-025).
- WS auth / V1 WS token gate (V2 / feat-025).
- Title column on `conversations` (V2 once `user_id` lands).
- Conversation delete endpoint (V2 — V1 demo clients don't need it).
- Conversation list filtering by user (V2).
- Caching layer / Redis (V2 / feat-039).
- Soft delete / archival (V2).
- Alembic downgrade tested in CI (V2).
- Multi-turn agent context window pruning (V2).

### 2.3 ❌ OUT (V1 不做)

- 多租户 / org ownership.
- Sharing conversations between users.
- Encrypted-at-rest columns.
- Per-user rate limits on conversation creation.

---

## 3. Architecture

### 3.1 Layered diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Routers (thin)                                              │
│   api/agent.py        → POST /agent/invoke  (persist turn)  │
│   api/ws_chat.py      → WS  /ws/chat         (persist turn) │
│   api/conversations.py→ GET  /conversations  (list)         │
│                       → GET  /conversations/{id} (history)  │
└─────────────────────────────────────────────────────────────┘
            │ Depends(get_db)  ──────────────────────────────────┐
            ▼                                                    │
┌─────────────────────────────────────────────────────────────┐ │
│ Service (repository pattern)                                 │ │
│   services/conversations.py: ConversationService            │ │
│     - get_or_create / get / create                          │ │
│     - append_message / list_recent / list_messages / touch  │ │
└─────────────────────────────────────────────────────────────┘ │
            │                                                   │
            ▼                                                   │
┌─────────────────────────────────────────────────────────────┐ │
│ ORM Models (SQLAlchemy 2.0 async)                           │ │
│   models/conversation.py: Conversation + Message            │ │
└─────────────────────────────────────────────────────────────┘ │
            │                                                   │
            ▼                                                   │
┌─────────────────────────────────────────────────────────────┐ │
│ DB Session (FastAPI dependency)                             │ │
│   db/session.py:                                              │
│     - async_engine = create_async_engine(DATABASE_URL)       │
│     - AsyncSessionLocal = async_sessionmaker(...)             │
│     - get_db(): AsyncSession = Depends(...) → yield          │
└─────────────────────────────────────────────────────────────┘ │
            │                                                   │
            ▼                                                   │
       PostgreSQL 14 (paper3-server, apt install) ◄──────────────┘
```

### 3.2 Module tree (target)

```
backend/
├── app/
│   ├── api/
│   │   ├── agent.py            [MODIFIED — optional conversation_id]
│   │   ├── ws_chat.py          [MODIFIED — ?conversation_id= query]
│   │   └── conversations.py    [NEW     — read-only router]
│   ├── services/
│   │   ├── __init__.py         [NEW     — package marker]
│   │   └── conversations.py    [NEW     — repository: get/create/append/list]
│   ├── models/
│   │   ├── __init__.py         [NEW     — re-exports]
│   │   └── conversation.py     [NEW     — Conversation + Message ORM]
│   ├── db/
│   │   ├── __init__.py         [NEW     — package marker]
│   │   └── session.py          [NEW     — engine + sessionmaker + get_db()]
│   ├── core/
│   │   └── config.py           [MODIFIED — add database_url setting]
│   ├── schemas/
│   │   └── agent.py            [MODIFIED — conversation_id on request/response]
│   └── main.py                 [MODIFIED — mount router + lifespan engine.dispose]
├── alembic/
│   ├── env.py                  [NEW     — Alembic env (async-compatible)]
│   ├── script.py.mako          [NEW     — autogenerated template]
│   └── versions/
│       └── 0001_initial_conversations.py  [NEW — initial migration]
├── alembic.ini                 [NEW     — Alembic config]
├── tests/
│   ├── conftest.py             [MODIFIED — add db fixture + dependency override]
│   └── test_conversations.py   [NEW     — ~30 pytest cases]
├── .env.example                [MODIFIED — add DATABASE_URL]
└── README.md                   [MODIFIED — PostgreSQL setup section]
```

**~12 new files + ~8 modified = ~20 files total.**

---

## 4. Data Model (DDL)

### 4.1 `conversations` table

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversations_updated_at_desc
    ON conversations (updated_at DESC);
```

**Notes:**
- **No `user_id` FK** (Decision 1 — V1 anonymous; V2 feat-025 adds column).
- **No `title`** — V1 demo doesn't need it; V2 adds once user_id is in.
- `id UUID` — unguessable (matches the WS current UUID4 convention; future client uses as key).
- `updated_at` is bumped on every `append_message` (`touch()` helper in service).

### 4.2 `messages` table

```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL
                        REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(16) NOT NULL
                        CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         JSONB NOT NULL,   -- str OR list[{type,text|image_url,...}]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation_id_created_at_asc
    ON messages (conversation_id, created_at ASC);
```

**Notes:**
- **`content JSONB`** matches wire shape: each row stores either `"hello"` (text) or `[{"type":"text","text":"..."},{"type":"image_url","image_url":{...}}]` (multi-modal). On read, `model_validate` into `ChatMessage` Pydantic schema — same coercion as the wire.
- `role VARCHAR(16) CHECK (user|assistant|system|tool)` — V2 reserves `'tool'` for tool-result persistence (currently skipped by `_from_langchain`).
- `ON DELETE CASCADE` so deleting a conversation wipes its messages atomically (V2 admin tooling).
- **Block-count cap preserved**: `blocks_to_lc_content()` already enforces 1..16; we don't duplicate at the DB layer.
- **Idempotency**: append uses a `client_message_id` only if/when wire shape adds one (V2). V1 simply inserts every message that arrives.

### 4.3 Why JSONB for `content`

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `TEXT` (stringified JSON) | Simple | Loses type discrimination on read; every read pays parse cost | ❌ |
| `JSONB` | Native PG; indexable later (V2 search); mirrors wire `Union[str, list]` via Pydantic validation | Slightly bigger than `TEXT` | ✅ |
| Two columns `content_text` + `content_blocks` | Type-safe at DB layer | Doesn't match wire shape; needs merge logic; migrations double | ❌ |

`JSONB` fits because wire `ChatMessage.content` is *literally* JSON-serializable as-is.

---

## 5. API Design

### 5.1 `GET /api/v1/conversations?limit=50&offset=0` (NEW)

**Auth**: V1 none (matches `/agent/invoke`, `/ws/chat`).
**Path**: `backend/app/api/conversations.py`

```python
class ConversationListItem(BaseModel):
    id: str  # UUID string
    created_at: datetime
    updated_at: datetime

class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]
    total: int
    limit: int
    offset: int

@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ConversationListResponse:
    """List recent conversations (most-recently-touched first)."""
    service = ConversationService(db)
    items, total = await service.list_recent(limit=limit, offset=offset)
    return ConversationListResponse(
        items=[ConversationListItem.model_validate(c) for c in items],
        total=total,
        limit=limit,
        offset=offset,
    )
```

**Behavior:**
- Ordered by `updated_at DESC`.
- `total` = full count (cheap: PG `COUNT(*)` on small N for V1).
- Default `limit=50`, max `200`. `offset` for pagination.

### 5.2 `GET /api/v1/conversations/{id}` (NEW)

```python
class ConversationDetailResponse(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessage]  # reuse wire schema — JSONB → Pydantic

@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
) -> ConversationDetailResponse:
    """Full conversation history with chat-shape content blocks."""
    service = ConversationService(db)
    conv = await service.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    messages = await service.list_messages(conversation_id)
    return ConversationDetailResponse(
        id=str(conv.id),
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[ChatMessage.model_validate(m.role_and_content()) for m in messages],
    )
```

**Errors:**
- `404` if `id` not found (UUID string validates but no row).
- `422` if `id` not a valid UUID (Pydantic auto-validates the path param).

### 5.3 `POST /api/v1/agent/invoke` (MODIFIED)

**Backward-compat**: existing V1 callers (mobile-app + mini-program) work unchanged — they ignore `conversation_id` (extra="ignore" via existing Pydantic config? → need to check; if extra="forbid", add field as Optional with default None).

```python
class AgentInvokeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage]
    conversation_id: str | None = None  # NEW: optional; auto-create if absent

class AgentInvokeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage]
    reply: str
    conversation_id: str  # NEW: always present (echoed or freshly created)
```

**Persistence semantics** (added to `invoke()` body):

```python
service = ConversationService(db)
conv = await service.get_or_create(body.conversation_id)  # may be None if not provided
await service.append_message(conv.id, role="user", content=lc_messages[-1].content)
# ... agent.invoke ...
final = lc_messages[-1]  # the AIMessage
await service.append_message(conv.id, role="assistant", content=final.content)
await service.touch(conv.id)
return AgentInvokeResponse(..., conversation_id=str(conv.id))
```

**Important**: the conversation is created **before** the agent runs (so even if the agent throws, the user's turn is durably recorded). On agent error → still 502, but the user message stays in DB.

### 5.4 `WS /api/v1/ws/chat?conversation_id=...` (MODIFIED)

**Backward-compat**: existing WS callers work unchanged — query param is optional.

```python
@router.websocket("/ws/chat")
async def ws_chat(
    ws: WebSocket,
    conversation_id: str | None = None,  # NEW: FastAPI reads ?conversation_id=... query
) -> None:
    await ws.accept()
    # Resolve conversation_id (create if absent) using the same get_or_create helper.
    async with db_session_factory() as db:
        service = ConversationService(db)
        conv = await service.get_or_create(conversation_id)
        real_conv_id = str(conv.id)
        await db.commit()
    ...
    # Replace existing `conversation_id = str(uuid.uuid4())` with `real_conv_id`.
```

**Persistence inside `_stream_turn`** (same semantics as HTTP `/agent/invoke`):
- Wire payload `payload.messages` carries the full conversation history (chat shape). We persist **only the last user message** in the payload (the new turn). Prior messages are already in the DB from previous calls (or, on first call, `get_or_create` just minted the row).
- After `message.done`, persist the assistant turn with `full_content` (the accumulated string from `message.delta` events).
- Call `touch(real_conv_id)` to bump `updated_at`.
- **Rationale**: the agent needs the full history for context, but the DB only needs the new turns. Persisting all input messages every turn would duplicate prior rows and confuse `GET /conversations/{id}` ordering.

**Wire envelope unchanged**: `_envelope(conversation_id)` still emits `conversation_id` as the first field of every event — clients don't need code changes.

---

## 6. Migration Strategy

### 6.1 Server-side install (no Docker)

```bash
# On paper3-server (Ubuntu)
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create role + db
sudo -u postgres createuser -s multimodal  # -s = superuser for dev; tighten in prod
sudo -u postgres createdb -O multimodal multimodal_ai

# Verify
sudo -u postgres psql -c "\l" | grep multimodal_ai
```

`postgresql-contrib` ships `gen_random_uuid()` (otherwise need `pgcrypto` extension explicit).

### 6.2 systemd

PG14 ships a `postgresql.service` unit via apt; `enable + start` is sufficient. No custom unit needed.

### 6.3 Alembic

- `alembic init backend/alembic` (creates dir + `alembic.ini`).
- Edit `alembic/env.py` to use our async engine + `Base.metadata`.
- `Base = DeclarativeBase` lives in `backend/app/db/base.py` and is imported by `models/conversation.py`. This keeps `db/session.py` (engine/session) decoupled from `models/` (schema) so Alembic env.py can import just `Base` without pulling in the engine.
- `alembic revision --autogenerate -m "feat-019 initial conversations + messages"` → produces `versions/0001_initial_conversations.py`.
- `alembic upgrade head` → creates both tables + indexes.

The generated migration is committed; future schema changes follow the same workflow.

---

## 7. Testing

### 7.1 Test pyramid (target ~30 new cases)

| Layer | Count | Examples |
|-------|-------|----------|
| ORM model unit | 5 | insert+roundtrip, FK cascade delete, JSONB content shape, role CHECK constraint, index usage (smoke) |
| ConversationService unit | 10 | create, get_or_create (present/missing), get (missing→None), list_recent (order), list_messages (order), append_message, touch bumps updated_at, JSONB content roundtrip |
| API read endpoint | 5 | 200 happy path, 404 unknown id, 422 invalid uuid, pagination (limit/offset/total), empty list |
| API + WS round-trip integration | 10 | POST /agent/invoke (no conv_id) → auto-creates, same conv_id → appends, GET /conversations/{id} returns history, agent error 502 still persists user turn, WS ?conversation_id= same persistence, WS no param creates one, WS error event still persists user, GET /conversations ordering, **5 happy paths + 5 error paths** |

### 7.2 DB fixture strategy

```python
# tests/conftest.py additions
@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """Per-test transactional DB session. Rolls back at end."""
    async with engine.connect() as conn:
        trans = await conn.begin()
        async with AsyncSession(bind=conn) as session:
            yield session
        await trans.rollback()

@pytest.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    """TestClient with get_db overridden to use the per-test session."""
    async def _override_db() -> AsyncIterator[AsyncSession]:
        yield db
    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(app=app, ...) as c:
        yield c
    app.dependency_overrides.clear()
```

**Two-tier strategy**:
1. **Unit tests** (ORM + service) hit the **real PG test database** via per-test transaction rollback — fastest fidelity, no Docker.
2. **Integration tests** (API + WS) use `AsyncClient` + `app.dependency_overrides[get_db]` — also real PG.

**Why not SQLite**: SQLAlchemy JSONB is PostgreSQL-only; SQLAlchemy would need dialect-specific type adapters. Real PG is the right call — paper3-server has it.

**Test DB**: separate `multimodal_ai_test` database, created in conftest at session scope, dropped at session end.

### 7.3 Coverage target

- **≥85%** for new files (`services/`, `models/`, `db/`, `api/conversations.py`, `api/agent.py` modified block, `api/ws_chat.py` modified block).
- **No regression** on the existing 147 pytest cases.

---

## 8. The 4 Locked Design Decisions

> Locked Session 031 (2026-09-05) via brainstorming Q&A. Repeating verbatim here so the spec is self-contained.

### Decision 1 — Anonymous ownership (no `user_id` FK)

- **V1**: `conversations` has no `user_id`. Anyone can see any conversation if they know the UUID (UUID4 is unguessable in practice).
- **V2**: feat-025 WS auth adds `user_id` column + backfill-on-write strategy.
- **Rationale**: zero user model churn in V1; conversation lookup by UUID4 is sufficient for demo.

### Decision 2 — Native apt install (no Docker)

- **Choice**: `apt install postgresql` on paper3-server → systemd service → `createuser` + `createdb`.
- **Rationale**: paper3-server already runs apt-installed services; no Docker dependency; systemd gives free restart policy.

### Decision 3 — Both endpoints support optional `conversation_id`

- **WS**: `?conversation_id=...` query param.
- **HTTP**: `body.conversation_id` field.
- **Absent → server creates + returns id**.
- **Present → server appends** (404 → auto-creates? **NO** — 404 if not found; clients should only pass ids they got from us).
- **Rationale**: V1 demo clients (mobile-app + mini-program) work unchanged; advanced clients can pin ids.

### Decision 4 — Full read API (list + detail)

- **Endpoints**: `GET /conversations` (list) + `GET /conversations/{id}` (detail).
- **Rationale**: unblocks feat-140 mobile-app conversation list screen + provides the GET story that survives the resize of stateless → stateful.

---

## 9. Definition of Done (4+4)

### 9.1 ✅ DoD (all 4 must pass for `passing` status)

- [ ] Code implemented: 12 new + 8 modified files (per §3.2).
- [ ] Verification ran: paper3-server `apt install` + `alembic upgrade head` + `pytest 147+30` all pass + live curl + live WS round-trip.
- [ ] Evidence written: `feature_list.json` feat-019 `evidence` field populated + `evidence/feat-019-postgres.log` exists.
- [ ] Repo restarts from `./init.sh` with no manual fixes.

### 9.2 🚫 Don't-touch list (4 categories)

#### 9.2.1 Out of scope (V1 — defer to V2/feat-025)

- ❌ Don't add `user_id` anywhere (no FK, no column).
- ❌ Don't add WS auth gate (no token validation in WS handshake).
- ❌ Don't add Redis / cache layer.
- ❌ Don't add conversation delete endpoint.
- ❌ Don't add conversation title column.
- ❌ Don't add per-user rate limit.

#### 9.2.2 Don't change (preserves V1 contracts)

- ❌ Don't modify `backend/app/core/users.py` (in-memory user store stays).
- ❌ Don't modify `/auth/wechat-mini` V1 stub (feat-037 makes real).
- ❌ Don't modify `.env.example` JWT secret default value.
- ❌ Don't modify `start_vllm.sh` 6 hardening flags.
- ❌ Don't modify `MAX_BLOCKS_PER_MESSAGE = 16`.
- ❌ Don't modify `_from_langchain` filter order (Session 016 + 018 locked).
- ❌ Don't modify `ws_chat.py` `pending_tool_call_id` correlation logic (Session 017 locked).
- ❌ Don't modify chat-protocol envelope fields (`id` / `conversation_id` / `created_at` — V1 contract).
- ❌ Don't modify `tools.py` calculator / server_info.

#### 9.2.3 Don't touch gitignored content

- ❌ Don't commit `backend/.env`, `docs/信息.txt`, model weights, dataset files, or anything in `.gitignore`.

#### 9.2.4 Don't sync local → server directly

- ❌ No `scp` / `rsync` / `SFTP` / `WebDAV` / NFS / SMB direct transfer.
- ❌ No VS Code Remote-SSH editing server files.
- ✅ Local Windows/Mac → GitHub → server `git pull --ff-only` (the only allowed flow).

---

## 10. Risks & Open Questions

| Risk | Mitigation |
|------|-----------|
| paper3-server `/data` not writable for PG data dir | Use default `/var/lib/postgresql/14/main` (apt default) + symlink if needed |
| Alembic autogenerate drops subtle type info | Manually verify generated migration; check `JSONB` not `JSON` |
| `gen_random_uuid()` not available without `pgcrypto` | `apt install postgresql-contrib` includes `pgcrypto`; verify with `SELECT * FROM pg_extension;` |
| Test DB pollution between sessions | Per-test transaction rollback (conftest); session-scope create/drop test DB |
| PG `updated_at` not auto-bumped on append | Manual `touch()` call after every `append_message`; index includes DESC; no trigger needed for V1 |
| Connection pool exhaustion under WS load | `pool_size=5, max_overflow=10` defaults; revisit if WS concurrent > 50 |
| Migration drift between dev Mac and paper3-server | Alembic env reads same `DATABASE_URL`; CI smoke (out of scope V1, manual diff in V2) |

---

## 11. Implementation Outline (preview for `writing-plans`)

> Not a substitute for the `writing-plans` skill output — just the file inventory for size estimation.

**Estimated 10 atomic commits (chronological):**

1. `chore(server): feat-019 apt install postgresql + createuser + createdb`
2. `feat(backend): feat-019 SQLAlchemy 2.0 async engine + session factory + get_db dependency`
3. `feat(backend): feat-019 Conversation + Message ORM models`
4. `feat(backend): feat-019 Alembic init + initial migration (2 tables + 2 indexes)`
5. `feat(backend): feat-019 ConversationService (repository pattern)`
6. `feat(backend): feat-019 GET /conversations + GET /conversations/{id} endpoints`
7. `feat(backend): feat-019 /agent/invoke optional conversation_id persistence`
8. `feat(backend): feat-019 /ws/chat ?conversation_id= persistence + get_or_create on handshake`
9. `test(backend): feat-019 ~30 pytest cases (models + service + API + WS round-trip)`
10. `docs(backend): feat-019 README.md PostgreSQL setup + evidence log`

**Estimated time**: 2.5-3h (server install ~30min, backend code ~90min, tests ~30min, smoke + commit ~30min).

---

## 12. After Approval

1. Commit this spec to git.
2. User reviews spec (this file).
3. On approval → invoke `superpowers:writing-plans` skill → produces `docs/superpowers/plans/feat-019-postgres.md` with concrete tasks + verification hooks.
4. Execute plans via subagent orchestration (parallel where possible).
5. Server verification: `apt install` + `alembic upgrade head` + `pytest` + live curl + WS round-trip.
6. Update `feature_list.json` feat-019 → `passing` + `claude-progress.md` Session 032 entry + `session-handoff.md` + `CLAUDE.md` §10.
7. Unblock: Session 033 = feat-140 mobile-app conversation list screen (mobile-app) + Session 034 = feat-140 mini-program equivalent.
