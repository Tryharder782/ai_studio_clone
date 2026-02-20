import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const canUseServiceWorker =
  'serviceWorker' in navigator &&
  (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

if (canUseServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail: app works without PWA runtime cache.
    })
  })
}
