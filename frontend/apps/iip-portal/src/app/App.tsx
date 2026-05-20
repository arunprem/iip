import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../index.css'
import { AppShell } from '../components/AppShell'
import { Sidebar } from '../components/Sidebar'
import type { UserContext } from '../components/AppShell'

// ─── Lazy-loaded page views (one per Stitch screen design) ───────────────────
const DirectorDashboard  = React.lazy(() => import('../pages/DirectorDashboard'))
const WatchConsole       = React.lazy(() => import('../pages/WatchConsole'))
const CaseFile           = React.lazy(() => import('../pages/CaseFile'))
const AnalystWorkbench   = React.lazy(() => import('../pages/AnalystWorkbench'))
const HotspotConsole     = React.lazy(() => import('../pages/HotspotConsole'))
const KGCanvas           = React.lazy(() => import('../pages/KGCanvas'))
const HumintVault        = React.lazy(() => import('../pages/HumintVault'))
const IAMAdmin           = React.lazy(() => import('../pages/IAMAdmin'))

// ─── Mock user — replace with auth store in production ───────────────────────
const MOCK_USER: UserContext = {
  name: 'System Administrator',
  username: 'admin',
  role: 'SYSTEM_ADMIN',
  clearanceLevel: 'CONFIDENTIAL',
  jitElevated: false,
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// ─── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell
          classification={MOCK_USER.clearanceLevel}
          user={MOCK_USER}
          systemStatus="ONLINE"
        >
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            <Sidebar user={MOCK_USER} />

            {/* Main Worksurface */}
            <main
              style={{
                flex: 1,
                overflow: 'auto',
                background: 'var(--color-bg)',
                padding: 'var(--space-6)',
              }}
            >
              <React.Suspense
                fallback={
                  <div
                    style={{
                      color: 'var(--color-on-surface-variant)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      paddingTop: 'var(--space-8)',
                    }}
                  >
                    Loading module...
                  </div>
                }
              >
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DirectorDashboard />} />
                  <Route path="/watch-console" element={<WatchConsole />} />
                  <Route path="/cases/:id?" element={<CaseFile />} />
                  <Route path="/analyst-workbench" element={<AnalystWorkbench />} />
                  <Route path="/hotspot-console" element={<HotspotConsole />} />
                  <Route path="/kg-canvas" element={<KGCanvas />} />
                  <Route path="/humint-vault" element={<HumintVault />} />
                  <Route path="/iam-admin" element={<IAMAdmin />} />
                </Routes>
              </React.Suspense>
            </main>
          </div>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
