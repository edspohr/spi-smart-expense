// Must be the first import: it captures `beforeinstallprompt`, which fires
// before React mounts on fast connections.
import './lib/install'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import EnvError from './components/EnvError.jsx'
import UpdateToast from './components/UpdateToast'
import { Toaster } from 'sonner'
import { validateEnv } from './lib/env'
import { applyTenantTheme } from './lib/tenant'

applyTenantTheme();

const env = validateEnv();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {env.ok ? (
      <ErrorBoundary>
        <AuthProvider>
          <App />
          <Toaster position="top-right" richColors />
        </AuthProvider>
        <UpdateToast />
      </ErrorBoundary>
    ) : (
      <EnvError missing={env.missing} />
    )}
  </React.StrictMode>,
)
