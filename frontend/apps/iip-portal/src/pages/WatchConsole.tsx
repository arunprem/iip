import React from 'react'
import { Radio, AlertTriangle, Monitor, Map, TrendingUp } from 'lucide-react'

/** Watch Officer Console — Stitch: 93bea73a90f74bb0b2f735f34c489f0a */
export default function WatchConsole() {
  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <Radio size={24} color="var(--color-secondary)" />
        <div>
          <h1 className="text-headline-lg" style={{ fontSize: '28px', fontWeight: 600 }}>
            Watch Officer Console
          </h1>
          <p className="text-body-sm" style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
            Real-time operational oversight
          </p>
        </div>
      </div>

      {/* Stats overview */}
      <div style={{ 
        display: 'grid', 
        gap: 'var(--space-5)', 
        marginBottom: 'var(--space-8)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
      }}>
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <Monitor size={18} color="var(--color-primary)" />
            <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Active Alerts</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-primary)' }}>
            12
          </div>
          <div className="text-body-sm" style={{ color: 'var(--color-outline)', marginTop: 'var(--space-1)' }}>
            3 critical, 5 high, 4 medium
          </div>
        </div>
        
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <Map size={18} color="var(--color-secondary)" />
            <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Incidents Today</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-secondary)' }}>
            87
          </div>
          <div className="text-body-sm" style={{ color: 'var(--color-outline)', marginTop: 'var(--space-1)' }}>
            +12% vs yesterday
          </div>
        </div>
        
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <TrendingUp size={18} color="var(--color-success)" />
            <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Response Time</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-success)' }}>
            4.2m
          </div>
          <div className="text-body-sm" style={{ color: 'var(--color-outline)', marginTop: 'var(--space-1)' }}>
            avg. acknowledgment
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ 
        display: 'grid', 
        gap: 'var(--space-6)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
      }}>
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div className="text-title-sm" style={{ marginBottom: 'var(--space-4)' }}>
            Active Incidents
          </div>
          <div style={{ 
            color: 'var(--color-on-surface-variant)', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '13px',
            lineHeight: '1.8'
          }}>
            • Case #IP-2026-0842: Suspicious activity reported<br />
            • Case #IP-2026-0841: Digital footprint analysis<br />
            • Case #IP-2026-0840: Source validation pending<br />
            • Case #IP-2026-0839: Cross-jurisdictional tracking
          </div>
        </div>
        
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div className="text-title-sm" style={{ marginBottom: 'var(--space-4)' }}>
            Resource Status
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Field Units</span>
              <span style={{ color: 'var(--color-success)' }}>12/15 Active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Analyst Teams</span>
              <span style={{ color: 'var(--color-success)' }}>8/10 Online</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-label-caps" style={{ color: 'var(--color-on-surface-variant)' }}>Intake Queue</span>
              <span style={{ color: 'var(--color-warning)' }}>23 Pending</span>
            </div>
          </div>
        </div>
        
        <div className="card" style={{ 
          border: '1px solid var(--color-outline-variant)', 
          backgroundColor: 'var(--color-surface-low)',
          padding: 'var(--space-6)'
        }}>
          <div className="text-title-sm" style={{ marginBottom: 'var(--space-4)' }}>
            Threat Landscape
          </div>
          <div style={{ 
            height: '120px',
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--color-outline)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px'
            }}>
              Threat map visualization (placeholder)
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
