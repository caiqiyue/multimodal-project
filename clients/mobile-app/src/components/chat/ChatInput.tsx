/**
 * ChatInput — text field + send button. Pure presentational, controlled.
 *
 * The send button is disabled when:
 *  - the input is empty (no message to send), or
 *  - the parent reports `isStreaming` (avoid overlapping turns on one socket),
 *  - or `disabled` is set (e.g. when the WebSocket isn't open).
 *
 * Controlled (value + onChangeText) so the chat screen can read the caption
 * when the user taps the image picker and combine it with newly-uploaded
 * media into a single ContentBlock[] turn.
 */
import { StyleSheet, TextInput, View } from 'react-native';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
};

export function ChatInput({
  value,
  onChangeText,
  onSend,
  disabled = false,
  isStreaming = false,
}: Props) {
  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={isStreaming ? '等待回复...' : '输入消息，回车发送'}
        editable={!disabled}
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
});
