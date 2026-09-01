/**
 * MessageBubble — one row in the chat window. Routes to the right renderer
 * based on the message `kind`.
 *
 * User messages can be text-only, media-only, or both (caption + attachments).
 * Media renders as a horizontal scrollable strip above (or below, for
 * text-first messages) the caption so the user sees what they attached.
 */
import { ScrollView, Text, View } from '@tarojs/components';

import type { MessageItem } from '../../hooks/useChatStream';
import { MediaPreview } from './MediaPreview';
import { StreamingText } from './StreamingText';
import { ToolCallCard } from './ToolCallCard';

import './chat.scss';

type Props = {
  message: MessageItem;
};

function UserMediaStrip({ message }: { message: Extract<MessageItem, { kind: 'user' }> }) {
  if (!message.media || message.media.length === 0) return null;
  return (
    <ScrollView
      scrollX
      className='chat-media-strip'
      enhanced
      showScrollbar={false}
    >
      {message.media.map((m) => (
        <View key={m.id} className='chat-media-strip__item'>
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
      <View className='chat-bubble-row chat-bubble-row--user'>
        <View className='chat-bubble chat-bubble--user'>
          {hasMedia ? <UserMediaStrip message={message} /> : null}
          {hasText ? (
            <Text className='chat-bubble__user-text'>{message.text}</Text>
          ) : null}
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
