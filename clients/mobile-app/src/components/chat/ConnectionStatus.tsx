/**
 * ConnectionStatus — top banner showing WS lifecycle to the user.
 *
 * Pure presentational. Renders one of three styles based on the state.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { ConnectionState } from '../../hooks/useChatStream';

type Props = {
  state: ConnectionState;
};

const LABEL: Record<ConnectionState, string> = {
  connecting: '🔄 正在连接服务器...',
  open: '✅ WebSocket 已连接',
  closed: '❌ 连接已断开',
};

export function ConnectionStatus({ state }: Props) {
  return (
    <View style={[styles.banner, styles[state]]}>
      <Text style={styles.text}>{LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  connecting: { backgroundColor: '#fef3c7' },
  open: { backgroundColor: '#d1fae5' },
  closed: { backgroundColor: '#fee2e2' },
  text: { fontSize: 12, fontWeight: '500' },
});
