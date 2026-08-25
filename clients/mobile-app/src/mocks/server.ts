// MSW server for React Native.
// RN has no Service Worker API, so we use the /native entry point
// (setupServer) instead of msw/browser (setupWorker). See:
// https://mswjs.io/docs/integrations/react-native/
import { setupServer } from 'msw/native';
import { handlers } from './handlers/index';

export const server = setupServer(...handlers);
