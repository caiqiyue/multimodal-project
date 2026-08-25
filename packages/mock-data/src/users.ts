import type { User } from '@multimodal/api-contract/user';

/**
 * Test users for MSW. Passwords are intentionally weak for development.
 * DO NOT use in production.
 */
export const TEST_USERS: Array<User & { password: string }> = [
  {
    id: 'user_001',
    username: 'alice',
    password: 'alice1234',
    display_name: 'Alice Wang',
    avatar_url: 'https://i.pravatar.cc/150?u=alice',
  },
  {
    id: 'user_002',
    username: 'bob',
    password: 'bob12345',
    display_name: 'Bob Chen',
    avatar_url: 'https://i.pravatar.cc/150?u=bob',
  },
  {
    id: 'user_003',
    username: 'demo',
    password: 'demo1234',
    display_name: 'Demo User',
  },
];

export function findUserByUsername(username: string) {
  return TEST_USERS.find((u) => u.username === username);
}

export function findUserById(id: string) {
  return TEST_USERS.find((u) => u.id === id);
}
