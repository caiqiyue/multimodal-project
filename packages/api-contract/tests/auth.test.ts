import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RegisterRequestSchema,
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
});