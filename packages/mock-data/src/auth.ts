import type { LoginResponse } from '@multimodal/api-contract';
import { findUserById, findUserByUsername } from './users.ts';

export type MockLoginError = 'invalid_request' | 'invalid_credentials';

export type MockLoginResult =
  | { ok: true; response: LoginResponse }
  | { ok: false; error: MockLoginError };

/**
 * Resolve a mock login attempt against the shared TEST_USERS fixture.
 *
 * Used by every client's mock layer (mobile-app msw/native, mini-program H5
 * msw/browser, mini-program weapp tarojs-plugin-mock sidecar) so they all
 * accept the same credentials and return the same response shape, matching
 * `LoginResponse` from @multimodal/api-contract.
 *
 * Password rule mirrors LoginRequestSchema (>= 8 chars). Failures are split
 * into `invalid_request` (shape / length) vs `invalid_credentials` (mismatch)
 * so handlers can map to 400 vs 401 consistently.
 */
export function mockLogin(
  username: unknown,
  password: unknown,
): MockLoginResult {
  if (typeof username !== 'string' || username.length === 0) {
    return { ok: false, error: 'invalid_request' };
  }
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, error: 'invalid_request' };
  }
  const user = findUserByUsername(username);
  if (user === undefined || user.password !== password) {
    return { ok: false, error: 'invalid_credentials' };
  }
  const ts = Date.now();
  const responseUser: LoginResponse['user'] = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    ...(user.avatar_url !== undefined ? { avatar_url: user.avatar_url } : {}),
  };
  return {
    ok: true,
    response: {
      access_token: `mock-access-${user.id}-${ts}`,
      refresh_token: `mock-refresh-${user.id}-${ts}`,
      user: responseUser,
    },
  };
}

// ===== WeChat Mini Program (feat-121) =====
//
// Real WeChat code exchange (feat-026 + feat-037) goes:
//   client Taro.login() -> wx code -> POST /auth/wechat-mini -> server
//     validates code via WeChat API -> creates/looks up user -> tokens
//
// The mock layer short-circuits the WeChat API call: any non-empty code
// resolves to a deterministic demo user so the UI can land somewhere. This
// keeps the H5 msw/browser and weapp tarojs-plugin-mock sidecar in sync
// without an external dependency.

export type MockWechatMiniError = 'invalid_code';

export type MockWechatMiniResult =
  | { ok: true; response: LoginResponse }
  | { ok: false; error: MockWechatMiniError };

/**
 * Resolve a mock WeChat-mini login attempt. Returns LoginResponse (same
 * shape as mockLogin) for any non-empty code, otherwise invalid_code.
 *
 * Always resolves to alice (user_001) — the same default the mobile-app
 * LoginScreen form reaches after a successful username/password exchange.
 */
export function mockWechatMini(code: unknown): MockWechatMiniResult {
  if (typeof code !== 'string' || code.length === 0) {
    return { ok: false, error: 'invalid_code' };
  }
  const user = findUserById('user_001');
  if (user === undefined) {
    // user_001 is part of TEST_USERS and cannot be missing; this guards the
    // type narrowing so callers get a fully-shaped LoginResponse['user'].
    return { ok: false, error: 'invalid_code' };
  }
  const ts = Date.now();
  const responseUser: LoginResponse['user'] = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    ...(user.avatar_url !== undefined ? { avatar_url: user.avatar_url } : {}),
  };
  return {
    ok: true,
    response: {
      access_token: `mock-access-${user.id}-${ts}`,
      refresh_token: `mock-refresh-${user.id}-${ts}`,
      user: responseUser,
    },
  };
}
