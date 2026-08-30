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
});