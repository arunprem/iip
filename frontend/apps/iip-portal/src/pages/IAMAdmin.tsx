import React from 'react'
import { Shield, Users, Lock } from 'lucide-react'

/**
 * IAM Admin Console
 * Stitch Screen: c4cde9f717344ebca98a23bbc489b10b
 *
 * User management, role assignments, clearance management,
 * and JIT elevation approval queue.
 */
export default function IAMAdmin() {
  const tabs = ['Users', 'Roles & Privileges', 'JIT Approvals', 'Audit Trail']
  const [activeTab, setActiveTab] = React.useState('Users')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Shield size={22} color="var(--color-primary)" />
        <div>
          <h1 className="text-headline-lg">IAM Admin Console</h1>
          <p className="text-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Identity, access management, and JIT elevation — requires SYSTEM_ADMIN role
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--color-outline-variant)', marginBottom: 'var(--space-6)' }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--color-primary-container)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              transition: 'all var(--transition-hover)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        <div className="text-label-mono" style={{ marginBottom: 'var(--space-2)', color: 'var(--color-secondary)' }}>
          MODULE: {activeTab.toUpperCase()}
        </div>
        Backed by iam-svc API endpoints. Full CRUD UI for users, roles, clearance boundaries,
        JIT approval workflows, and immutable audit trail viewer. Implementation in progress.
      </div>
    </div>
  )
}
