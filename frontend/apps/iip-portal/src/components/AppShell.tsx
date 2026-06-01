import { type ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClassificationLevel =
  | 'UNCLASSIFIED'
  | 'RESTRICTED'
  | 'CONFIDENTIAL'
  | 'SECRET'
  | 'TOP SECRET'

export interface UserContext {
  name: string
  username: string
  role: string
  roles: string[]
  clearanceLevel: ClassificationLevel
  jitElevated: boolean
  jitExpiresAt?: Date
  profilePhotoUrl: string | null
}

export interface AppShellProps {
  classification: ClassificationLevel
  user: UserContext
  children: ReactNode
  systemStatus?: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
}

// ─── Classification Banner ────────────────────────────────────────────────────

function AppFooter() {
  return (
    <div
      className="classification-banner h-7 shrink-0 flex items-center justify-center font-sans text-[11px] border-t font-medium tracking-normal"
      role="contentinfo"
      aria-label="Application footer"
    >
      Developed and maintained by State Intelligence Department
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-iip-bg">
      <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>
      <AppFooter />
    </div>
  )
}

export default AppShell
