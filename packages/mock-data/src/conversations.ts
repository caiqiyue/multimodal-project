import type { Conversation } from '@multimodal/api-contract';

export const TEST_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_001',
    user_id: 'user_001',
    title: '介绍北京故宫',
    created_at: Date.now() - 86400000 * 3,
    updated_at: Date.now() - 3600000,
    message_count: 4,
    last_message_preview: '故宫又称紫禁城...',
  },
  {
    id: 'conv_002',
    user_id: 'user_001',
    title: 'Python 装饰器',
    created_at: Date.now() - 86400000 * 2,
    updated_at: Date.now() - 7200000,
    message_count: 8,
    last_message_preview: '装饰器本质上是一个函数...',
  },
  {
    id: 'conv_003',
    user_id: 'user_001',
    title: '这张图里有什么？',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 1800000,
    message_count: 2,
    last_message_preview: '图片中展示了一只橘猫...',
  },
  {
    id: 'conv_004',
    user_id: 'user_002',
    title: '翻译文档',
    created_at: Date.now() - 3600000 * 5,
    updated_at: Date.now() - 1800000,
    message_count: 6,
    last_message_preview: 'The quick brown fox...',
  },
  {
    id: 'conv_005',
    user_id: 'user_001',
    title: '视频内容描述',
    created_at: Date.now() - 1800000,
    updated_at: Date.now() - 600000,
    message_count: 2,
    last_message_preview: '视频中展示了城市天际线...',
  },
];

export function findConversationById(id: string) {
  return TEST_CONVERSATIONS.find((c) => c.id === id);
}

export function listConversationsByUser(userId: string) {
  return TEST_CONVERSATIONS.filter((c) => c.user_id === userId);
}
