import { z } from 'zod';

// ===== Content blocks =====

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ImageUrlContentSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string().url(),
    detail: z.enum(['low', 'high', 'auto']).optional(),
  }),
});
export type ImageUrlContent = z.infer<typeof ImageUrlContentSchema>;

export const VideoUrlContentSchema = z.object({
  type: z.literal('video_url'),
  video_url: z.object({
    url: z.string().url(),
  }),
});
export type VideoUrlContent = z.infer<typeof VideoUrlContentSchema>;

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageUrlContentSchema,
  VideoUrlContentSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ===== Messages =====

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.array(ContentBlockSchema),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ===== Stream request =====

export const ChatStreamRequestSchema = z.object({
  conversation_id: z.string(),
  message: ChatMessageSchema,
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;