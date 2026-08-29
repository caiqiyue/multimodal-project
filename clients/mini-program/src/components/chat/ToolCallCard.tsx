/**
 * ToolCallCard — single tool invocation. Shows the name + args; once the
 * matching tool.result lands, reveals the result inline.
 *
 * Pure presentational. Caller passes a ToolCallItem from useChatStream.
 */
import { Text, View } from '@tarojs/components';

import type { ToolCallItem } from '../../hooks/useChatStream';

import './chat.scss';

type Props = {
  toolCall: ToolCallItem;
};

export function ToolCallCard({ toolCall }: Props) {
  const argsText = JSON.stringify(toolCall.args, null, 2);
  return (
    <View className='chat-tool-card'>
      <Text className='chat-tool-card__title'>🔧 {toolCall.name}</Text>
      <Text className='chat-tool-card__args'>{argsText}</Text>
      {toolCall.result !== null ? (
        <>
          <Text className='chat-tool-card__label'>→ 结果</Text>
          <Text className='chat-tool-card__result'>{toolCall.result}</Text>
        </>
      ) : (
        <Text className='chat-tool-card__label'>⏳ 等待结果...</Text>
      )}
    </View>
  );
}