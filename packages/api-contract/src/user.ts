import { z } from 'zod';
import { UserSchema } from './auth.ts';

export { UserSchema };
export type { User } from './auth.ts';

export const UpdateUserRequestSchema = UserSchema.pick({
  display_name: true,
  avatar_url: true,
}).partial();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
