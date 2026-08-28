/**
 * ChatInput — text field + send button. Pure presentational.
 *
 * The send button is disabled when:
 *  - the input is empty (no message to send), or
 *  - the parent reports `isStreaming` (avoid overlapping turns on one socket),
 *  - or `disabled` is set (e.g. when the WebSocket isn't open).
 */
import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
};

export function ChatInput({ onSend, disabled = false, isStreaming = false }: Props) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={isStreaming ? '等待回复...' : '输入消息，回车发送'}
        editable={!disabled}
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
      <Button title={isStreaming ? '生成中' : '发送'} onPress={handleSend} disabled={!canSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
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
