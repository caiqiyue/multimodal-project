/**
 * ConnectionStatus — top banner showing WS lifecycle to the user.
 *
 * Pure presentational. Renders one of three styles based on the state.
 */
import { Text, View } from '@tarojs/components';

import type { ConnectionState } from '../../hooks/useChatStream';

import './chat.scss';

type Props = {
  state: ConnectionState;
};

const LABEL: Record<ConnectionState, string> = {
  connecting: '🔄 正在连接服务器...',
  open: '✅ WebSocket 已连接',
  closed: '❌ 连接已断开',
};

export function ConnectionStatus({ state }: Props) {
  const className = `chat-status chat-status--${state}`;
  return (
    <View className={className}>
      <Text className='chat-status__text'>{LABEL[state]}</Text>
    </View>
  );
}