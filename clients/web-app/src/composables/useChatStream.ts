/**
 * useChatStream — Vue composable mirroring mobile-app's React hook.
 *
 * Owns:
 *  - One persistent ChatClient (held in a local ref so it survives re-renders).
 *  - The list of messages rendered in the chat window.
 *  - Connection status (`connecting` / `open` / `closed`).
 *
 * ⚠️ MUST-PRESERVE (Session 020 fix): assistant bubble IDs come from the
 * server's `message_id` (UUID), NOT local counters. Without this,
 * message.delta never attaches to its bubble and the assistant message
 * stays empty. Local counters are ONLY used for user/error bubbles.
 *
 * State machine for an assistant turn:
 *   user-send → message.start (push empty assistant bubble) →
 *   message.delta* (append to bubble content) →
 *   message.done (mark bubble done) | error (push error bubble, mark done)
 *
 * Tool calls: `tool.call` opens a ToolCallItem on the most-recent streaming
 * assistant bubble; the matching `tool.result` (same tool_call_id) populates
 * the result field.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import type { ContentBlock } from '@multimodal/api-contract/chat';
import type {
  MessageStartEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  StreamErrorEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@multimodal/chat-protocol/events';
import { ChatClient, type WebSocketFactory } from '@/lib/ws-chat-client';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export type ToolCallItem = {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result: string | null;
};

/** Local media attachment — what the picker just produced. */
export type LocalMedia = {
  id: string;
  localUri: string;
  uploadedUrl: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
};

export type MessageItem =
  | { id: string; kind: 'user'; text?: string; media?: LocalMedia[] }
  | { id: string; kind: 'assistant'; content: string; streaming: boolean; toolCalls: ToolCallItem[] }
  | { id: string; kind: 'error'; code: string; message: string };

/** Wire-level input — what we forward to the WS. */
export type ChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
};

export type SendInput = ChatMessageInput & { media?: LocalMedia[] };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
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
  }
  if (blocks.length === 0 && (media?.length ?? 0) > 0) {
    const hasVideo = (media ?? []).some((m) => m.mediaType === 'video');
    blocks.push({ type: 'text', text: hasVideo ? '我发了一段视频' : '看看这个' });
  }
  return blocks;
}

export function useChatStream(opts: { url: string; factory?: WebSocketFactory }) {
  const messages = ref<MessageItem[]>([]);
  const connectionState = ref<ConnectionState>('connecting');
  const isStreaming = ref(false);

  let client: ChatClient | null = null;

  function appendAssistant(serverMessageId: string): void {
    // Session 020 fix: server UUID becomes the local id so message.delta
    // / message.done / tool.call / tool.result events find their bubble.
    messages.value.push({
      id: serverMessageId,
      kind: 'assistant',
      content: '',
      streaming: true,
      toolCalls: [],
    });
  }

  function handleStart(ev: MessageStartEvent): void {
    appendAssistant(ev.message_id);
    isStreaming.value = true;
  }

  function findAssistant(id: string):
  | Extract<MessageItem, { kind: 'assistant' }>
  | undefined {
  return messages.value.find(
    (m): m is Extract<MessageItem, { kind: 'assistant' }> =>
      m.kind === 'assistant' && m.id === id,
  );
  }

  function handleDelta(ev: MessageDeltaEvent): void {
    const msg = findAssistant(ev.message_id);
    if (msg) {
      msg.content += ev.delta;
    }
  }

  function handleDone(ev: MessageDoneEvent): void {
    const msg = findAssistant(ev.message_id);
    if (msg) {
      msg.content = ev.full_content;
      msg.streaming = false;
    }
    isStreaming.value = false;
  }

  function handleToolCall(ev: ToolCallEvent): void {
    // Attach to the most-recent streaming assistant bubble.
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m && m.kind === 'assistant' && m.streaming) {
        m.toolCalls.push({
          toolCallId: ev.tool_call_id,
          name: ev.name,
          args: ev.args,
          result: null,
        });
        return;
      }
    }
  }

  function handleToolResult(ev: ToolResultEvent): void {
    for (const m of messages.value) {
      if (m.kind !== 'assistant') continue;
      const tc = m.toolCalls.find((t) => t.toolCallId === ev.tool_call_id);
      if (tc) {
        tc.result = ev.content;
        return;
      }
    }
  }

  function handleError(ev: StreamErrorEvent): void {
    messages.value.push({ id: nextId('err'), kind: 'error', code: ev.code, message: ev.message });
    isStreaming.value = false;
  }

  onMounted(() => {
    client = new ChatClient(
      opts.url,
      {
        onConnectionOpen: () => {
          connectionState.value = 'open';
        },
        onConnectionClose: () => {
          connectionState.value = 'closed';
          isStreaming.value = false;
        },
        onMessageStart: handleStart,
        onMessageDelta: handleDelta,
        onMessageDone: handleDone,
        onToolCall: handleToolCall,
        onToolResult: handleToolResult,
        onError: handleError,
      },
      opts.factory,
    );
    connectionState.value = 'connecting';
    client.connect();
  });

  onUnmounted(() => {
    client?.disconnect();
    client = null;
  });

  function send(inputs: SendInput[]): void {
    const first = inputs[0];
    if (!first) return;

    // 1. Echo the user turn locally so it shows up immediately.
    const echoText = typeof first.content === 'string' ? first.content : undefined;
    messages.value.push({
      id: nextId('user'),
      kind: 'user',
      text: echoText,
      media: first.media,
    });

    // 2. Build the wire payload. Multi-modal users get ContentBlock[]; pure
    //    text users keep the V1 string wire shape.
    let wire: string | ContentBlock[];
    if (first.media && first.media.length > 0) {
      wire = blocksForUserSend(echoText, first.media);
    } else {
      wire = typeof first.content === 'string' ? first.content : (echoText ?? '');
    }

    client?.send({ messages: [{ role: first.role, content: wire }] });
  }

  function reset(): void {
    messages.value = [];
    isStreaming.value = false;
  }

  return { messages, connectionState, isStreaming, send, reset };
}