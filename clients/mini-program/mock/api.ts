import { LoginRequestSchema } from '@multimodal/api-contract';
import { mockLogin } from '@multimodal/mock-data';

// Mock API for @tarojs/plugin-mock (weapp target).
// During `taro build --type weapp --watch`, the plugin starts an Express server
// on 127.0.0.1:9527 that serves these endpoints. The WeChat dev tools fetch from
// this server while previewing the mini-program.
//
// H5 target uses MSW (Service Worker) instead — see src/mocks/handlers/auth.ts.
// Keep both endpoints in sync when adding new mocks.

interface SidecarRequest {
  body?: Record<string, unknown>;
}

interface SidecarResponse {
  status: (code: number) => SidecarResponse;
  json: (body: unknown) => void;
}

function handleLogin(req: SidecarRequest, res: SidecarResponse): void {
  const parsed = LoginRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  const result = mockLogin(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    const status = result.error === 'invalid_credentials' ? 401 : 400;
    res.status(status).json({ error: result.error });
    return;
  }
  res.json(result.response);
}

export default {
  'GET /health': {
    status: 'ok',
    service: 'mini-program-mock-weapp',
    timestamp: Date.now(),
  },
  'POST /auth/login': handleLogin,
};
