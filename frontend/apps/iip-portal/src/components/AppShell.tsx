import React, { type ReactNode } from 'react'

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
}

export interface AppShellProps {
  classification: ClassificationLevel
  user: UserContext
  children: ReactNode
  systemStatus?: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
}

// ─── Classification Banner ────────────────────────────────────────────────────

function ClassificationBanner({
  level,
  position,
}: {
  level: ClassificationLevel
  position: 'top' | 'bottom'
}) {
  const isTop = position === 'top';
  const label = isTop
    ? `${level} — NEED TO KNOW ACCESS ONLY`
    : 'Developed and maintained by State Intelligence Department';

  return (
    <div
      className={`classification-banner h-7 shrink-0 flex items-center justify-center gap-2 font-sans text-[11px] sticky z-50 ${
        isTop
          ? 'top-0 border-b font-semibold tracking-[0.14em] uppercase'
          : 'bottom-0 border-t font-medium tracking-normal normal-case'
      }`}
      role="contentinfo"
      aria-label={isTop ? `Classification: ${level}` : 'Application footer'}
    >
      {isTop && <span className="classification-banner-dot" aria-hidden />}
      {label}
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export function AppShell({ classification, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-iip-bg">
      {/* Fixed top classification banner */}
      <ClassificationBanner level={classification} position="top" />

      {/* Main content area — flex so children fill space between banners */}
      <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>

      {/* Fixed bottom classification banner */}
      <ClassificationBanner level={classification} position="bottom" />
    </div>
  )
}

export default AppShell
