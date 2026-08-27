import { describe, it, expect } from 'vitest';
import { mockLogin } from '../src/auth.js';

describe('mockLogin', () => {
  it('returns LoginResponse for valid credentials (alice)', () => {
    const result = mockLogin('alice', 'alice1234');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.access_token).toMatch(/^mock-access-user_001-/);
    expect(result.response.refresh_token).toMatch(/^mock-refresh-user_001-/);
    expect(result.response.user.id).toBe('user_001');
    expect(result.response.user.username).toBe('alice');
    expect(result.response.user.display_name).toBe('Alice Wang');
    expect(result.response.user.avatar_url).toBeDefined();
  });

  it('returns LoginResponse for valid credentials (demo, no avatar)', () => {
    const result = mockLogin('demo', 'demo1234');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.user.id).toBe('user_003');
    expect(result.response.user.avatar_url).toBeUndefined();
  });

  it('rejects wrong password with invalid_credentials', () => {
    const result = mockLogin('alice', 'wrongpassword');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_credentials');
  });

  it('rejects unknown user with invalid_credentials', () => {
    const result = mockLogin('nobody', 'whatever1234');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_credentials');
  });

  it('rejects short password with invalid_request', () => {
    const result = mockLogin('alice', 'short');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_request');
  });

  it('rejects non-string inputs with invalid_request', () => {
    expect(mockLogin(undefined, 'password1234').ok).toBe(false);
    expect(mockLogin('alice', null).ok).toBe(false);
    expect(mockLogin('alice', 12345).ok).toBe(false);
    expect(mockLogin(123, 'password1234').ok).toBe(false);
    expect(mockLogin('', 'password1234').ok).toBe(false);
  });

  it('issues unique token per call (timestamps differ)', async () => {
    const a = mockLogin('bob', 'bob12345');
    // tiny gap to guarantee different Date.now()
    await new Promise((r) => setTimeout(r, 5));
    const b = mockLogin('bob', 'bob12345');
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.response.access_token).not.toBe(b.response.access_token);
  });
});
