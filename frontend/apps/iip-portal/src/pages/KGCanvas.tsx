import { Network } from 'lucide-react'

/** Knowledge Graph Canvas — Stitch: 118728a1a25f4b859c06f5e1caeac95e */
export default function KGCanvas() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <Network size={22} color="var(--color-secondary)" />
        <h1 className="text-headline-lg">Knowledge Graph Canvas</h1>
      </div>
      <div className="card" style={{ color: 'var(--color-on-surface-variant)' }}>
        Neo4j-powered link-analysis canvas for suspect networks and entity associations.
        Powered by kg-svc with Graph-RAG integration. Implementation in progress.
      </div>
    </div>
  )
}
