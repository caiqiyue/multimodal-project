/**
 * ChatScreen — container component for the chat feature (feat-130).
 *
 * Owns:
 *  - The persistent ChatClient (via useChatStream).
 *  - The list of messages rendered in the chat window.
 *  - Connection lifecycle and "is streaming" state.
 *  - The caption text + image picker for the next user turn.
 *
 * Pure presentational pieces (MessageBubble / StreamingText / ToolCallCard /
 * ConnectionStatus / ChatInput / ImagePickerButton / MediaPreview) live in
 * `../components/chat/`.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ChatInput } from '../components/chat/ChatInput';
import { ConnectionStatus } from '../components/chat/ConnectionStatus';
import { ImagePickerButton } from '../components/chat/ImagePickerButton';
import { MessageBubble } from '../components/chat/MessageBubble';
import type { LocalMedia, MessageItem } from '../hooks/useChatStream';
import { useChatStream } from '../hooks/useChatStream';
import { resolveChatWsUrl } from '../lib/ws-chat-client';
import type { User } from '@multimodal/api-contract/auth';

type Props = {
  user: User;
  onLogout: () => void;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export function ChatScreen({ user, onLogout }: Props) {
  const wsUrl = useMemo(() => resolveChatWsUrl(API_BASE_URL), []);
  const { messages, connectionState, send, isStreaming, reset } = useChatStream({
    url: wsUrl,
  });
  const [caption, setCaption] = useState('');

  const handleSendText = useCallback(
    (text: string) => {
      send([{ role: 'user', content: text }]);
      setCaption('');
    },
    [send],
  );

  const handleMediaReady = useCallback(
    (media: LocalMedia[]) => {
      // Picker just finished — send the turn immediately with whatever
      // caption the user has typed, plus a fallback if they didn't type
      // anything. Video-only sends get a Chinese fallback so the agent
      // has *something* to respond to (V1 has no video_url block; the
      // video is rendered locally but not forwarded to the agent — see
      // useChatStream.blocksForUserSend).
      const trimmed = caption.trim();
      const hasVideo = media.some((m) => m.mediaType === 'video');
      const fallback = media.length === 1 && media[0]?.mediaType === 'image'
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

  const renderItem = useCallback(
    ({ item }: { item: MessageItem }) => <MessageBubble message={item} />,
    [],
  );

  const isDisconnected = connectionState !== 'open';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Welcome, {user.display_name}</Text>
        <View style={styles.headerButtons}>
          <Button title="清空" onPress={reset} disabled={messages.length === 0} />
          <View style={styles.spacer} />
          <Button title="退出登录" onPress={onLogout} />
        </View>
      </View>

      <ConnectionStatus state={connectionState} />

      {isDisconnected ? (
        <Text style={styles.hint}>
          ⚠ 服务器未响应。检查：1) 后端 uvicorn 在 9000 端口？2) Mac SSH 隧道 LISTEN？
        </Text>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            👋 Hi @{user.username}。 输入消息，按回车或点击「发送」。 点 📎 上传图片或视频。
          </Text>
        }
      />

      <View style={styles.inputRow}>
        <ChatInput
          value={caption}
          onChangeText={setCaption}
          onSend={handleSendText}
          disabled={isDisconnected}
          isStreaming={isStreaming}
        />
        <ImagePickerButton
          onMediaReady={handleMediaReady}
          disabled={isDisconnected || isStreaming}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  title: { fontSize: 18, fontWeight: '600' },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  spacer: { width: 8 },
  hint: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  list: { paddingVertical: 8, flexGrow: 1 },
  empty: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
});
