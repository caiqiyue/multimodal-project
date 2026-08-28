/**
 * ToolCallCard — single tool invocation. Shows the name + args; once the
 * matching tool.result lands, reveals the result inline.
 *
 * Pure presentational. Caller passes a ToolCallItem from useChatStream.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { ToolCallItem } from '../../hooks/useChatStream';

type Props = {
  toolCall: ToolCallItem;
};

export function ToolCallCard({ toolCall }: Props) {
  const argsText = JSON.stringify(toolCall.args, null, 2);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🔧 {toolCall.name}</Text>
      <Text style={styles.args}>{argsText}</Text>
      {toolCall.result !== null ? (
        <>
          <Text style={styles.label}>→ 结果</Text>
          <Text style={styles.result}>{toolCall.result}</Text>
        </>
      ) : (
        <Text style={styles.label}>⏳ 等待结果...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f3f0ff',
    borderColor: '#c8b8ff',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#5b21b6' },
  args: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#3b0764',
    backgroundColor: '#ede9fe',
    padding: 6,
    borderRadius: 4,
    marginBottom: 6,
  },
  label: { fontSize: 12, color: '#5b21b6', marginBottom: 2 },
  result: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#1f2937',
    backgroundColor: '#fff',
    padding: 6,
    borderRadius: 4,
    borderColor: '#e5e7eb',
    borderWidth: 1,
  },
});
