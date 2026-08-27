import { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import { reLaunch, useLoad } from '@tarojs/taro';
import type { User } from '@multimodal/api-contract';
import { logout } from '../../lib/auth';
import { getCurrentUser } from '../../lib/tokenStorage';

/**
 * Mini-program Chat screen — placeholder (feat-121 ships the entry, feat-131
 * ships the real WebSocket-driven streaming UI).
 *
 * Purpose for now: prove the auth flow lands here after Taro.login() +
 * /auth/wechat-mini succeeds, and that the stored session survives an
 * app restart. The logout button drops tokens and re-launches to /pages/login/index
 * so we can round-trip the cold-start restore path during development.
 *
 * Reads the user via getCurrentUser() on mount — pages don't receive props
 * from the App component in Taro, so all state crosses the storage boundary.
 * If storage is missing for some reason, fall back to a placeholder name
 * rather than crashing; the parent app.ts redirect-on-launch would have
 * already moved us away if no token existed.
 *
 * Default export is required: Taro's page loader resolves the entry by
 * `export default`, not by named export.
 */
export default function ChatScreen() {
  const [user, setUser] = useState<User | null>(null);

  useLoad(() => {
    setUser(getCurrentUser());
  });

  const handleLogout = (): void => {
    logout();
    reLaunch({ url: '/pages/login/index' });
  };

  return (
    <View className='chat-screen'>
      <View className='chat-screen__header'>
        <Text className='chat-screen__title'>对话</Text>
        <Text className='chat-screen__subtitle'>
          {user !== null
            ? `欢迎，${user.display_name}（@${user.username}）`
            : '欢迎'}
        </Text>
      </View>

      <View className='chat-screen__body'>
        <Text className='chat-screen__placeholder'>
          Chat coming soon (feat-131)
        </Text>
      </View>

      <View className='chat-screen__actions'>
        <Button className='chat-screen__logout' onClick={handleLogout}>
          退出登录
        </Button>
      </View>
    </View>
  );
}