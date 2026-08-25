import { http, HttpResponse } from 'msw';

export const healthHandlers = [
  http.get('/health', () => {
    return HttpResponse.json({
      status: 'ok',
      service: 'mobile-app-mock',
      timestamp: Date.now(),
    });
  }),
];