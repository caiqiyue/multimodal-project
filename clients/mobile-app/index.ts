import { registerRootComponent } from 'expo';

// MSW polyfills must load before any fetch/URL usage in React Native.
// RN lacks standard URL / TextEncoder classes, which MSW depends on.
// https://mswjs.io/docs/integrations/react-native/
import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
