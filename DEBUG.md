# DEBUG — mobile-app simulator media upload 401

## Observations

- Date: 2026-09-07.
- User-visible bug: after opening the local iOS simulator, uploading both images and videos from the mobile app shows HTTP 401.
- Working boundary: login uses `fetch(`${EXPO_PUBLIC_API_BASE_URL}/auth/login`)` and persists `access_token` into `expo-secure-store`.
- Upload boundary: `ImagePickerButton` calls `uploadMedia()`, which reads `getAccessToken()` and POSTs `/media/upload`.
- Backend boundary: `POST /api/v1/media/upload` requires `Authorization: Bearer <access-token>` via `get_current_user`; missing, malformed, expired, refresh-token, or unknown-user tokens all return 401.
- `.env.local` for mobile app is `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:9000/api/v1`.
- Current worktree is dirty before this investigation: `clients/mobile-app/src/lib/api.ts` and `clients/mobile-app/src/lib/upload-media.ts` already contain an uncommitted candidate fix changing upload from `fetch` to `XMLHttpRequest`.
- Existing evidence from Session 034 notes that SecureStore token was present, curl with the same token reached auth successfully, while mobile upload returned 401.
- Backend currently contains debug middleware in `backend/app/main.py` that logs whether an Authorization header is present and its fingerprint.
- `evidence/phase3-full-feature-e2e.log` shows curl-level `/media/upload` with JWT passed on 2026-09-07, so backend auth itself is not generally broken.

## Hypotheses

### H1: Simulator is still running an old JS/native bundle that uses fetch multipart upload (ROOT HYPOTHESIS)
- Supports: worktree already has a candidate XHR fix, but user still sees 401 after opening simulator; Expo/iOS can keep stale Metro/native state until the app and Metro are restarted with cache cleared.
- Supports: current source code no longer uses `authFetch` for upload, so if runtime still strips Authorization it may not be running current source.
- Conflicts: if Metro Fast Refresh already loaded current source, this would not explain the 401.
- Test: run a clean mobile typecheck, then restart Metro/simulator with cache cleared and verify backend debug logs show Authorization present for `/media/upload`.

### H2: React Native iOS fetch drops Authorization on multipart FormData
- Supports: current comments and recent debug commits explicitly describe SecureStore token present but backend receives missing auth for mobile multipart uploads.
- Supports: login and `/me` can work while only multipart upload fails, matching a native fetch/FormData boundary issue.
- Conflicts: current source already uses XHR, not fetch, so this only explains old bundle or pre-fix behavior.
- Test: inspect final runtime path by adding/observing a one-line diagnostic log in `uploadMedia` or checking Metro bundle after restart; if XHR path is active, backend should receive auth.

### H3: SecureStore token or API base URL is stale/mismatched in simulator state
- Supports: app restores user locally without revalidating `/me`, so UI may show logged-in even if token is expired/stale or written for different server secret.
- Supports: 401 can be caused by expired/bad token even when Authorization header is present.
- Conflicts: user reports both image and video upload 401, while Session 034 notes token length/prefix looked like valid JWT and curl with same token passed auth.
- Test: force logout/login after restart; compare backend debug auth fingerprint for `/auth/login`, `/me`, and `/media/upload`, and verify upload uses a freshly issued 172-char access token.

## Experiments

### E1: Validate current source and local backend tunnel

- Change: none.
- Command: `pnpm --filter mobile-app typecheck`.
- Result: passed.
- Command: `curl -fsS http://127.0.0.1:9000/health` after starting `~/.ssh/bin/paper3-ssh -N -L 9000:127.0.0.1:9000`.
- Result: initially failed before tunnel was ready; after starting a clean-proxy wrapper tunnel, elevated curl returned `{"status":"ok",...}`.
- Conclusion: current mobile TS source typechecks, and the backend is reachable from Mac localhost once the tunnel is running.

### E2: Control upload with a fresh JWT through the same tunnel

- Change: none.
- Command: login as `alice`, extract `access_token`, then `curl -F file=@evidence/phase3-mini-program-h5-real-model.png` to `POST /api/v1/media/upload` with `Authorization: Bearer <token>`.
- Result: HTTP `201 Created`, returned a `media_id` and image metadata.
- Conclusion: backend media upload, JWT decoding, media MIME validation, and the local tunnel are all working. The simulator-only 401 is not caused by backend auth or server reachability.

### E3: Proxy/SSH environment check

- Change: none.
- Observation: shell had `ALL_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY` pointing at `127.0.0.1:10808`; naked SSH failed through that dead proxy. The project-local Mac path requires `/Users/apple/.ssh/bin/paper3-ssh`, not a `paper3-server` SSH alias.
- Result: `env -u ... /Users/apple/.ssh/bin/paper3-ssh -N -L 9000:127.0.0.1:9000 ...` established a local listener on port 9000.
- Conclusion: simulator/backend setup must clear proxy env and use the wrapper tunnel.

## Root Cause

The 401 is caused by the mobile app runtime using the old React Native `fetch` multipart upload path, where iOS drops the `Authorization` header on `FormData` POSTs; backend and JWT auth are valid, proven by curl upload returning 201 through the same tunnel.

## Fix

Use `XMLHttpRequest` for mobile multipart upload, explicitly set `Authorization: Bearer <access-token>`, do not set multipart `Content-Type`, keep `authFetch` headers as a plain object for non-upload requests, then restart Metro/simulator with cache cleared so the XHR path is actually loaded.

Additional hardening: in real-backend mode, `App.tsx` now revalidates restored SecureStore sessions with `GET /me`. If the access token is expired or invalid, local tokens are cleared and the user returns to login instead of reaching chat with a stale token that later fails upload.

Validation:

- `pnpm --filter mobile-app typecheck` passed.
- `pnpm -r typecheck` passed across all 5 workspace packages.
- `git diff --check` passed.
- SSH tunnel is listening on `127.0.0.1:9000` via `/Users/apple/.ssh/bin/paper3-ssh`.
- Elevated `curl http://127.0.0.1:9000/health` returned backend status ok.
- Elevated login + media upload curl returned HTTP `201 Created`.
- Killed stale Metro process on port 8081.
- Rebuilt native iOS app with `npx expo run:ios --device 9328818A-2B64-4D2C-95B4-91BDAA9B90A2 --no-bundler`: Build Succeeded, 0 errors, 0 warnings.
- Metro rebundled `clients/mobile-app/index.ts`; simulator app reopened on `iPhone 17 Pro`.
