import { z } from 'zod';

export const ConversationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  message_count: z.number().int().nonnegative().default(0),
  last_message_preview: z.string().optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationRequestSchema = z.object({
  title: z.string().optional(),
  first_message: z.string().optional(),
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  total: z.number().int().nonnegative(),
});
export type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;
