import './view/base/index.ts'
import './view/benchmark/index.ts'
import './view/card/index.ts'
import './view/chart/index.ts'
import './view/checkbox/index.ts'
import './view/code/index.ts'
import './view/field/index.ts'
import './view/fullmodel/index.ts'
import './view/layout/index.ts'
import './view/main/index.ts'
import './view/minimodel/index.ts'
import './view/mode/index.ts'
import './view/range/index.ts'
import './view/sample/index.ts'
import './view/settings/index.ts'
import './view/analytics/index.ts'
import './view/link/index.ts'
import './view/admin/index.ts'

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('SW registered:', registration)
      })
      .catch(err => {
        console.log('SW registration failed:', err)
      })
  })
}
