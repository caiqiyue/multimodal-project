import { getAccessToken } from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export interface AuthFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit;
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
  const finalHeaders = new Headers(headers);
  if (!skipAuth) {
    const token = await getAccessToken();
    if (token !== null && token.length > 0) {
      finalHeaders.set('Authorization', `Bearer ${token}`);
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
