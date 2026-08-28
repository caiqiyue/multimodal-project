/**
 * MessageBubble — one row in the chat window. Routes to the right renderer
 * based on the message `kind`.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { MessageItem } from '../../hooks/useChatStream';
import { StreamingText } from './StreamingText';
import { ToolCallCard } from './ToolCallCard';

type Props = {
  message: MessageItem;
};

export function MessageBubble({ message }: Props) {
  if (message.kind === 'user') {
    return (
      <View style={[styles.row, styles.userRow]}>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{message.content}</Text>
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
  errorLabel: { color: '#991b1b', fontWeight: '600', fontSize: 12, marginBottom: 4 },
  errorMessage: { color: '#7f1d1d', fontSize: 14, lineHeight: 20 },
});
