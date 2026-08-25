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
    };
    expect(event.type).toBe('message.start');
  });

  it('MessageDeltaEvent carries a delta string', () => {
    const event: ChatEvent = {
      type: 'message.delta',
      id: 'm1',
      conversation_id: 'c1',
      created_at: 1000,
      delta: '你好',
    };
    if (event.type === 'message.delta') {
      expect(event.delta).toBe('你好');
    }
  });

  it('MessageDoneEvent includes usage', () => {
    const event: ChatEvent = {
      type: 'message.done',
      id: 'm1',
      conversation_id: 'c1',
      created_at: 1000,
      finish_reason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    if (event.type === 'message.done') {
      expect(event.usage?.total_tokens).toBe(15);
    }
  });
});
