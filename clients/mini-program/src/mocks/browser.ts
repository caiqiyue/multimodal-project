// MSW worker for browser (H5) target.
// H5 has Service Worker support, unlike React Native which uses msw/native.
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
