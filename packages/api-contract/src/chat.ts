import { z } from 'zod';

import { ContentBlockSchema, MessageRoleSchema } from './agent.ts';

// Re-export for back-compat with clients that imported these from chat.ts.
// (Original V1 placed them in chat.ts; V2 (feat-022) canonicalised them in
// agent.ts so HTTP /agent/invoke and WS /ws/chat can share the discriminated
// union. chat.ts still keeps its narrower ChatMessageSchema below because
// the WS stream is text-only until V2 widens the WS payload — see the
// vertical slice plan in NEXT_SESSION.md.)
export {
  TextContentBlockSchema,
  ImageUrlPayloadSchema,
  ImageUrlContentBlockSchema,
  ContentBlockSchema,
  MessageRoleSchema,
} from './agent.ts';
export type {
  TextContentBlock,
  ImageUrlPayload,
  ImageUrlContentBlock,
  ContentBlock,
  MessageRole,
} from './agent.ts';

// WS-flavoured ChatMessage: V2 widening landed with feat-033 + feat-141
// (mobile-app + mini-program pickers send ContentBlock[] over WS). The schema
// here now mirrors AgentChatMessageSchema's union — text-only string (V1
// backward-compat path) OR ContentBlock[] (V2 multi-modal path). The backend
// WS endpoint (`backend/app/api/ws_chat.py`) does not validate the schema;
// it forwards whatever JSON the client sends straight to the agent, where
// `_to_langchain` dispatches on shape (str → HumanMessage(str),
// list → HumanMessage([...])).
//
// Bounds match AgentChatMessageSchema exactly so HTTP and WS stay in lockstep:
//   - string: 1..32_000 chars (matches AgentChatMessageSchema; caps malicious payloads)
//   - array: 1..16 blocks (Qwen3-VL practical limit; V1 agent.ts scope)
export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.union([
    z.string().min(1).max(32_000),
    z.array(ContentBlockSchema).min(1).max(16),
  ]),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatStreamRequestSchema = z.object({
  conversation_id: z.string(),
  message: ChatMessageSchema,
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
