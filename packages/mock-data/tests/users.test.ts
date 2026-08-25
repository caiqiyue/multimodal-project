import { describe, it, expect } from 'vitest';
import { TEST_USERS, findUserByUsername, findUserById } from '../src/users.js';

describe('users fixture', () => {
  it('TEST_USERS has 3 entries', () => {
    expect(TEST_USERS).toHaveLength(3);
  });

  it('findUserByUsername finds alice', () => {
    const user = findUserByUsername('alice');
    expect(user).toBeDefined();
    expect(user?.display_name).toBe('Alice Wang');
  });

  it('findUserByUsername returns undefined for missing', () => {
    expect(findUserByUsername('ghost')).toBeUndefined();
  });

  it('findUserById finds user_002', () => {
    const user = findUserById('user_002');
    expect(user?.username).toBe('bob');
  });
});
