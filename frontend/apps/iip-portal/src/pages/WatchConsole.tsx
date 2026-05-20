import React from 'react'
import { Radio, AlertTriangle } from 'lucide-react'

/** Watch Officer Console — Stitch: 93bea73a90f74bb0b2f735f34c489f0a */
export default function WatchConsole() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Radio size={22} color="var(--color-secondary)" />
        <h1 className="text-headline-lg">Watch Officer Console</h1>
      </div>
      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        Real-time alert grid, incident timeline, and operational map
        — powered by alert-svc and operation-svc. Implementation in progress.
      </div>
    </div>
  )
}
