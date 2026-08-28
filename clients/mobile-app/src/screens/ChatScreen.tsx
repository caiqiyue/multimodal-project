/**
 * ChatScreen — container component for the chat feature (feat-130).
 *
 * Owns:
 *  - The persistent ChatClient (via useChatStream).
 *  - The list of messages rendered in the chat window.
 *  - Connection lifecycle and "is streaming" state.
 *
 * Pure presentational pieces (MessageBubble / StreamingText / ToolCallCard /
 * ConnectionStatus / ChatInput) live in `../components/chat/`.
 */
import { useCallback, useMemo } from 'react';
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
import { MessageBubble } from '../components/chat/MessageBubble';
import type { MessageItem } from '../hooks/useChatStream';
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

  const handleSend = useCallback(
    (text: string) => {
      send([{ role: 'user', content: text }]);
    },
    [send],
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
            👋 Hi @{user.username}。 输入消息，按回车或点击「发送」。
          </Text>
        }
      />

      <ChatInput onSend={handleSend} disabled={isDisconnected} isStreaming={isStreaming} />
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
});
