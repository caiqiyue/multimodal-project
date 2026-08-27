import * as SecureStore from 'expo-secure-store';
import type { User } from '@multimodal/api-contract/auth';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';
const USER_KEY = 'auth.user';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined),
  ]);
}

export async function setCurrentUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getCurrentUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
