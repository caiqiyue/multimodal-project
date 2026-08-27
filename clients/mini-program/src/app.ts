import { PropsWithChildren } from 'react'
import { reLaunch, useLaunch } from '@tarojs/taro'

import './app.scss'
import { getAccessToken, getCurrentUser } from './lib/tokenStorage'

// H5 target uses MSW (Service Worker available in browsers).
// weapp target uses @tarojs/plugin-mock (proxy server during wechat devtools).
// See CLAUDE.md / session-handoff for the dual-mock strategy.
//
// Taro copies public/mockServiceWorker.js to dist/mockServiceWorker.js
// (see config/index.ts copy.patterns) — root-relative path keeps the SW
// scope at "/" so it can intercept /health and any future API endpoints.
async function bootstrapMocks() {
  if (process.env.TARO_ENV === 'h5' && process.env.NODE_ENV !== 'production') {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    })
  }
}

// Cold-start session restore (feat-121).
//
// If a previous session left valid tokens + user in storage, jump straight to
// /pages/chat/index so the user does not see the login screen on relaunch.
// If only the token (or only the user) survived, drop both and let the login
// page regenerate. The /auth/me verification path that mobile-app uses after
// feat-026 backend lands — same seam, future swap.
function restoreSession(): void {
  const token = getAccessToken()
  const user = getCurrentUser()
  if (token !== null && token.length > 0 && user !== null) {
    reLaunch({ url: '/pages/chat/index' })
    return
  }
  // Either no token or no user — clear whatever half-state survived so the
  // login page doesn't accidentally rehydrate from a partial write.
  if (token !== null || user !== null) {
    // Lazy import to avoid pulling storage impl into the entry hot path
    // twice. The clearTokens side effect is what we actually want here.
    void import('./lib/tokenStorage').then(({ clearTokens }) => clearTokens())
  }
}

void bootstrapMocks()

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('App launched.')
    restoreSession()
  })

  // children 是将要会渲染的页面
  return children
}

export default App