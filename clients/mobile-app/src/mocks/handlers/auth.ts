import { http, HttpResponse } from 'msw';
import { LoginRequestSchema } from '@multimodal/api-contract/auth';
import { mockLogin } from '@multimodal/mock-data/auth';

export const authHandlers = [
  http.post('/auth/login', async ({ request }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return HttpResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return HttpResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const result = mockLogin(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      const status = result.error === 'invalid_credentials' ? 401 : 400;
      return HttpResponse.json({ error: result.error }, { status });
    }
    return HttpResponse.json(result.response);
  }),
];
