import type { ChatEvent } from '@multimodal/chat-protocol';

/**
 * Sample SSE stream payloads for testing chat streaming.
 * Each stream is a sequence of ChatEvent objects representing one AI response.
 */
export const TEST_MESSAGE_STREAMS: Record<string, ChatEvent[]> = {
  conv_003: [
    // Image description response
    {
      type: 'message.start',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      role: 'assistant',
      message_id: 'msg_test_001',
    },
    {
      type: 'message.delta',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      delta: '图片中',
    },
    {
      type: 'message.delta',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      delta: '展示了一只',
    },
    {
      type: 'message.delta',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      delta: '橘色虎斑猫',
    },
    {
      type: 'message.delta',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      delta: '，正在阳光下',
    },
    {
      type: 'message.delta',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      delta: '打盹。',
    },
    {
      type: 'message.done',
      id: 'msg_test_001',
      conversation_id: 'conv_003',
      created_at: Date.now(),
      message_id: 'msg_test_001',
      full_content: '图片中展示了一只橘色虎斑猫，正在阳光下打盹。',
      finish_reason: 'stop',
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    },
  ],
  default: [
    {
      type: 'message.start',
      id: 'msg_default',
      conversation_id: 'unknown',
      created_at: Date.now(),
      role: 'assistant',
      message_id: 'msg_default',
    },
    {
      type: 'message.delta',
      id: 'msg_default',
      conversation_id: 'unknown',
      created_at: Date.now(),
      message_id: 'msg_default',
      delta: '这是一个测试响应。',
    },
    {
      type: 'message.done',
      id: 'msg_default',
      conversation_id: 'unknown',
      created_at: Date.now(),
      message_id: 'msg_default',
      full_content: '这是一个测试响应。',
      finish_reason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    },
  ],
};

export function getStreamForConversation(conversationId: string): ChatEvent[] {
  return TEST_MESSAGE_STREAMS[conversationId] ?? TEST_MESSAGE_STREAMS['default']!;
}
