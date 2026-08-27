import type { User } from '@multimodal/api-contract';
import Taro from '@tarojs/taro';

// Taro.setStorageSync / getStorageSync / removeStorageSync back onto:
//   - h5     -> localStorage (browser)
//   - weapp  -> wx.setStorageSync (10 MB per-key limit, survives kill+relaunch)
//   - other  -> the platform's per-target impl
//
// We use the sync variants so the LoginScreen can hand tokens to AuthState
// before its first re-render, mirroring mobile-app's expo-secure-store flow.
// Taro.login() code is short-lived and intentionally not persisted.

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function setTokens(tokens: StoredTokens): void {
  Taro.setStorageSync(ACCESS_TOKEN_KEY, tokens.accessToken);
  Taro.setStorageSync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function getAccessToken(): string | null {
  const value = Taro.getStorageSync(ACCESS_TOKEN_KEY);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getRefreshToken(): string | null {
  const value = Taro.getStorageSync(REFRESH_TOKEN_KEY);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function clearTokens(): void {
  // removeStorageSync returns boolean; swallow false (key not present) so
  // callers don't have to special-case first-launch.
  Taro.removeStorageSync(ACCESS_TOKEN_KEY);
  Taro.removeStorageSync(REFRESH_TOKEN_KEY);
  Taro.removeStorageSync(USER_KEY);
}

export function setCurrentUser(user: User): void {
  Taro.setStorageSync(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): User | null {
  const raw = Taro.getStorageSync(USER_KEY);
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}