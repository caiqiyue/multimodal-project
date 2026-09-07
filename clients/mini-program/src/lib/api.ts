import { getAccessToken } from './tokenStorage';
import { taroFetch } from './taroFetch';

// TARO_APP_API_BASE_URL falls through to '' in mock-first dev so MSW (H5) /
// @tarojs/plugin-mock sidecar (weapp) keep intercepting /auth/* and /health.
// When set to the real backend (e.g. http://127.0.0.1:9000/api/v1), both
// authFetch and chat WebSocket target the FastAPI server via SSH tunnel.
const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? '';

/**
 * Authenticated fetch wrapper for the mini-program.
 *
 * - Auto-attaches `Authorization: Bearer <accessToken>` unless `skipAuth` is true.
 * - On 401 with an attached token, throws `Unauthorized`. This is the seam
 *   where the refresh interceptor will live once feat-026 backend lands:
 *   call POST /auth/refresh, persist new tokens, retry the original request.
 *   For now the error is surfaced to the caller (caller decides UX).
 *
 * Uses `taroFetch` (Taro.request in weapp, native fetch in H5) — kept
 * platform-agnostic on purpose so the same auth flow works in dev (H5) and
 * production (weapp) without branching.
 */
export interface AuthFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  /** Skip attaching the Authorization header (e.g. for /health, /auth/login). */
  skipAuth?: boolean;
}

export async function authFetch<T = unknown>(
  path: string,
  options: AuthFetchOptions = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (!skipAuth) {
    const token = getAccessToken();
    if (token !== null) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }
  const response = await taroFetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method: rest.method ?? 'GET',
    headers: finalHeaders,
  });
  if (response.status === 401 && !skipAuth) {
    // TODO(feat-026): plug refresh interceptor here.
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function checkHealth(): Promise<{ status: string }> {
  return authFetch<{ status: string }>('/health', { skipAuth: true });
}