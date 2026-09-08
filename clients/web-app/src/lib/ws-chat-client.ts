/**
 * ChatClient — browser WebSocket wrapper for /api/web/ws/chat?token=<jwt>.
 *
 * Mirrors the mobile-app ChatClient contract (uses native WebSocket which
 * both runtimes support). The Vue port keeps the WebSocketLike factory
 * seam so tests can inject mocks without touching the network.
 *
 * The Spring Boot BFF mounts the WS at `/api/web/ws/chat` with a token
 * query parameter — see feat-164 (WS relay) for the upstream wiring.
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
import type { ContentBlock } from '@multimodal/api-contract/chat';

export type ChatMessageInput = {
  role: 'user' | 'assistant' | 'system';
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

/** WebSocket structural interface — tests inject mocks that match it. */
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

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

export class ChatClient {
  private socket: WebSocketLike | null = null;
  constructor(
    private readonly url: string,
    private readonly callbacks: ChatClientCallbacks = {},
    private readonly factory: WebSocketFactory = defaultFactory,
  ) {}

  connect(): void {
    if (this.socket) return;
    const s = this.factory(this.url);
    s.onopen = () => this.callbacks.onConnectionOpen?.();
    s.onmessage = (ev) => this.handle(ev.data);
    s.onclose = (ev) => {
      this.socket = null;
      this.callbacks.onConnectionClose?.(ev.code, ev.reason);
    };
    s.onerror = () => undefined;
    this.socket = s;
  }

  send(input: { messages: ChatMessageInput[] }): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error('WebSocket is not open');
    }
    this.socket.send(JSON.stringify(input));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isOpen(): boolean {
    return this.socket?.readyState === 1;
  }

  private handle(raw: string | ArrayBuffer): void {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    let event: ChatEvent;
    try {
      event = JSON.parse(text) as ChatEvent;
    } catch {
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
 * Resolve the chat WebSocket URL from VITE_API_BASE_URL + JWT.
 * Swaps http(s) → ws(s); appends `/api/web/ws/chat?token=<jwt>`.
 */
export function resolveChatWsUrl(apiBaseUrl: string, token: string): string {
  const wsBase = apiBaseUrl.replace(/^http/, 'ws');
  return `${wsBase}/api/web/ws/chat?token=${encodeURIComponent(token)}`;
}