import React, { type ReactNode } from 'react'
import { Shield, ShieldAlert } from 'lucide-react'

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
  const cls = level.toLowerCase().replace(' ', '-')
  const label =
    position === 'top'
      ? `${level} — NEED TO KNOW ACCESS ONLY`
      : `${level} — SECURE AREA — AUDIT ACTIVE`

  return (
    <div
      className={`classification-banner classification-banner--${cls}`}
      style={{ top: position === 'top' ? 0 : 'auto', bottom: position === 'bottom' ? 0 : 'auto' }}
      role="banner"
      aria-label={`Classification: ${level}`}
    >
      {label}
    </div>
  )
}

// ─── Status Strip ─────────────────────────────────────────────────────────────

function StatusStrip({
  user,
  systemStatus = 'ONLINE',
}: {
  user: UserContext
  systemStatus?: 'ONLINE' | 'DEGRADED' | 'OFFLINE'
}) {
  const statusColor =
    systemStatus === 'ONLINE' ? 'var(--color-success)' :
    systemStatus === 'DEGRADED' ? 'var(--color-warning)' :
    'var(--color-error)'

  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return (
    <div className="status-strip">
      {/* Left — system health */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className={`status-dot status-dot--${systemStatus.toLowerCase()}`} />
        <span style={{ color: statusColor, fontWeight: 600, fontSize: '13px' }}>
          {systemStatus}
        </span>
        <span
          style={{
            color: 'var(--color-outline)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          IIP NODE-01 · KERALAPOLICE.GOV.IN
        </span>
      </div>

      {/* Right — user identity + JIT status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-secondary)',
          }}
        >
          {user.username.toUpperCase()} · {user.role}
        </span>

        {user.jitElevated && (
          <span className="badge badge-jit" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldAlert size={10} />
            JIT ELEVATED
          </span>
        )}

        <span style={{ color: 'var(--color-outline)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          {now}
        </span>
      </div>
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export function AppShell({ classification, user, children, systemStatus }: AppShellProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      {/* Fixed top classification banner */}
      <ClassificationBanner level={classification} position="top" />

      {/* System status strip */}
      <StatusStrip user={user} systemStatus={systemStatus} />

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>

      {/* Fixed bottom classification banner */}
      <ClassificationBanner level={classification} position="bottom" />
    </div>
  )
}

export default AppShell
