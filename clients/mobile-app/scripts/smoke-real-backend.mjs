#!/usr/bin/env node
/**
 * Session 013 — end-to-end smoke that mimics what mobile-app does at runtime:
 *
 *   1. Load `.env.local` (same way Metro does for `expo start`).
 *   2. Resolve EXPO_PUBLIC_API_BASE_URL.
 *   3. POST /auth/login with alice creds  →  assert LoginResponse shape.
 *   4. Use returned access_token
 *      GET  /me                              →  assert User shape and echo.
 *
 * If this passes, the dev bundle running on a real iOS Simulator would land
 * on the same wire-level behavior; only the runtime shell (RN fetch vs
 * node fetch, Hermes vs V8) differs.
 *
 * Run:  node clients/mobile-app/scripts/smoke-real-backend.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env.local');

// 1. Load .env.local (no extra dep — parse EXPO_PUBLIC_* ourselves).
const envText = readFileSync(ENV_PATH, 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
    }),
);
const BASE = env.EXPO_PUBLIC_API_BASE_URL;
if (!BASE) {
  console.error('FATAL: EXPO_PUBLIC_API_BASE_URL not set in .env.local');
  process.exit(2);
}
console.log(`→ BASE = ${BASE}`);

// 2. POST /auth/login — match @multimodal/api-contract LoginRequest exactly.
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'alice1234' }),
});
if (!loginRes.ok) {
  console.error(`FATAL: login HTTP ${loginRes.status}`);
  console.error(await loginRes.text());
  process.exit(1);
}
const login = await loginRes.json();
console.log('✓ /auth/login HTTP 200');

// 3. Validate LoginResponse shape (subset, mirrors api-contract).
const checks = [
  ['access_token', typeof login.access_token === 'string' && login.access_token.length > 0],
  ['refresh_token', typeof login.refresh_token === 'string' && login.refresh_token.length > 0],
  ['user.id', typeof login.user?.id === 'string'],
  ['user.username', login.user?.username === 'alice'],
  ['user.display_name', typeof login.user?.display_name === 'string'],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}
if (!ok) {
  console.error('FATAL: LoginResponse shape mismatch');
  process.exit(1);
}
console.log(`✓ LoginResponse matches @multimodal/api-contract schema`);
console.log(`  user = ${JSON.stringify(login.user)}`);

// 4. GET /me with bearer token.
const meRes = await fetch(`${BASE}/me`, {
  headers: { Authorization: `Bearer ${login.access_token}` },
});
if (!meRes.ok) {
  console.error(`FATAL: /me HTTP ${meRes.status}`);
  console.error(await meRes.text());
  process.exit(1);
}
const me = await meRes.json();
console.log('✓ /me HTTP 200');

// 5. Assert /me echoes the user we just got.
if (me.id !== login.user.id || me.username !== login.user.username) {
  console.error('FATAL: /me did not echo login.user');
  console.error({ login: login.user, me });
  process.exit(1);
}
console.log('✓ /me echoes login.user (id + username match)');
console.log('');
console.log('═══ End-to-end login → /me verified against real backend ═══');