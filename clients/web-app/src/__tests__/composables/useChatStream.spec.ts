import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useChatStream } from '@/composables/useChatStream';
import type { WebSocketLike } from '@/lib/ws-chat-client';

function makeSocket(): WebSocketLike & { sentMessages: string[] } {
  const sent: string[] = [];
  const s: Record<string, unknown> = {
    readyState: 1,
    send(data: string) {
      sent.push(data);
    },
    close() {
      /* noop */
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  (s as { sentMessages: string[] }).sentMessages = sent;
  return s as unknown as WebSocketLike & { sentMessages: string[] };
}

describe('useChatStream', () => {
  let mock: WebSocketLike & { sentMessages: string[] };

  beforeEach(() => {
    mock = makeSocket();
  });

  function mountComposable(url = 'ws://test') {
    let result!: ReturnType<typeof useChatStream>;
    const Comp = defineComponent({
      setup() {
        result = useChatStream({ url, factory: () => mock });
        return () => h('div');
      },
    });
    const wrapper = mount(Comp);
    return { wrapper, result };
  }

  it('appends user echo immediately on send', async () => {
    const { result } = mountComposable();
    result.send([{ role: 'user', content: 'hi' }]);
    expect(result.messages.value.length).toBe(1);
    expect(result.messages.value[0]?.kind).toBe('user');
    expect(mock.sentMessages.length).toBe(1);
  });

  it('appends delta to the assistant bubble keyed by server message_id', async () => {
    const { result } = mountComposable();
    mock.onmessage?.({
      data: JSON.stringify({ type: 'message.start', message_id: 'srv-uuid-1' }),
    });
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'message.delta',
        message_id: 'srv-uuid-1',
        delta: '你',
      }),
    });
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'message.delta',
        message_id: 'srv-uuid-1',
        delta: '好',
      }),
    });
    expect(result.messages.value.length).toBe(1);
    const asst = result.messages.value[0];
    expect(asst?.kind).toBe('assistant');
    if (asst?.kind === 'assistant') {
      expect(asst.content).toBe('你好');
    }
  });

  it('attaches tool.call and tool.result to the streaming bubble', async () => {
    const { result } = mountComposable();
    mock.onmessage?.({
      data: JSON.stringify({ type: 'message.start', message_id: 'srv-1' }),
    });
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'tool.call',
        tool_call_id: 'tc-1',
        name: 'calculator',
        args: { a: 23, b: 47 },
      }),
    });
    mock.onmessage?.({
      data: JSON.stringify({
        type: 'tool.result',
        tool_call_id: 'tc-1',
        name: 'calculator',
        content: '1081',
      }),
    });
    const asst = result.messages.value[0];
    if (asst?.kind === 'assistant') {
      expect(asst.toolCalls.length).toBe(1);
      expect(asst.toolCalls[0]?.result).toBe('1081');
    }
  });
});