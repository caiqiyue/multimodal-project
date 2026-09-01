import { useCallback, useMemo, useState } from 'react';
import { Button, ScrollView, Text, View } from '@tarojs/components';
import { reLaunch, useLoad } from '@tarojs/taro';
import type { User } from '@multimodal/api-contract';

import { ChatInput } from '../../components/chat/ChatInput';
import { ConnectionStatus } from '../../components/chat/ConnectionStatus';
import { ImagePickerButton } from '../../components/chat/ImagePickerButton';
import { MessageBubble } from '../../components/chat/MessageBubble';
import type { LocalMedia, MessageItem } from '../../hooks/useChatStream';
import { useChatStream } from '../../hooks/useChatStream';
import { resolveChatWsUrl } from '../../lib/ws-chat-client';
import { logout } from '../../lib/auth';
import { getCurrentUser } from '../../lib/tokenStorage';

import './chat.scss';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? '';

/**
 * Mini-program Chat screen (feat-131) — container component.
 *
 * Mirrors mobile-app's ChatScreen (feat-130 + Session 024 multi-modal) but
 * adapted for Taro:
 *  - Reads user from local storage on mount (pages don't receive props in Taro).
 *  - Uses Taro components (View/Text/Button/ScrollView) instead of RN.
 *  - WebSocket layer talks to Taro.connectSocket via ws-chat-client.ts.
 *  - Caption state is owned here so the picker button can read it when
 *    Taro.chooseMedia returns and combine the typed text with the newly
 *    uploaded media into a single ContentBlock[] turn.
 *
 * Default export is required: Taro's page loader resolves the entry by
 * `export default`, not by named export.
 */
export default function ChatScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [caption, setCaption] = useState('');

  useLoad(() => {
    setUser(getCurrentUser());
  });

  const wsUrl = useMemo(() => resolveChatWsUrl(API_BASE_URL), []);
  const { messages, connectionState, send, isStreaming, reset } = useChatStream({
    url: wsUrl,
  });

  const handleSend = (text: string): void => {
    send([{ role: 'user', content: text }]);
    setCaption('');
  };

  const handleMediaReady = useCallback(
    (media: LocalMedia[]) => {
      // Picker just finished — send the turn immediately with whatever
      // caption the user has typed, plus a fallback if they didn't type
      // anything. Video-only sends get a Chinese fallback so the agent
      // has *something* to respond to (V1 has no video_url block; the
      // video is rendered locally but not forwarded to the agent).
      const trimmed = caption.trim();
      const hasVideo = media.some((m) => m.mediaType === 'video');
      const fallback =
        media.length === 1 && media[0]?.mediaType === 'image'
          ? '看这张图'
          : hasVideo
            ? '我发了一段视频'
            : '看看这些';
      const text = trimmed.length > 0 ? trimmed : fallback;
      send([{ role: 'user', content: text, media }]);
      setCaption('');
    },
    [caption, send],
  );

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
              👋 输入消息，按右下角「发送」。 点 📎 上传图片或视频。
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

      <View className='chat-screen__input-row'>
        <ChatInput
          value={caption}
          onChangeText={setCaption}
          onSend={handleSend}
          disabled={isDisconnected}
          isStreaming={isStreaming}
        />
        <ImagePickerButton
          onMediaReady={handleMediaReady}
          disabled={isDisconnected || isStreaming}
        />
      </View>
    </View>
  );
}
