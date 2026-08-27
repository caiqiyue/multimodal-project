import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { User } from '@multimodal/api-contract/auth';
import { LoginScreen } from './src/screens/LoginScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { logout } from './src/lib/auth';
import {
  clearTokens,
  getAccessToken,
  getCurrentUser,
} from './src/lib/tokenStorage';

async function enableMocking() {
  if (!__DEV__) return;
  // React Native has no Service Worker API, so MSW uses setupServer
  // (msw/native) with listen() instead of setupWorker + start().
  const { server } = await import('./src/mocks/server');
  server.listen();
}

type AuthState =
  | { status: 'restoring' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

export default function App() {
  const [mockingEnabled, setMockingEnabled] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({ status: 'restoring' });

  useEffect(() => {
    enableMocking().then(() => setMockingEnabled(true));
  }, []);

  // Restore session: read stored token + user once MSW is up.
  // If only the token survived (older session / partial write), drop it and
  // start at anonymous. Once feat-026 backend lands, this is the spot to
  // re-validate the token via GET /me instead of trusting the stored user.
  useEffect(() => {
    if (!mockingEnabled) return;
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (cancelled) return;
      if (token === null || token.length === 0) {
        setAuthState({ status: 'anonymous' });
        return;
      }
      const user = await getCurrentUser();
      if (cancelled) return;
      if (user !== null) {
        setAuthState({ status: 'authenticated', user });
      } else {
        await clearTokens();
        setAuthState({ status: 'anonymous' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mockingEnabled]);

  const handleLoggedIn = useCallback((user: User) => {
    setAuthState({ status: 'authenticated', user });
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthState({ status: 'anonymous' });
  }, []);

  if (!mockingEnabled || authState.status === 'restoring') {
    return (
      <View style={splashStyles.root}>
        <ActivityIndicator />
      </View>
    );
  }

  if (authState.status === 'anonymous') {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return <ChatScreen user={authState.user} onLogout={handleLogout} />;
}

const splashStyles = {
  root: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
};
