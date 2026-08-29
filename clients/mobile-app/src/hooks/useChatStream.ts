/**
 * useChatStream — React hook wrapping ChatClient + local message state.
 *
 * Owns:
 *  - One persistent ChatClient (held in a ref so it survives re-renders).
 *  - The list of messages rendered in the chat window.
 *  - Connection status (`connecting` / `open` / `closed`).
 *
 * State machine for an assistant turn:
 *   user-send → message.start (push empty assistant bubble) →
 *   message.delta* (append to bubble content) →
 *   message.done (mark bubble done) | error (push error bubble, mark done)
 *
 * Tool calls are interleaved with deltas: a `tool.call` event opens a new
 * ToolCallItem attached to the current assistant bubble; the matching
 * `tool.result` (same tool_call_id) populates its `result` field.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  MessageDeltaEvent,
  MessageDoneEvent,
  MessageStartEvent,
  StreamErrorEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@multimodal/chat-protocol/events';

import {
  ChatClient,
  type ChatMessageInput,
  type WebSocketFactory,
} from '../lib/ws-chat-client';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export type ToolCallItem = {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result: string | null;
};

export type MessageItem =
  | { id: string; kind: 'user'; content: string }
  | {
      id: string;
      kind: 'assistant';
      content: string;
      streaming: boolean;
      toolCalls: ToolCallItem[];
    }
  | { id: string; kind: 'error'; code: string; message: string };

export interface UseChatStreamOptions {
  /** Fully resolved WebSocket URL (e.g. resolveChatWsUrl(EXPO_PUBLIC_API_BASE_URL)). */
  url: string;
  /** Override for testing — defaults to the global WebSocket constructor. */
  webSocketFactory?: WebSocketFactory;
  /** Optional initial messages (e.g. loaded from a persisted conversation later). */
  initialMessages?: MessageItem[];
}

export interface UseChatStreamResult {
  messages: MessageItem[];
  connectionState: ConnectionState;
  /** Push the user's turn and stream the assistant's reply. */
  send: (input: ChatMessageInput[]) => void;
  /** True iff a request is in flight (the most-recent assistant bubble is streaming). */
  isStreaming: boolean;
  /** Disconnect and clear local state. */
  reset: () => void;
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function useChatStream(options: UseChatStreamOptions): UseChatStreamResult {
  const { url, webSocketFactory, initialMessages } = options;

  const [messages, setMessages] = useState<MessageItem[]>(initialMessages ?? []);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isStreaming, setIsStreaming] = useState(false);

  const clientRef = useRef<ChatClient | null>(null);

  // Refs that mirror the latest state for use inside long-lived WS callbacks.
  // Without these, every render would close over a stale snapshot and we'd
  // append deltas to a stale `messages` array.
  const messagesRef = useRef<MessageItem[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const appendAssistant = useCallback((serverMessageId: string): string => {
    // Use the server's message_id as the local id so message.delta / message.done
    // / tool.call / tool.result events (which all carry the same server-side id)
    // can find their bubble. Local counters would never match the server UUIDs.
    const id = serverMessageId;
    setMessages((prev) => [
      ...prev,
      { id, kind: 'assistant', content: '', streaming: true, toolCalls: [] },
    ]);
    return id;
  }, []);

  const handleStart = useCallback(
    (event: MessageStartEvent) => {
      // Server has begun streaming a turn — open a fresh assistant bubble
      // keyed by the server-issued message_id (used by deltas / done / tool events).
      appendAssistant(event.message_id);
      setIsStreaming(true);
    },
    [appendAssistant],
  );

  const handleDelta = useCallback((event: MessageDeltaEvent) => {
    const assistantId = event.message_id;
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'assistant' && m.id === assistantId
          ? { ...m, content: m.content + event.delta }
          : m,
      ),
    );
  }, []);

  const handleDone = useCallback((event: MessageDoneEvent) => {
    const assistantId = event.message_id;
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'assistant' && m.id === assistantId
          ? { ...m, content: event.full_content, streaming: false }
          : m,
      ),
    );
    setIsStreaming(false);
  }, []);

  const handleToolCall = useCallback((event: ToolCallEvent) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== 'assistant' || m.streaming === false) return m;
        // Attach to the most-recent streaming assistant bubble.
        return {
          ...m,
          toolCalls: [
            ...m.toolCalls,
            {
              toolCallId: event.tool_call_id,
              name: event.name,
              args: event.args,
              result: null,
            },
          ],
        };
      }),
    );
  }, []);

  const handleToolResult = useCallback((event: ToolResultEvent) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== 'assistant') return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolCallId === event.tool_call_id
              ? { ...tc, result: event.content }
              : tc,
          ),
        };
      }),
    );
  }, []);

  const handleError = useCallback((event: StreamErrorEvent) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId('err'), kind: 'error', code: event.code, message: event.message },
    ]);
    setIsStreaming(false);
  }, []);

  const handleOpen = useCallback(() => {
    setConnectionState('open');
  }, []);

  const handleClose = useCallback(() => {
    setConnectionState('closed');
    setIsStreaming(false);
  }, []);

  // Construct + tear down the ChatClient once per URL change.
  useEffect(() => {
    const client = new ChatClient(
      url,
      {
        onConnectionOpen: handleOpen,
        onConnectionClose: handleClose,
        onMessageStart: handleStart,
        onMessageDelta: handleDelta,
        onMessageDone: handleDone,
        onToolCall: handleToolCall,
        onToolResult: handleToolResult,
        onError: handleError,
      },
      webSocketFactory,
    );
    clientRef.current = client;
    setConnectionState('connecting');
    client.connect();
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
    // The handlers are stable enough that we only want to re-init on URL change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const send = useCallback((input: ChatMessageInput[]) => {
    // 1. Echo the user turn locally so it shows up immediately.
    const userId = nextId('user');
    setMessages((prev) => [
      ...prev,
      { id: userId, kind: 'user', content: input[0]?.content ?? '' },
    ]);
    // 2. Hand off to the server.
    clientRef.current?.send({ messages: input });
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, connectionState, send, isStreaming, reset };
}
