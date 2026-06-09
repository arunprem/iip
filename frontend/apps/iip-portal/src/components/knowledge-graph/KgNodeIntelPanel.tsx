import { ExternalLink, Focus, Users, X } from 'lucide-react';
import type { GraphEdge, GraphNode } from '../../api/knowledgeGraph';
import { formatRelationRole } from './kgGraphCanvas';
import { SuspectDossierPhotoThumb } from '../suspects/SuspectDossierPhotoThumb';

interface KgNodeIntelPanelProps {
  node: GraphNode;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  onClose: () => void;
  onOpenProfile?: (masterSuspectId: string) => void;
  onFocusConnections: () => void;
}

function nodeTitle(node: GraphNode): string {
  return node.criminal_name || node.label;
}

function kindLabel(node: GraphNode): string {
  if (node.is_center || node.node_kind === 'center') return 'Subject';
  if (node.node_kind === 'relative') return 'Family relative';
  return 'Operational associate';
}

export function KgNodeIntelPanel({
  node,
  edges,
  nodesById,
  onClose,
  onOpenProfile,
  onFocusConnections,
}: KgNodeIntelPanelProps) {
  const isProfile = node.node_kind !== 'relative' && !node.id.startsWith('relative:');

  const connections = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = nodesById.get(otherId);
      const direction = e.source === node.id ? 'outgoing' : 'incoming';
      return {
        id: e.id,
        role: e.role,
        linkKind: e.link_kind ?? 'associate',
        otherName: other ? nodeTitle(other) : otherId,
        direction,
      };
    });

  return (
    <aside className="kg-intel-panel" aria-label="Entity intelligence">
      <div className="kg-intel-panel__header">
        <span className="kg-intel-panel__kind">{kindLabel(node)}</span>
        <button type="button" className="kg-intel-panel__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="kg-intel-panel__body">
        {isProfile ? (
          <SuspectDossierPhotoThumb
            dossierDraftId={node.dossier_draft_id}
            photoId={node.photo_id}
            storageKey={node.storage_key}
            alt={nodeTitle(node)}
            size="mugshot"
            className="kg-intel-panel__photo"
          />
        ) : (
          <div className="kg-intel-panel__photo-placeholder">
            <Users size={32} className="text-iip-text-muted/50" />
          </div>
        )}
        <h3 className="kg-intel-panel__name">{nodeTitle(node)}</h3>
        <dl className="kg-intel-panel__meta">
          {node.gender && (
            <>
              <dt>Gender</dt>
              <dd>{node.gender}</dd>
            </>
          )}
          <dt>Network links</dt>
          <dd>{connections.length}</dd>
        </dl>
        {connections.length > 0 && (
          <div className="kg-intel-panel__links">
            <p className="kg-intel-panel__links-title">Direct connections</p>
            <ul>
              {connections.map((c) => (
                <li key={c.id}>
                  <span className="kg-intel-panel__link-role">{formatRelationRole(c.role)}</span>
                  <span className="kg-intel-panel__link-arrow">
                    {c.direction === 'outgoing' ? '→' : '←'}
                  </span>
                  <span className="kg-intel-panel__link-name">{c.otherName}</span>
                  {c.linkKind === 'relative' && (
                    <span className="kg-intel-panel__link-tag">family</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="kg-intel-panel__actions">
        <button type="button" className="kg-graph-tool-btn" onClick={onFocusConnections}>
          <Focus size={14} />
          Highlight links
        </button>
        {isProfile && onOpenProfile && (
          <button
            type="button"
            className="kg-graph-tool-btn kg-graph-tool-btn--primary"
            onClick={() => onOpenProfile(node.id)}
          >
            <ExternalLink size={14} />
            Open dossier
          </button>
        )}
      </div>
    </aside>
  );
}
