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
 *
 * Mirror of `clients/mobile-app/src/components/chat/ChatInput.tsx` (Session 024).
 */
import { Button, Input, View } from '@tarojs/components';

import './chat.scss';

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

  const handleSend = (): void => {
    if (!canSend) return;
    onSend(value.trim());
  };

  const handleConfirm = (e: { detail: { value: string } }): void => {
    if (canSend) {
      onSend(e.detail.value.trim());
    }
  };

  return (
    <View className='chat-input-row'>
      <Input
        className='chat-input-row__input'
        value={value}
        onInput={(e) => onChangeText(e.detail.value)}
        placeholder={isStreaming ? '等待回复...' : '输入消息'}
        disabled={disabled}
        confirmType='send'
        onConfirm={handleConfirm}
      />
      <Button
        className='chat-input-row__button'
        onClick={handleSend}
        disabled={!canSend}
        size='mini'
      >
        {isStreaming ? '生成中' : '发送'}
      </Button>
    </View>
  );
}
