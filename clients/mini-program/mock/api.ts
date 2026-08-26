// Mock API for @tarojs/plugin-mock (weapp target).
// During `taro build --type weapp --watch`, the plugin starts an Express server
// on 127.0.0.1:9527 that serves these endpoints. The WeChat dev tools fetch from
// this server while previewing the mini-program.
//
// H5 target uses MSW (Service Worker) instead — see src/mocks/handlers/health.ts.
// Keep both endpoints in sync when adding new mocks.

export default {
  'GET /health': {
    status: 'ok',
    service: 'mini-program-mock-weapp',
    timestamp: Date.now(),
  },
}
