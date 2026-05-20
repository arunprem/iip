import React from 'react'
import { LayoutDashboard, TrendingUp, AlertTriangle, Users, FileText } from 'lucide-react'

/**
 * Director's Dashboard
 * Stitch Screen: 0acc42fcdd97405cb28ce478d728b535
 *
 * High-level operational summary for Intelligence Wing directors.
 * Displays active case counts, alert posture, resource utilization,
 * and real-time operational summaries powered by the analytics-svc.
 */
export default function DirectorDashboard() {
  const stats = [
    { label: 'Active Cases', value: '247', delta: '+12 today', color: 'var(--color-primary)' },
    { label: 'Open Alerts', value: '18', delta: '3 critical', color: 'var(--color-error)' },
    { label: 'Analysts On Shift', value: '34', delta: 'of 48 total', color: 'var(--color-secondary)' },
    { label: 'Reports Generated', value: '89', delta: 'this week', color: 'var(--color-tertiary)' },
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <LayoutDashboard size={22} color="var(--color-primary)" />
          <h1 className="text-headline-lg">Director's Dashboard</h1>
        </div>
        <p className="text-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Integrated operational posture — Intelligence Wing, Kerala Police
        </p>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-2)' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
              {stat.value}
            </div>
            <div className="text-body-sm" style={{ color: 'var(--color-outline)', marginTop: 'var(--space-1)' }}>
              {stat.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Activity placeholder */}
      <div className="card">
        <div className="text-title-sm" style={{ marginBottom: 'var(--space-4)' }}>
          Recent Intelligence Activity
        </div>
        <div style={{ color: 'var(--color-outline)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
          Real-time feed powered by analytics-svc · connecting...
        </div>
      </div>
    </div>
  )
}
