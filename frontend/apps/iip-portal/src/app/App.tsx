import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../index.css'
import { AppShell } from '../components/AppShell'
import { DashboardHeader } from '../components/DashboardHeader'
import { Sidebar } from '../components/Sidebar'
import type { UserContext } from '../components/AppShell'
import { useThemeStore } from '../stores/themeStore'
import { AuthorizationGate } from '../components/AuthorizationGate'
import { SystemAdminRoute } from '../components/SystemAdminRoute'
import { selectCurrentOfficeRole, selectHasLockedSession, useAuthStore } from '../stores/authStore'
import { useAuthHydrated } from '../hooks/useAuthHydrated'
import { useSessionLock } from '../hooks/useSessionLock'
import { SessionLockScreen } from '../components/SessionLockScreen'
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
const OfficeManagement   = React.lazy(() => import('../pages/system/OfficeManagement'))
const UnitTypeManagement = React.lazy(() => import('../pages/system/UnitTypeManagement'))
const RankManagement     = React.lazy(() => import('../pages/system/RankManagement'))
const UserManagement     = React.lazy(() => import('../pages/system/UserManagement'))
const MyProfile          = React.lazy(() => import('../pages/MyProfile'))
const UnauthorizedPage   = React.lazy(() => import('../pages/UnauthorizedPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function UnauthorizedRedirect() {
  const location = useLocation()
  return (
    <Navigate
      to="/unauthorized"
      replace
      state={{ from: location.pathname, reason: 'unknown' as const }}
    />
  )
}

// ─── Protected Route Wrapper ──────────────────────────────────────────────────
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const authHydrated = useAuthHydrated()
  const accessToken = useAuthStore((state) => state.accessToken)
  const hasLockedSession = useAuthStore(selectHasLockedSession)
  const location = useLocation()

  if (!authHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-iip-bg text-iip-text text-sm">
        Loading session...
      </div>
    )
  }

  if (!accessToken && !hasLockedSession) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

// ─── Main Authenticated Layout ───────────────────────────────────────────────
const AuthenticatedLayout = () => {
  const storeUser = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const sessionLocked = useAuthStore((state) => state.sessionLocked)
  const sessionInitializing = useAuthStore((state) => state.sessionInitializing)
  const sessionInitFailed = useAuthStore((state) => state.sessionInitFailed)
  const initializeSession = useAuthStore((state) => state.initializeSession)
  const logout = useAuthStore((state) => state.logout)
  const officeRole = useAuthStore(selectCurrentOfficeRole)
  const authHydrated = useAuthHydrated()

  useSessionLock(Boolean(accessToken && storeUser && !sessionLocked))

  useEffect(() => {
    if (!authHydrated) return
    if (sessionLocked && !storeUser) {
      logout()
      return
    }
    if (accessToken && !sessionLocked) {
      void initializeSession()
    }
  }, [authHydrated, accessToken, sessionLocked, storeUser, initializeSession, logout])

  if (!accessToken && !sessionLocked) {
    return <Navigate to="/login" replace />
  }

  if (!storeUser) {
    if (sessionInitFailed && !sessionInitializing) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-iip-bg px-6 text-center">
          <p className="text-sm text-iip-text-muted max-w-md">
            Could not load your profile. Check that IAM service is running on port 8010, then sign in
            again.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => void initializeSession()}
            >
              Retry
            </button>
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => logout()}>
              Sign in again
            </button>
          </div>
        </div>
      )
    }
    if (!sessionInitializing && !accessToken) {
      return <Navigate to="/login" replace />
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-iip-bg text-iip-text-muted text-sm">
        <div className="h-8 w-8 border-2 border-iip-primary/30 border-t-iip-primary rounded-full animate-spin" />
        <span>Loading profile…</span>
      </div>
    )
  }

  const userContext: UserContext = {
    name: storeUser.full_name || storeUser.username,
    username: storeUser.username,
    role: officeRole ?? 'USER',
    roles: officeRole ? [officeRole] : storeUser.roles,
    clearanceLevel: storeUser.clearance_level as UserContext['clearanceLevel'],
    jitElevated: storeUser.jit_elevated,
    profilePhotoUrl: storeUser.profile_photo_url ?? null,
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
              <Route element={<AuthorizationGate />}>
                <Route path="/unauthorized" element={<UnauthorizedPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DirectorDashboard />} />
                <Route path="/profile" element={<MyProfile />} />
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
                <Route
                  path="/system/offices"
                  element={
                    <SystemAdminRoute>
                      <OfficeManagement />
                    </SystemAdminRoute>
                  }
                />
                <Route
                  path="/system/unit-types"
                  element={
                    <SystemAdminRoute>
                      <UnitTypeManagement />
                    </SystemAdminRoute>
                  }
                />
                <Route
                  path="/system/ranks"
                  element={
                    <SystemAdminRoute>
                      <RankManagement />
                    </SystemAdminRoute>
                  }
                />
                <Route
                  path="/system/users"
                  element={
                    <SystemAdminRoute>
                      <UserManagement />
                    </SystemAdminRoute>
                  }
                />
                <Route path="*" element={<UnauthorizedRedirect />} />
              </Route>
            </Routes>
            </React.Suspense>
          </main>
        </div>
      </div>
    </AppShell>
  )
}

function SessionLockGate() {
  const sessionLocked = useAuthStore((state) => state.sessionLocked)
  const user = useAuthStore((state) => state.user)
  if (!sessionLocked || !user) return null
  return <SessionLockScreen />
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
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
        <SessionLockGate />
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
