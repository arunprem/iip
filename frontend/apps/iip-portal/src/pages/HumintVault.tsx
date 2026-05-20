import React from 'react'
import { UserCheck } from 'lucide-react'

/** Source (HUMINT) Vault — Stitch: 1487fc76e70b4842b3ba9e7dd9d8add1 */
export default function HumintVault() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <UserCheck size={22} color="var(--color-tertiary)" />
        <h1 className="text-headline-lg">Source (HUMINT) Vault</h1>
      </div>
      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        Encrypted source registry, credential tracking, contact logs, and payout authorization
        — powered by source-svc. Requires CONFIDENTIAL clearance. Implementation in progress.
      </div>
    </div>
  )
}
