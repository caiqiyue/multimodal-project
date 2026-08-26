import { http, HttpResponse } from 'msw';

export const healthHandlers = [
  http.get('/health', () => {
    return HttpResponse.json({
      status: 'ok',
      service: 'mini-program-mock',
      timestamp: Date.now(),
    });
  }),
];
