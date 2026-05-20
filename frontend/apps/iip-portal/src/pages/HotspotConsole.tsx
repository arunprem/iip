import React from 'react'
import { MapPin } from 'lucide-react'

/** Hotspot & Risk Console — Stitch: b163ccf115b44688bc59effa77e584b1 */
export default function HotspotConsole() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <MapPin size={22} color="var(--color-tertiary)" />
        <h1 className="text-headline-lg">Hotspot & Risk Console</h1>
      </div>
      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        Spatio-temporal crime prediction map, hotspot overlays, and risk scoring
        — powered by analytics-svc and search-svc. Implementation in progress.
      </div>
    </div>
  )
}
