import { useMemo, useState } from 'react';
import { Button, ScrollView, Text, View } from '@tarojs/components';
import { reLaunch, useLoad } from '@tarojs/taro';
import type { User } from '@multimodal/api-contract';

import { ChatInput } from '../../components/chat/ChatInput';
import { ConnectionStatus } from '../../components/chat/ConnectionStatus';
import { MessageBubble } from '../../components/chat/MessageBubble';
import type { MessageItem } from '../../hooks/useChatStream';
import { useChatStream } from '../../hooks/useChatStream';
import { resolveChatWsUrl } from '../../lib/ws-chat-client';
import { logout } from '../../lib/auth';
import { getCurrentUser } from '../../lib/tokenStorage';

import './chat.scss';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? '';

/**
 * Mini-program Chat screen (feat-131) — container component.
 *
 * Mirrors mobile-app's ChatScreen (feat-130) but adapted for Taro:
 *  - Reads user from local storage on mount (pages don't receive props in Taro).
 *  - Uses Taro components (View/Text/Button/ScrollView) instead of RN.
 *  - WebSocket layer talks to Taro.connectSocket via ws-chat-client.ts.
 *
 * The connection-status banner tells the user whether the chat backend is
 * reachable; if not, the input is disabled so they can't send into the void.
 *
 * Default export is required: Taro's page loader resolves the entry by
 * `export default`, not by named export.
 */
export default function ChatScreen() {
  const [user, setUser] = useState<User | null>(null);

  useLoad(() => {
    setUser(getCurrentUser());
  });

  const wsUrl = useMemo(() => resolveChatWsUrl(API_BASE_URL), []);
  const { messages, connectionState, send, isStreaming, reset } = useChatStream({
    url: wsUrl,
  });

  const handleSend = (text: string): void => {
    send([{ role: 'user', content: text }]);
  };

  const handleLogout = (): void => {
    logout();
    reLaunch({ url: '/pages/login/index' });
  };

  const isDisconnected = connectionState !== 'open';
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined;

  return (
    <View className='chat-screen'>
      <View className='chat-screen__header'>
        <View>
          <Text className='chat-screen__title'>对话</Text>
          <Text className='chat-screen__subtitle'>
            {user !== null
              ? `欢迎，${user.display_name}（@${user.username}）`
              : '欢迎'}
          </Text>
        </View>
        <View className='chat-screen__actions'>
          <Button
            className='chat-screen__action-btn'
            onClick={reset}
            disabled={messages.length === 0}
            size='mini'
          >
            清空
          </Button>
          <Button
            className='chat-screen__action-btn'
            onClick={handleLogout}
            size='mini'
          >
            退出登录
          </Button>
        </View>
      </View>

      <ConnectionStatus state={connectionState} />

      {isDisconnected ? (
        <View className='chat-screen__hint'>
          <Text>
            ⚠ 服务器未响应。检查：1) 后端 uvicorn 在 9000 端口？2) Mac SSH 隧道 LISTEN？
          </Text>
        </View>
      ) : null}

      <ScrollView
        className='chat-list'
        scrollY
        scrollIntoView={lastMessageId}
        scrollWithAnimation
      >
        {messages.length === 0 ? (
          <View>
            <Text className='chat-list__empty'>
              👋 输入消息，按右下角「发送」。
            </Text>
          </View>
        ) : (
          messages.map((m: MessageItem) => (
            <View key={m.id} id={m.id}>
              <MessageBubble message={m} />
            </View>
          ))
        )}
      </ScrollView>

      <ChatInput onSend={handleSend} disabled={isDisconnected} isStreaming={isStreaming} />
    </View>
  );
}