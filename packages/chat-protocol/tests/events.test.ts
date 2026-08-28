import { describe, it, expect } from 'vitest';
import type { ChatEvent } from '../src/events.js';

describe('ChatEvent discriminated union', () => {
  it('MessageStartEvent has type "message.start"', () => {
    const event: ChatEvent = {
      type: 'message.start',
      id: 'm1',
      conversation_id: 'c1',
      created_at: 1000,
      role: 'assistant',
      message_id: 'msg-1',
    };
    expect(event.type).toBe('message.start');
  });

  it('MessageDeltaEvent carries a delta string', () => {
    const event: ChatEvent = {
      type: 'message.delta',
      id: 'm1',
      conversation_id: 'c1',
      created_at: 1000,
      message_id: 'msg-1',
      delta: '你好',
    };
    if (event.type === 'message.delta') {
      expect(event.delta).toBe('你好');
      expect(event.message_id).toBe('msg-1');
    }
  });

  it('MessageDoneEvent includes usage + full_content', () => {
    const event: ChatEvent = {
      type: 'message.done',
      id: 'm1',
      conversation_id: 'c1',
      created_at: 1000,
      message_id: 'msg-1',
      full_content: '你好世界',
      finish_reason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    if (event.type === 'message.done') {
      expect(event.usage?.total_tokens).toBe(15);
      expect(event.full_content).toBe('你好世界');
    }
  });
});
