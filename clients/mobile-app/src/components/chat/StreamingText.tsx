/**
 * StreamingText — accumulated assistant text + a blinking caret while streaming.
 *
 * Pure presentational. If `content` is empty and `streaming` is true we still
 * render an empty bubble (so the user sees "the model is thinking"); if both
 * are falsy we return null (caller should guard).
 */
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  content: string;
  streaming: boolean;
};

export function StreamingText({ content, streaming }: Props) {
  if (content.length === 0 && !streaming) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{content}</Text>
      {streaming ? <Text style={styles.caret}>▍</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  text: { fontSize: 16, lineHeight: 22, color: '#111' },
  caret: { fontSize: 14, color: '#888', marginLeft: 2 },
});
