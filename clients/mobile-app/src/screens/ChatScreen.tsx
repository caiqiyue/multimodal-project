import { Button, StyleSheet, Text, View } from 'react-native';
import type { User } from '@multimodal/api-contract/auth';

interface ChatScreenProps {
  user: User;
  onLogout: () => void;
}

export function ChatScreen({ user, onLogout }: ChatScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user.display_name}</Text>
      <Text style={styles.subtitle}>
        Hi @{user.username} — chat streaming (feat-130) coming soon.
      </Text>
      <View style={styles.button}>
        <Button title="Log out" onPress={onLogout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  subtitle: { color: '#666', textAlign: 'center' },
  button: { marginTop: 16 },
});
