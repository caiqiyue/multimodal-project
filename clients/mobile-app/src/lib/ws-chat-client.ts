/**
 * ChatClient — thin wrapper around the browser WebSocket for /api/v1/ws/chat.
 *
 * Responsibilities:
 * - Manage one persistent connection per ChatClient instance.
 * - Route each ChatEvent JSON frame to a typed callback (`onMessageDelta` etc.).
 * - Surface connection lifecycle via `onConnectionOpen` / `onConnectionClose`.
 * - Throw on `send()` if the socket isn't open — caller should disable send
 *   buttons while disconnected.
 *
 * Reference: docs/项目总执行计划.md §24, feature_list.json feat-021 + feat-130.
 */
import type {
  ChatEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  MessageStartEvent,
  StreamErrorEvent,
  ToolCallEvent,
  ToolResultEvent,
} from '@multimodal/chat-protocol/events';

export type ChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

/** WebSocket constructor signature — typed as a structural interface so tests can inject a mock. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const defaultWebSocketFactory: WebSocketFactory = (url) =>
  new WebSocket(url) as unknown as WebSocketLike;

export class ChatClient {
  private socket: WebSocketLike | null = null;
  private readonly callbacks: ChatClientCallbacks;
  private readonly factory: WebSocketFactory;
  private readonly url: string;

  constructor(
    url: string,
    callbacks: ChatClientCallbacks = {},
    factory: WebSocketFactory = defaultWebSocketFactory,
  ) {
    this.url = url;
    this.callbacks = callbacks;
    this.factory = factory;
  }

  /** Open the underlying WebSocket. Idempotent — calling twice is a no-op while open. */
  connect(): void {
    if (this.socket) {
      return;
    }
    const socket = this.factory(this.url);
    socket.onopen = () => this.callbacks.onConnectionOpen?.();
    socket.onmessage = (ev) => this.handleMessage(ev.data);
    socket.onclose = (ev) => {
      this.socket = null;
      this.callbacks.onConnectionClose?.(ev.code, ev.reason);
    };
    socket.onerror = () => {
      // Browser/Node will surface via onclose right after; we don't double-fire.
    };
    this.socket = socket;
  }

  /** Send one turn to the backend. Throws if the socket isn't open. */
  send(input: { messages: ChatMessageInput[] }): void {
    if (!this.socket || this.socket.readyState !== 1 /* OPEN */) {
      throw new Error('WebSocket is not open');
    }
    this.socket.send(JSON.stringify({ messages: input.messages }));
  }

  /** Close the underlying WebSocket. Safe to call when already closed. */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /** True iff the socket is currently open and ready to send. */
  isOpen(): boolean {
    return this.socket?.readyState === 1;
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
 * Resolve the chat WebSocket URL from EXPO_PUBLIC_API_BASE_URL.
 * Swaps http(s) → ws(s); appends /ws/chat. V1 public (no auth header on WS).
 */
export function resolveChatWsUrl(apiBaseUrl: string): string {
  const wsBase = apiBaseUrl.replace(/^http/, 'ws');
  return `${wsBase}/ws/chat`;
}
