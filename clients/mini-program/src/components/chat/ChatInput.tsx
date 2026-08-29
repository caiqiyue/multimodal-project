/**
 * ChatInput — text field + send button. Pure presentational.
 *
 * The send button is disabled when:
 *  - the input is empty (no message to send), or
 *  - the parent reports `isStreaming` (avoid overlapping turns on one socket),
 *  - or `disabled` is set (e.g. when the WebSocket isn't open).
 */
import { useState } from 'react';
import { Button, Input, View } from '@tarojs/components';

import './chat.scss';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
};

export function ChatInput({ onSend, disabled = false, isStreaming = false }: Props) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  const handleSend = (): void => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const handleConfirm = (e: { detail: { value: string } }): void => {
    if (canSend) {
      onSend(e.detail.value.trim());
      setText('');
    }
  };

  return (
    <View className='chat-input-row'>
      <Input
        className='chat-input-row__input'
        value={text}
        onInput={(e) => setText(e.detail.value)}
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