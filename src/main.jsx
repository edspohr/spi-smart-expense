import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import InstallPwaPrompt from './components/InstallPwaPrompt.jsx'
import { Toaster } from 'sonner'

// Capture the beforeinstallprompt event as early as possible so React can
// read it later. If we waited for mount, we'd miss it on fast connections.
window.__deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__deferredPwaPrompt = e;
  window.dispatchEvent(new CustomEvent('spi:pwa-ready'));
});
window.addEventListener('appinstalled', () => {
  window.__deferredPwaPrompt = null;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <Toaster position="top-right" richColors />
      </AuthProvider>
      <InstallPwaPrompt />
    </ErrorBoundary>
  </React.StrictMode>,
)
