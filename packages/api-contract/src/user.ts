import { z } from 'zod';
import { UserSchema } from './auth.js';

export { UserSchema };
export type { User } from './auth.js';

export const UpdateUserRequestSchema = UserSchema.pick({
  display_name: true,
  avatar_url: true,
}).partial();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
