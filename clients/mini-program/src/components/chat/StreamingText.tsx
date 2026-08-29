/**
 * StreamingText — accumulated assistant text + a blinking caret while streaming.
 *
 * Pure presentational. If `content` is empty and `streaming` is true we still
 * render an empty bubble (so the user sees "the model is thinking"); if both
 * are falsy we return null (caller should guard).
 */
import { Text, View } from '@tarojs/components';

import './chat.scss';

type Props = {
  content: string;
  streaming: boolean;
};

export function StreamingText({ content, streaming }: Props) {
  if (content.length === 0 && !streaming) return null;
  return (
    <View className='chat-streaming'>
      <Text className='chat-streaming__text'>{content}</Text>
      {streaming ? <Text className='chat-streaming__caret'>▍</Text> : null}
    </View>
  );
}