import { LoginRequestSchema, type LoginResponse, type User } from '@multimodal/api-contract/auth';
import { clearTokens, setCurrentUser, setTokens } from './tokenStorage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';

export async function login(input: { username: string; password: string }): Promise<User> {
  const response = await fetch(`${BASE_URL}/api/web/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid username or password');
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Login failed (${response.status})`);
  }
  const data: LoginResponse = await response.json();
  setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
  setCurrentUser(data.user);
  return data.user;
}

export function logout(): void {
  clearTokens();
}