import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

import './app.scss'

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

void bootstrapMocks()

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return children
}



export default App
