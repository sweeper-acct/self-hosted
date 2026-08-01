import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const _sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (_sentryDsn) {
  Sentry.init({
    dsn: _sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.05,
    sendDefaultPii: false, // Australian Privacy Act — no PII in error reports
  })
}

function ErrorFallback() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: '#111827', color: '#f9fafb',
      fontFamily: 'system-ui, sans-serif', gap: '12px',
    }}>
      <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>Something went wrong.</p>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
        This error has been reported. Please refresh the page.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '8px', padding: '8px 20px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem',
        }}
      >
        Refresh
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
