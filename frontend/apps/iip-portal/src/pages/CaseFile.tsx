import { FolderOpen } from 'lucide-react'
import { useParams } from 'react-router-dom'

/** Intelligence Case File — Stitch: 8f76fdad4eca43d3a59506f3ca0dbabf */
export default function CaseFile() {
  const { id } = useParams()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <FolderOpen size={22} color="var(--color-primary)" />
        <h1 className="text-headline-lg">{id ? `Case File: ${id}` : 'Intelligence Cases'}</h1>
      </div>
      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        Case dossier viewer, evidence links, suspect identity graph, and audit trail
        — powered by case-svc and evidence-svc. Implementation in progress.
      </div>
    </div>
  )
}
