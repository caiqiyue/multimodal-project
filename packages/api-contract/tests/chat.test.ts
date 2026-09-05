import { describe, it, expect } from 'vitest';
import { ChatStreamRequestSchema } from '../src/chat.js';

describe('chat schemas', () => {
  it('accepts text-only message', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '你好' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts multimodal content (text + image)', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '这张图里有什么？' },
          { type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects video_url content block (V3, not in V1)', () => {
    // V1 only supports text + image_url. video_url lands with feat-040
    // (Qwen3-VL supports video via vLLM but the OpenAI-compat surface we
    // proxy through doesn't yet have video_url — see NEXT_SESSION.md §3.5).
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: {
        role: 'user',
        content: [{ type: 'video_url', video_url: { url: 'https://example.com/v.mp4' } } as never],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown content type', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: {
        role: 'user',
        content: [{ type: 'audio_url', audio_url: { url: 'x' } } as never],
      },
    });
    expect(result.success).toBe(false);
  });

  // ===== V2 widening: text-only string content (V1 backward compat path) =====
  //
  // After feat-026 (WS schema sync), ChatMessageSchema.content accepts BOTH a
  // plain string (V1 path) AND a ContentBlock[] (V2 path). The HTTP /agent/invoke
  // endpoint has been dual-form since Session 023 (AgentChatMessageSchema);
  // the WS schema only landed this change when feat-033 + feat-141 began
  // sending ContentBlock[] from mobile-app + mini-program respectively.

  it('accepts text-only string content (V1 backward compat)', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: '你好' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message.content).toBe('你好');
    }
  });

  it('accepts long text-only string at the 32k boundary', () => {
    const longText = 'a'.repeat(32_000);
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: longText },
    });
    expect(result.success).toBe(true);
  });

  it('rejects text-only string over 32k chars', () => {
    const tooLong = 'a'.repeat(32_001);
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: tooLong },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty string content (min 1 char)', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty array content (boundary preserved)', () => {
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects array content with > 16 blocks (Qwen3-VL practical cap)', () => {
    const blocks = Array.from({ length: 17 }, () => ({ type: 'text', text: 'x' }));
    const result = ChatStreamRequestSchema.safeParse({
      conversation_id: 'conv_1',
      message: { role: 'user', content: blocks },
    });
    expect(result.success).toBe(false);
  });
});