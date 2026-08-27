import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  LoginRequestSchema,
  type User,
} from '@multimodal/api-contract/auth';
import { login } from '../lib/auth';

interface LoginScreenProps {
  onLoggedIn: (user: User) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setErrorMessage(null);
    const parsed = LoginRequestSchema.safeParse({ username, password });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setErrorMessage(firstIssue?.message ?? 'Invalid input');
      return;
    }
    setIsSubmitting(true);
    try {
      const user = await login(parsed.data);
      onLoggedIn(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isSubmitting && username.length > 0 && password.length >= 8;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.hint}>
        Try alice / alice1234, bob / bob12345, demo / demo1234
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        editable={!isSubmitting}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!isSubmitting}
      />
      {errorMessage !== null && (
        <Text style={styles.error}>{errorMessage}</Text>
      )}
      <View style={styles.button}>
        <Button
          title={isSubmitting ? 'Signing in…' : 'Sign in'}
          onPress={handleSubmit}
          disabled={!canSubmit}
        />
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
  title: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  hint: { color: '#666', textAlign: 'center', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
  },
  button: { marginTop: 8 },
  error: { color: '#c00', textAlign: 'center' },
});
