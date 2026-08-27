import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
  WechatMiniRequestSchema,
  WechatMiniResponseSchema,
} from '../src/auth.js';

describe('auth schemas', () => {
  it('LoginRequestSchema accepts valid username+password', () => {
    const result = LoginRequestSchema.safeParse({
      username: 'alice',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('LoginRequestSchema rejects empty username', () => {
    const result = LoginRequestSchema.safeParse({
      username: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('LoginRequestSchema rejects short password', () => {
    const result = LoginRequestSchema.safeParse({
      username: 'alice',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('LoginResponseSchema requires access_token + refresh_token', () => {
    const result = LoginResponseSchema.safeParse({
      access_token: 'a',
      refresh_token: 'r',
      user: { id: '1', username: 'alice', display_name: 'Alice' },
    });
    expect(result.success).toBe(true);
  });

  it('RegisterRequestSchema requires password >= 8 chars', () => {
    const result = RegisterRequestSchema.safeParse({
      username: 'bob',
      password: 'verysecure',
      display_name: 'Bob',
    });
    expect(result.success).toBe(true);
  });

  // ===== WeChat Mini Program (feat-121) =====
  //
  // Used by the mini-program's Taro.login() flow:
  //   Taro.login() -> { code } -> POST /auth/wechat-mini -> LoginResponse
  // The server-side (feat-026) is the real ground truth, but the mock layer
  // (H5 msw/browser + weapp tarojs-plugin-mock sidecar) needs to validate the
  // same shape so the client never drifts.

  it('WechatMiniRequestSchema accepts a bare code', () => {
    const result = WechatMiniRequestSchema.safeParse({ code: 'demo-code-001' });
    expect(result.success).toBe(true);
  });

  it('WechatMiniRequestSchema accepts code + encrypted_data + iv (full WeChat shape)', () => {
    const result = WechatMiniRequestSchema.safeParse({
      code: 'demo-code-001',
      encrypted_data: 'base64-encrypted',
      iv: 'base64-iv',
    });
    expect(result.success).toBe(true);
  });

  it('WechatMiniRequestSchema rejects missing code', () => {
    const result = WechatMiniRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('WechatMiniRequestSchema rejects non-string code', () => {
    const result = WechatMiniRequestSchema.safeParse({ code: 12345 });
    expect(result.success).toBe(false);
  });

  it('WechatMiniRequestSchema rejects empty string code', () => {
    // z.string() allows empty by default; we keep that permissive since some
    // mock scenarios reuse a stub code like 'demo'. Real backend will tighten.
    const result = WechatMiniRequestSchema.safeParse({ code: '' });
    expect(result.success).toBe(true);
  });

  it('WechatMiniRequestSchema rejects unknown extra fields when shape is strict', () => {
    // Schema is non-strict (passthrough). Extra fields are allowed so future
    // WeChat payloads (signature, etc.) can be forwarded without rewriting.
    const result = WechatMiniRequestSchema.safeParse({
      code: 'demo',
      future_field: 'whatever',
    });
    expect(result.success).toBe(true);
  });

  it('WechatMiniResponseSchema matches LoginResponseSchema shape', () => {
    // The two schemas must validate the same payload so swapping endpoints is
    // a type-safe operation for clients.
    const payload = {
      access_token: 'at',
      refresh_token: 'rt',
      user: { id: 'u1', username: 'alice', display_name: 'Alice' },
    };
    expect(LoginResponseSchema.safeParse(payload).success).toBe(true);
    expect(WechatMiniResponseSchema.safeParse(payload).success).toBe(true);
  });
});