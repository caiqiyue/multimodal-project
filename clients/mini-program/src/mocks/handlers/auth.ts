import { http, HttpResponse } from 'msw';
import {
  LoginRequestSchema,
  WechatMiniRequestSchema,
} from '@multimodal/api-contract';
import { mockLogin, mockWechatMini } from '@multimodal/mock-data';

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

  // WeChat Mini Program login (feat-121): client calls Taro.login() to get a
  // wx code, then POSTs it here. Mock layer short-circuits the WeChat API
  // exchange (no AppID yet, blocked on feat-037) and returns tokens for any
  // non-empty code. See packages/mock-data/src/auth.ts for the resolution rule.
  http.post('/auth/wechat-mini', async ({ request }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return HttpResponse.json({ error: 'invalid_code' }, { status: 400 });
    }
    const parsed = WechatMiniRequestSchema.safeParse(body);
    if (!parsed.success) {
      return HttpResponse.json({ error: 'invalid_code' }, { status: 400 });
    }
    const result = mockWechatMini(parsed.data.code);
    if (!result.ok) {
      return HttpResponse.json({ error: result.error }, { status: 400 });
    }
    return HttpResponse.json(result.response);
  }),
];