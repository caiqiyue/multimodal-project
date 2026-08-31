/**
 * MessageBubble — one row in the chat window. Routes to the right renderer
 * based on the message `kind`.
 *
 * User messages can be text-only, media-only, or both (caption + attachments).
 * Media renders as a horizontal scrollable strip above (or below, for
 * text-first messages) the caption so the user sees what they attached.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MessageItem } from '../../hooks/useChatStream';
import { MediaPreview } from './MediaPreview';
import { StreamingText } from './StreamingText';
import { ToolCallCard } from './ToolCallCard';

type Props = {
  message: MessageItem;
};

function UserMediaStrip({ message }: { message: Extract<MessageItem, { kind: 'user' }> }) {
  if (!message.media || message.media.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.mediaStrip}
      contentContainerStyle={styles.mediaStripContent}
    >
      {message.media.map((m) => (
        <View key={m.id} style={styles.mediaItem}>
          <MediaPreview media={m} variant="user" />
        </View>
      ))}
    </ScrollView>
  );
}

export function MessageBubble({ message }: Props) {
  if (message.kind === 'user') {
    const hasMedia = !!message.media && message.media.length > 0;
    const hasText = !!message.text && message.text.length > 0;
    return (
      <View style={[styles.row, styles.userRow]}>
        <View style={[styles.bubble, styles.userBubble]}>
          {hasMedia ? <UserMediaStrip message={message} /> : null}
          {hasText ? <Text style={styles.userText}>{message.text}</Text> : null}
        </View>
      </View>
    );
  }

  if (message.kind === 'assistant') {
    return (
      <View style={[styles.row, styles.assistantRow]}>
        <View style={[styles.bubble, styles.assistantBubble]}>
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.toolCallId} toolCall={tc} />
          ))}
          <StreamingText content={message.content} streaming={message.streaming} />
        </View>
      </View>
    );
  }

  // error
  return (
    <View style={[styles.row, styles.errorRow]}>
      <View style={[styles.bubble, styles.errorBubble]}>
        <Text style={styles.errorLabel}>⚠ {message.code}</Text>
        <Text style={styles.errorMessage}>{message.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  errorRow: { justifyContent: 'center' },
  bubble: {
    maxWidth: '85%',
    borderRadius: 12,
    padding: 10,
  },
  userBubble: { backgroundColor: '#3b82f6' },
  assistantBubble: { backgroundColor: '#f3f4f6' },
  errorBubble: { backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1 },
  userText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  mediaStrip: {
    marginBottom: 6,
    marginHorizontal: -2,
  },
  mediaStripContent: {
    paddingHorizontal: 2,
    gap: 6,
  },
  mediaItem: {
    marginRight: 6,
  },
  errorLabel: { color: '#991b1b', fontWeight: '600', fontSize: 12, marginBottom: 4 },
  errorMessage: { color: '#7f1d1d', fontSize: 14, lineHeight: 20 },
});
