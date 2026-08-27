import type { LoginResponse } from '@multimodal/api-contract';
import { findUserByUsername } from './users';

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
