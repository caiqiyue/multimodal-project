import Taro from '@tarojs/taro';
import type { LoginResponse, User } from '@multimodal/api-contract';
import {
  clearTokens,
  setCurrentUser,
  setTokens,
} from './tokenStorage';

// Mirror of api.ts — same env var, same fallback behavior (mock-first).
const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? '';

/**
 * WeChat Mini Program login (feat-121, mock-first).
 *
 * Real flow (lands with feat-026 + feat-037):
 *   client Taro.login() -> wx code -> POST /auth/wechat-mini
 *     -> server validates code via WeChat API -> creates/looks up user
 *     -> returns access_token + refresh_token
 *
 * Mock flow (this implementation):
 *   Taro.login() -> any code (or H5 fail) -> POST /auth/wechat-mini
 *     -> mockWechatMini() resolves to alice (user_001) tokens.
 *
 * On H5 the real `Taro.login()` call rejects because the browser has no wx
 * runtime. The LoginScreen catches that and surfaces a "retry" affordance;
 * the user can still hit /auth/wechat-mini manually with a stub code to land
 * somewhere. On weapp the call goes to the real wx.login which is intercepted
 * by the @tarojs/plugin-mock sidecar (post feat-037 a real WeChat AppID will
 * be used here).
 */
export async function wechatLoginAndAuth(): Promise<User> {
  const loginResult = await Taro.login();
  const code = loginResult.code;
  const response = await fetch(`${API_BASE_URL}/auth/wechat-mini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 400 && body.error === 'invalid_code') {
      throw new Error('WeChat login failed: invalid code');
    }
    throw new Error(body.error ?? `WeChat login failed (${response.status})`);
  }
  const data: LoginResponse = await response.json();
  setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });
  setCurrentUser(data.user);
  return data.user;
}

/**
 * Forget the current session locally. Does not revoke the refresh token
 * server-side — that lands with feat-026's POST /auth/logout.
 */
export function logout(): void {
  clearTokens();
}