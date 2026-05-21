import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../index.css'
import { AppShell } from '../components/AppShell'
import { DashboardHeader } from '../components/DashboardHeader'
import { Sidebar } from '../components/Sidebar'
import type { UserContext } from '../components/AppShell'
import { useThemeStore } from '../stores/themeStore'
import { SystemAdminRoute } from '../components/SystemAdminRoute'
import { selectCurrentOfficeRole, useAuthStore } from '../stores/authStore'
import { useAuthHydrated } from '../hooks/useAuthHydrated'
import { ToastContainer } from '../components/ToastContainer'
import { ErrorBoundary } from '../components/ErrorBoundary'
import Login from '../pages/Login'

// ─── Lazy-loaded page views (one per Stitch screen design) ───────────────────
const DirectorDashboard  = React.lazy(() => import('../pages/DirectorDashboard'))
const WatchConsole       = React.lazy(() => import('../pages/WatchConsole'))
const CaseFile           = React.lazy(() => import('../pages/CaseFile'))
const AnalystWorkbench   = React.lazy(() => import('../pages/AnalystWorkbench'))
const HotspotConsole     = React.lazy(() => import('../pages/HotspotConsole'))
const KGCanvas           = React.lazy(() => import('../pages/KGCanvas'))
const HumintVault        = React.lazy(() => import('../pages/HumintVault'))
const IAMAdmin           = React.lazy(() => import('../pages/IAMAdmin'))
const RoleManagement     = React.lazy(() => import('../pages/system/RoleManagement'))
const PrivilegeManagement = React.lazy(() => import('../pages/system/PrivilegeManagement'))
const MenuManagement     = React.lazy(() => import('../pages/system/MenuManagement'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// ─── Protected Route Wrapper ──────────────────────────────────────────────────
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const authHydrated = useAuthHydrated()
  const accessToken = useAuthStore((state) => state.accessToken)
  const location = useLocation()

  if (!authHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-iip-bg text-iip-text text-sm">
        Loading session...
      </div>
    )
  }

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

// ─── Main Authenticated Layout ───────────────────────────────────────────────
const AuthenticatedLayout = () => {
  const storeUser = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const initializeSession = useAuthStore((state) => state.initializeSession)

  useEffect(() => {
    void initializeSession()
  }, [initializeSession])

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (!storeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-iip-bg text-iip-text-muted text-sm">
        Loading profile...
      </div>
    )
  }

  const officeRole = useAuthStore(selectCurrentOfficeRole)

  const userContext: UserContext = {
    name: storeUser.username,
    username: storeUser.username,
    role: officeRole ?? 'USER',
    roles: officeRole ? [officeRole] : storeUser.roles,
    clearanceLevel: storeUser.clearance_level as UserContext['clearanceLevel'],
    jitElevated: storeUser.jit_elevated,
  }

  return (
    <AppShell
      classification={userContext.clearanceLevel}
      user={userContext}
      systemStatus="ONLINE"
    >
      <div className="flex flex-1 min-h-0 w-full h-full overflow-hidden">
        <Sidebar user={userContext} className="hidden lg:flex" />

        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          <DashboardHeader user={userContext} />

          <main className="flex-1 overflow-y-auto bg-iip-bg p-4 md:p-6">
            <React.Suspense
              fallback={
                <div className="dashboard-card p-8 text-iip-text-muted text-sm">
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
              <Route
                path="/system/roles"
                element={
                  <SystemAdminRoute>
                    <RoleManagement />
                  </SystemAdminRoute>
                }
              />
              <Route
                path="/system/privileges"
                element={
                  <SystemAdminRoute>
                    <PrivilegeManagement />
                  </SystemAdminRoute>
                }
              />
              <Route
                path="/system/menus"
                element={
                  <SystemAdminRoute>
                    <MenuManagement />
                  </SystemAdminRoute>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </React.Suspense>
          </main>
        </div>
      </div>
    </AppShell>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export function App() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)

  useEffect(() => {
    setTheme(theme)
  }, [theme, setTheme])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastContainer />
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AuthenticatedLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
