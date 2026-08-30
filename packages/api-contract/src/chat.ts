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

// WS-flavoured ChatMessage: in V1 the WS stream only accepts plain text;
// V2 (feat-033+ mini-program coordination) will widen content to the same
// union the HTTP endpoint exposes. Keeping the schema here narrower than
// AgentChatMessageSchema avoids forcing a wire-contract bump on existing WS
// clients until the V2 plan lands.
export const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.array(ContentBlockSchema).min(1),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatStreamRequestSchema = z.object({
  conversation_id: z.string(),
  message: ChatMessageSchema,
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
