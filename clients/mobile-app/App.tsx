import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

async function enableMocking() {
  if (!__DEV__) return;
  // React Native has no Service Worker API, so MSW uses setupServer
  // (msw/native) with listen() instead of setupWorker + start().
  const { server } = await import('./src/mocks/server');
  server.listen();
}

function HomeScreen() {
  const [healthStatus, setHealthStatus] = useState<string>('checking...');

  useEffect(() => {
    import('./src/lib/api').then(({ checkHealth }) => {
      checkHealth()
        .then((res) => setHealthStatus(res.status))
        .catch((err) => setHealthStatus(`error: ${err.message}`));
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Multimodal Mobile App</Text>
      <Text>MSW health: {healthStatus}</Text>
    </View>
  );
}

export default function App() {
  const [mockingEnabled, setMockingEnabled] = useState(false);

  useEffect(() => {
    enableMocking().then(() => setMockingEnabled(true));
  }, []);

  if (!mockingEnabled) return null;
  return <HomeScreen />;
}
