/**
 * MessageBubble — one row in the chat window. Routes to the right renderer
 * based on the message `kind`.
 */
import { Text, View } from '@tarojs/components';

import type { MessageItem } from '../../hooks/useChatStream';
import { StreamingText } from './StreamingText';
import { ToolCallCard } from './ToolCallCard';

import './chat.scss';

type Props = {
  message: MessageItem;
};

export function MessageBubble({ message }: Props) {
  if (message.kind === 'user') {
    return (
      <View className='chat-bubble-row chat-bubble-row--user'>
        <View className='chat-bubble chat-bubble--user'>
          <Text className='chat-bubble__user-text'>{message.content}</Text>
        </View>
      </View>
    );
  }

  if (message.kind === 'assistant') {
    return (
      <View className='chat-bubble-row chat-bubble-row--assistant'>
        <View className='chat-bubble chat-bubble--assistant'>
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
    <View className='chat-bubble-row chat-bubble-row--error'>
      <View className='chat-bubble chat-bubble--error'>
        <Text className='chat-bubble__error-label'>⚠ {message.code}</Text>
        <Text className='chat-bubble__error-message'>{message.message}</Text>
      </View>
    </View>
  );
}