import type {
  LoginRequest,
  LoginResponse,
  User,
} from '@multimodal/api-contract/auth';
import {
  clearTokens,
  setCurrentUser,
  setTokens,
} from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

/**
 * Submit credentials to the backend (or the matching mock) and persist the
 * returned tokens + user on success. Throws an Error with a user-facing
 * message on failure; the caller surfaces it in the LoginScreen.
 */
export async function login(input: LoginRequest): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw new Error(body.error ?? `Login failed (${response.status})`);
  }
  const data: LoginResponse = await response.json();
  await setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });
  await setCurrentUser(data.user);
  return data.user;
}

/**
 * Forget the current session locally. Does not revoke the refresh token
 * server-side — that lands with feat-026's POST /auth/logout.
 */
export async function logout(): Promise<void> {
  await clearTokens();
}
