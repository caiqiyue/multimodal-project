import type { User } from '@multimodal/api-contract/auth';

const ACCESS_KEY = 'falcon.accessToken';
const REFRESH_KEY = 'falcon.refreshToken';
const USER_KEY = 'falcon.user';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function setTokens(t: StoredTokens): void {
  localStorage.setItem(ACCESS_KEY, t.accessToken);
  localStorage.setItem(REFRESH_KEY, t.refreshToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setCurrentUser(u: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as User; } catch { return null; }
}