import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Radio,
  FolderOpen,
  Bot,
  Users,
  MapPin,
  Network,
  UserCheck,
  Shield,
  FileText,
} from 'lucide-react'
import type { UserContext } from './AppShell'

// ─── Navigation items mapped to Stitch screen designs ─────────────────────────

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: "Director's Dashboard",
    icon: LayoutDashboard,
    roles: ['SYSTEM_ADMIN', 'SUPERVISOR'],
    screenId: '0acc42fcdd97405cb28ce478d728b535',
  },
  {
    to: '/watch-console',
    label: 'Watch Officer Console',
    icon: Radio,
    roles: ['WATCH_OFFICER', 'SUPERVISOR', 'SYSTEM_ADMIN'],
    screenId: '93bea73a90f74bb0b2f735f34c489f0a',
  },
  {
    to: '/cases',
    label: 'Intelligence Cases',
    icon: FolderOpen,
    roles: ['ANALYST', 'SUPERVISOR', 'SYSTEM_ADMIN'],
    screenId: '8f76fdad4eca43d3a59506f3ca0dbabf',
  },
  {
    to: '/analyst-workbench',
    label: 'LLM Analyst Workbench',
    icon: Bot,
    roles: ['ANALYST', 'SUPERVISOR'],
    screenId: 'b12fdfdaa79448e59160663193b94909',
  },
  {
    to: '/hotspot-console',
    label: 'Hotspot & Risk Console',
    icon: MapPin,
    roles: ['ANALYST', 'SUPERVISOR', 'WATCH_OFFICER'],
    screenId: 'b163ccf115b44688bc59effa77e584b1',
  },
  {
    to: '/kg-canvas',
    label: 'Knowledge Graph',
    icon: Network,
    roles: ['ANALYST', 'SUPERVISOR'],
    screenId: '118728a1a25f4b859c06f5e1caeac95e',
  },
  {
    to: '/humint-vault',
    label: 'Source (HUMINT) Vault',
    icon: UserCheck,
    roles: ['ANALYST', 'SUPERVISOR'],
    screenId: '1487fc76e70b4842b3ba9e7dd9d8add1',
  },
  {
    to: '/iam-admin',
    label: 'IAM Admin Console',
    icon: Shield,
    roles: ['SYSTEM_ADMIN', 'IT_ADMIN'],
    screenId: 'c4cde9f717344ebca98a23bbc489b10b',
  },
]

// ─── Sidebar Component ────────────────────────────────────────────────────────

interface SidebarProps {
  user: UserContext
}

export function Sidebar({ user }: SidebarProps) {
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => user.role === r || user.role === 'SYSTEM_ADMIN'),
  )

  return (
    <nav
      className="sidebar"
      style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}
      aria-label="Primary navigation"
    >
      {/* Logo / Service Identity */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--color-outline-variant)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Shield size={20} color="var(--color-primary)" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-on-surface)' }}>
              IIP
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-outline)', fontFamily: 'var(--font-mono)' }}>
              INTELLIGENCE WING
            </div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, padding: '0 var(--space-2)' }}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={`Stitch screen: ${item.screenId}`}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* User panel at bottom */}
      <div
        style={{
          borderTop: '1px solid var(--color-outline-variant)',
          padding: 'var(--space-3) var(--space-4)',
          marginTop: 'var(--space-4)',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--color-on-surface)', fontWeight: 600 }}>
          {user.name}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--color-outline)',
            fontFamily: 'var(--font-mono)',
            marginTop: '2px',
          }}
        >
          {user.clearanceLevel}
        </div>
      </div>
    </nav>
  )
}
