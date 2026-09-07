import { getAccessToken } from './tokenStorage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';

export interface AuthFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export async function authFetch<T = unknown>(
  path: string,
  options: AuthFetchOptions = {}
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = { ...(headers ?? {}) };
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...rest, headers: finalHeaders });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}