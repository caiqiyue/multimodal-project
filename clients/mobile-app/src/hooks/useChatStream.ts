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
 *
 * Multi-modal (feat-033):
 *   User messages can carry an optional `media[]` of LocalMedia — local
 *   preview URIs plus the uploaded server URL. The hook forwards the wire
 *   blocks to the WS and echoes the media alongside the text so the local
 *   bubble can render images / video previews immediately.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContentBlock } from '@multimodal/api-contract/chat';
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
  type WebSocketFactory,
} from '../lib/ws-chat-client';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export type ToolCallItem = {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result: string | null;
};

/** Local media attachment — what the picker just produced. */
export type LocalMedia = {
  /** Stable key for FlatList / list rendering. */
  id: string;
  /** Local file:// URI from the picker, used as the preview source. */
  localUri: string;
  /** Server URL returned by POST /api/v1/media/upload. */
  uploadedUrl: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
};

export type MessageItem =
  | {
      id: string;
      kind: 'user';
      /** Caption text (may be empty when the message is media-only). */
      text?: string;
      /** Optional media attachments shown in the user bubble. */
      media?: LocalMedia[];
    }
  | {
      id: string;
      kind: 'assistant';
      content: string;
      streaming: boolean;
      toolCalls: ToolCallItem[];
    }
  | { id: string; kind: 'error'; code: string; message: string };

/** Wire-level input — what we forward to the WS. */
export type ChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
};

/**
 * Hook-level send input — wire shape plus the local media the bubble should
 * echo alongside the text. Callers always supply media when the message
 * came from the image picker.
 */
export type SendInput = ChatMessageInput & {
  media?: LocalMedia[];
};

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
  send: (input: SendInput[]) => void;
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

/** Extract the user-facing text caption from a ContentBlock[]. */
function textFromBlocks(blocks: ContentBlock[]): string | undefined {
  const texts = blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text);
  if (texts.length === 0) return undefined;
  return texts.join('\n');
}

/** Build the wire ContentBlock[] from a user send. Videos have no V1 block. */
function blocksForUserSend(text: string | undefined, media: LocalMedia[] | undefined): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (text !== undefined && text.trim().length > 0) {
    blocks.push({ type: 'text', text: text.trim() });
  }
  for (const item of media ?? []) {
    if (item.mediaType === 'image') {
      blocks.push({ type: 'image_url', image_url: { url: item.uploadedUrl } });
    }
    // video: dropped from wire (no V1 video_url block — see agent.ts V1 scope)
  }
  // Media-only send (e.g. video only): give the agent something to respond to.
  if (blocks.length === 0 && (media?.length ?? 0) > 0) {
    const hasVideo = (media ?? []).some((m) => m.mediaType === 'video');
    blocks.push({ type: 'text', text: hasVideo ? '我发了一段视频' : '看看这个' });
  }
  return blocks;
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

  const send = useCallback((input: SendInput[]) => {
    const first = input[0];
    if (first === undefined) return;

    // 1. Echo the user turn locally so it shows up immediately. Capture the
    //    text caption + any media attachments for the local bubble; fall back
    //    to the wire content if the caller didn't pass media (text-only path).
    const userId = nextId('user');
    const echoText =
      typeof first.content === 'string' ? first.content : textFromBlocks(first.content);
    setMessages((prev) => [
      ...prev,
      { id: userId, kind: 'user', text: echoText, media: first.media },
    ]);

    // 2. Build the wire payload. Multi-modal users get ContentBlock[]; pure
    //    text users keep the V1 string wire shape (server's _to_langchain
    //    handles both — see session-handoff.md).
    let wireContent: string | ContentBlock[];
    if (first.media !== undefined && first.media.length > 0) {
      wireContent = blocksForUserSend(echoText, first.media);
    } else {
      wireContent = typeof first.content === 'string' ? first.content : (echoText ?? '');
    }

    clientRef.current?.send({ messages: [{ role: first.role, content: wireContent }] });
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, connectionState, send, isStreaming, reset };
}
