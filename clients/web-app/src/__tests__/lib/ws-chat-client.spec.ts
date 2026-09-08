import { describe, it, expect, vi } from 'vitest';
import { ChatClient, type WebSocketLike } from '@/lib/ws-chat-client';

function makeMockSocket(): WebSocketLike & { sentMessages: string[] } {
  const sent: string[] = [];
  const s: Record<string, unknown> = {
    readyState: 1,
    send: (data: string) => {
      sent.push(data);
    },
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  (s as { sentMessages: string[] }).sentMessages = sent;
  return s as unknown as WebSocketLike & { sentMessages: string[] };
}

describe('ChatClient', () => {
  it('dispatches message.start to onMessageStart', () => {
    const mock = makeMockSocket();
    const cbs = { onMessageStart: vi.fn() };
    const c = new ChatClient('ws://x', cbs, () => mock);
    c.connect();
    mock.onopen?.(new Event('open'));
    mock.onmessage?.({
      data: JSON.stringify({ type: 'message.start', message_id: 'm-1' }),
    });
    expect(cbs.onMessageStart).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.start', message_id: 'm-1' }),
    );
  });

  it('dispatches message.delta to onMessageDelta', () => {
    const mock = makeMockSocket();
    const cbs = { onMessageDelta: vi.fn() };
    const c = new ChatClient('ws://x', cbs, () => mock);
    c.connect();
    mock.onmessage?.({
      data: JSON.stringify({ type: 'message.delta', message_id: 'm-1', delta: '你' }),
    });
    expect(cbs.onMessageDelta).toHaveBeenCalledWith(
      expect.objectContaining({ delta: '你' }),
    );
  });

  it('send throws when socket not open', () => {
    const mock = makeMockSocket();
    mock.readyState = 3; // CLOSED
    const c = new ChatClient('ws://x', {}, () => mock);
    expect(() => c.send({ messages: [{ role: 'user', content: 'x' }] })).toThrow();
  });
});