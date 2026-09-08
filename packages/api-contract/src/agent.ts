import { z } from 'zod';

// ===== Content blocks (discriminated union on `type`) =====
//
// Mirrors backend/app/schemas/agent.py TextContentBlock / ImageUrlContentBlock / VideoUrlContentBlock
// and the wire payload accepted by /api/v1/agent/invoke. Session 035 added
// video_url — Qwen3-VL supports video via vLLM when launched with
// --limit-mm-per-prompt {"image": 2, "video": 1}.

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

export const VideoUrlPayloadSchema = z.object({
  url: z.string().min(1),
});
export type VideoUrlPayload = z.infer<typeof VideoUrlPayloadSchema>;

export const VideoUrlContentBlockSchema = z.object({
  type: z.literal('video_url'),
  video_url: VideoUrlPayloadSchema,
});
export type VideoUrlContentBlock = z.infer<typeof VideoUrlContentBlockSchema>;

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentBlockSchema,
  ImageUrlContentBlockSchema,
  VideoUrlContentBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ===== Messages =====
//
// `content` accepts a plain string (V1 path, backward-compat) OR a list of
// ContentBlocks (V2 path; multi-modal — text + image_url + video_url).
// Matches backend's Pydantic `Union[str, list[ContentBlock]]` in ChatMessage.content.

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
