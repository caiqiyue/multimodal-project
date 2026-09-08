import { getAccessToken } from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export interface AuthFetchOptions extends Omit<RequestInit, 'headers'> {
  /**
   * Request headers as a plain `Record<string, string>` (NOT `HeadersInit`).
   *
   * The previous shape `HeadersInit` was passed to RN's native fetch as
   * `new Headers(headers)`, but RN's Headers polyfill drops entries under
   * some conditions (observed on iOS multipart uploads — the
   * `Authorization` header was being silently stripped from FormData POSTs,
   * causing 401s). Using a plain object sidesteps the polyfill entirely.
   *
   * For multipart uploads, pass `headers: {}` and let RN/fetch set the
   * `Content-Type: multipart/form-data; boundary=...` header itself.
   */
  headers?: Record<string, string>;
  /** Skip attaching the Authorization header (e.g. for /health, /auth/login). */
  skipAuth?: boolean;
}

/**
 * Authenticated fetch wrapper.
 *
 * - Auto-attaches `Authorization: Bearer <accessToken>` unless `skipAuth` is true.
 * - On 401 with an attached token, throws `Unauthorized`. This is the seam
 *   where the refresh interceptor will live once feat-026 backend lands:
 *   call POST /auth/refresh, persist new tokens, retry the original request.
 *   For now the error is surfaced to the caller (caller decides UX).
 */
export async function authFetch<T = unknown>(
  path: string,
  options: AuthFetchOptions = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (!skipAuth) {
    const token = await getAccessToken();
    if (token !== null && token.length > 0) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
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

/**
 * Health probe used by the dev landing view to confirm MSW is intercepting.
 * `skipAuth: true` so it works before login.
 */
export async function checkHealth(): Promise<{ status: string }> {
  return authFetch<{ status: string }>('/health', { skipAuth: true });
}
