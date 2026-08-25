/**
 * Common envelope for all chat streaming events.
 */
export interface ChatEventBase {
  id: string;
  conversation_id: string;
  created_at: number;
}
