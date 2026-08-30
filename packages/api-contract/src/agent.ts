import { z } from 'zod';

// ===== Content blocks (discriminated union on `type`) =====
//
// Mirrors backend/app/schemas/agent.py TextContentBlock / ImageUrlContentBlock
// and the wire payload accepted by /api/v1/agent/invoke. Video blocks are
// intentionally NOT included in V1 (Qwen3-VL supports video via vLLM but the
// standard OpenAI-compat surface does not yet expose video_url).

export const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(32_000),
});
export type TextContentBlock = z.infer<typeof TextContentBlockSchema>;

export const ImageUrlPayloadSchema = z.object({
  url: z.string().min(1),
  detail: z.enum(['low', 'high', 'auto']).optional(),
});
export type ImageUrlPayload = z.infer<typeof ImageUrlPayloadSchema>;

export const ImageUrlContentBlockSchema = z.object({
  type: z.literal('image_url'),
  image_url: ImageUrlPayloadSchema,
});
export type ImageUrlContentBlock = z.infer<typeof ImageUrlContentBlockSchema>;

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentBlockSchema,
  ImageUrlContentBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ===== Messages =====
//
// `content` accepts a plain string (V1 path, backward-compat) OR a list of
// ContentBlocks (V2 path, multi-modal). Matches backend's Pydantic
// `Union[str, list[ContentBlock]]` in ChatMessage.content.

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const AgentChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([z.string().min(1).max(32_000), z.array(ContentBlockSchema).min(1).max(16)]),
});
export type AgentChatMessage = z.infer<typeof AgentChatMessageSchema>;

export const AgentInvokeRequestSchema = z.object({
  messages: z.array(AgentChatMessageSchema).min(1).max(64),
});
export type AgentInvokeRequest = z.infer<typeof AgentInvokeRequestSchema>;

export const AgentInvokeResponseSchema = z.object({
  messages: z.array(AgentChatMessageSchema),
  reply: z.string().min(1),
});
export type AgentInvokeResponse = z.infer<typeof AgentInvokeResponseSchema>;
