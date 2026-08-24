import { z } from 'zod';

// ===== Login =====

export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(8, 'Password must be >= 8 chars'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().url().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ===== Register =====

export const RegisterRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  display_name: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = LoginResponseSchema;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// ===== Refresh =====

export const RefreshRequestSchema = z.object({
  refresh_token: z.string(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// ===== WeChat Mini =====

export const WechatMiniRequestSchema = z.object({
  code: z.string(),
  encrypted_data: z.string().optional(),
  iv: z.string().optional(),
});
export type WechatMiniRequest = z.infer<typeof WechatMiniRequestSchema>;

export const WechatMiniResponseSchema = LoginResponseSchema;
export type WechatMiniResponse = z.infer<typeof WechatMiniResponseSchema>;