/**
 * ChatClient — thin wrapper around Taro.connectSocket for /api/v1/ws/chat.
 *
 * Mirrors mobile-app's ws-chat-client.ts but talks to Taro's cross-platform
 * SocketTask API instead of the browser WebSocket. Each ChatClient instance
 * holds one persistent connection; reconnects are not built in (caller can
 * construct a new client on URL change).
 *
 * Responsibilities:
 *  - Open the underlying socket via Taro.connectSocket.
 *  - Track open/closed state locally so `send()` can throw on stale calls.
 *  - Route each parsed JSON frame to a typed callback
 *    (`onMessageDelta`, `onToolCall`, …) by event type.
 *  - Surface connection lifecycle via `onConnectionOpen` / `onConnectionClose`.
 *
 * Wire format: `ChatMessageInput.content` is a plain string (V1 path,
 * text-only) OR a ContentBlock[] (V2 path, multi-modal). The authoritative
 * schema is `ChatMessageSchema.content` in `@multimodal/api-contract`
 * (Zod union landed in feat-026: `z.union([z.string().min(1).max(32_000),
 * z.array(ContentBlockSchema).min(1).max(16)])`). The backend WS endpoint
 * does not validate the shape — it forwards whatever JSON the client sends
 * straight to the agent, where `_to_langchain` dispatches on shape.
 *
 * Reference: docs/项目总执行计划.md §24, feature_list.json feat-021 + feat-131.
 */
import Taro from '@tarojs/taro';
import type {
  ChatEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  MessageStartEvent,
  StreamErrorEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@multimodal/chat-protocol';
import type { ContentBlock } from '@multimodal/api-contract';

export type ChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
  /** V1 backward compat: plain string. V2: ContentBlock[] for multi-modal. */
  content: string | ContentBlock[];
};

export interface ChatClientCallbacks {
  onMessageStart?: (event: MessageStartEvent) => void;
  onMessageDelta?: (event: MessageDeltaEvent) => void;
  onMessageDone?: (event: MessageDoneEvent) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onError?: (event: StreamErrorEvent) => void;
  onConnectionOpen?: () => void;
  onConnectionClose?: (code: number, reason: string) => void;
}

/**
 * Structural interface for whatever Taro.connectSocket returns.
 * Taro's SocketTask exposes method-based handlers (onOpen/onMessage/onClose)
 * with wrapped event payloads, so the shape differs slightly from the browser
 * WebSocket API. Mock factories in tests can satisfy this contract.
 */
export interface SocketTaskLike {
  send(opts: { data: string }): void;
  close(opts?: { code?: number; reason?: string }): void;
  onOpen(callback: (ev: Event) => void): void;
  onMessage(callback: (ev: { data: string | ArrayBuffer }) => void): void;
  onClose(callback: (ev: { code: number; reason: string }) => void): void;
  onError(callback: (ev: Event) => void): void;
}

export type SocketTaskFactory = (url: string) => SocketTaskLike | Promise<SocketTaskLike>;

/**
 * Taro 4's connectSocket returns Promise<SocketTask> on H5 (the JS Promise
 * wraps the underlying browser WebSocket creation), but returns the
 * SocketTask directly on the weapp target where wx.connectSocket is sync.
 * The factory type allows either shape; ChatClient.connect() awaits the
 * result before wiring event handlers.
 */
const defaultSocketTaskFactory: SocketTaskFactory = async (url) => {
  const task = (await Taro.connectSocket({ url })) as unknown as SocketTaskLike;
  return task;
};

export class ChatClient {
  private task: SocketTaskLike | null = null;
  private readonly callbacks: ChatClientCallbacks;
  private readonly factory: SocketTaskFactory;
  private readonly url: string;
  private open = false;

  constructor(
    url: string,
    callbacks: ChatClientCallbacks = {},
    factory: SocketTaskFactory = defaultSocketTaskFactory,
  ) {
    this.url = url;
    this.callbacks = callbacks;
    this.factory = factory;
  }

  /** Open the underlying socket. Idempotent — calling twice is a no-op. */
  async connect(): Promise<void> {
    if (this.task) {
      return;
    }
    const task = await this.factory(this.url);
    task.onOpen(() => {
      this.open = true;
      this.callbacks.onConnectionOpen?.();
    });
    task.onMessage((ev) => {
      this.handleMessage(ev.data);
    });
    task.onClose((ev) => {
      this.open = false;
      this.task = null;
      this.callbacks.onConnectionClose?.(ev.code, ev.reason);
    });
    task.onError(() => {
      // Taro surfaces the close via onClose right after; no need to double-fire.
    });
    this.task = task;
  }

  /** Send one turn to the backend. Throws if the socket isn't open. */
  send(input: { messages: ChatMessageInput[] }): void {
    if (!this.task || !this.open) {
      throw new Error('WebSocket is not open');
    }
    this.task.send({ data: JSON.stringify({ messages: input.messages }) });
  }

  /** Close the underlying socket. Safe to call when already closed. */
  disconnect(): void {
    if (this.task) {
      this.task.close();
      this.task = null;
      this.open = false;
    }
  }

  /** True iff the socket is currently open and ready to send. */
  isOpen(): boolean {
    return this.open;
  }

  private handleMessage(raw: string | ArrayBuffer): void {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    let event: ChatEvent;
    try {
      event = JSON.parse(text) as ChatEvent;
    } catch {
      // Backend contract guarantees JSON frames; silently ignore malformed input.
      return;
    }
    switch (event.type) {
      case 'message.start':
        this.callbacks.onMessageStart?.(event);
        break;
      case 'message.delta':
        this.callbacks.onMessageDelta?.(event);
        break;
      case 'message.done':
        this.callbacks.onMessageDone?.(event);
        break;
      case 'tool.call':
        this.callbacks.onToolCall?.(event);
        break;
      case 'tool.result':
        this.callbacks.onToolResult?.(event);
        break;
      case 'error':
        this.callbacks.onError?.(event);
        break;
    }
  }
}

/**
 * Resolve the chat WebSocket URL from TARO_APP_API_BASE_URL.
 * Swaps http(s) → ws(s); appends /ws/chat. V1 public (no auth header on WS).
 * If the env var is empty, the resulting URL is relative (`/ws/chat`) — the
 * client simply won't connect; UI shows the connection-status banner.
 */
export function resolveChatWsUrl(apiBaseUrl: string): string {
  if (apiBaseUrl.length === 0) {
    return '/ws/chat';
  }
  const wsBase = apiBaseUrl.replace(/^http/, 'ws');
  return `${wsBase}/ws/chat`;
}