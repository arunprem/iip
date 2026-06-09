import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide } from 'd3-force';
import { Focus, Maximize2, Network, UserRound } from 'lucide-react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphEdge, GraphNode } from '../../api/knowledgeGraph';
import { fetchSuspectPhotoPreviewDataUrl } from '../../api/suspectFaces';
import { useThemeStore } from '../../stores/themeStore';
import { KgNodeIntelPanel } from './KgNodeIntelPanel';
import {
  drawLinkLabel,
  drawNetworkNode,
  formatRelationRole,
  getKgGraphTheme,
  nodeCollisionRadius,
  nodeFitExtent,
  spreadNodesInitially,
  type LinkKind,
} from './kgGraphCanvas';

const FIT_PADDING = 140;

interface AssociateNetworkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerId: string;
  /** `${linkKind}:${role}` keys — empty = show all relation types */
  activeRelationFilters?: string[];
  onOpenSuspectProfile?: (masterSuspectId: string) => void;
}

const DOUBLE_CLICK_MS = 420;

interface ForceNode {
  id: string;
  name: string;
  isCenter: boolean;
  nodeKind: string;
  gender?: string | null;
  photoId?: string | null;
  dossierDraftId?: string | null;
  storageKey?: string | null;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface ForceLink {
  id: string;
  source: string | ForceNode;
  target: string | ForceNode;
  role: string;
  linkKind: LinkKind;
}

function linkNodeId(endpoint: string | ForceNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function linkFilterKey(link: ForceLink): string {
  return `${link.linkKind}:${link.role}`;
}

export function AssociateNetworkGraph({
  nodes,
  edges,
  centerId,
  activeRelationFilters = [],
  onOpenSuspectProfile,
}: AssociateNetworkGraphProps) {
  const themeMode = useThemeStore((s) => s.theme);
  const graphTheme = useMemo(() => getKgGraphTheme(themeMode), [themeMode]);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<ForceNode, ForceLink>>();
  const [dimensions, setDimensions] = useState({ width: 900, height: 560 });
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [, bump] = useState(0);
  const loadedPhotoIds = useRef(new Set<string>());
  const lastNodeClick = useRef<{ id: string; time: number } | null>(null);
  const fittedGraphKey = useRef<string | null>(null);

  const [showAssociates, setShowAssociates] = useState(true);
  const [showRelatives, setShowRelatives] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusActive, setFocusActive] = useState(false);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const fullGraphData = useMemo(() => {
    const forceNodes: ForceNode[] = nodes.map((n) => ({
      id: n.id,
      name: n.criminal_name || n.label,
      isCenter: n.is_center || n.id === centerId,
      nodeKind: n.node_kind ?? (n.is_center ? 'center' : 'associate'),
      gender: n.gender,
      photoId: n.photo_id,
      dossierDraftId: n.dossier_draft_id,
      storageKey: n.storage_key,
    }));
    spreadNodesInitially(forceNodes);
    const forceLinks: ForceLink[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      role: e.role,
      linkKind: (e.link_kind ?? 'associate') as LinkKind,
    }));
    return { nodes: forceNodes, links: forceLinks };
  }, [nodes, edges, centerId]);

  const relationFilterSet = useMemo(
    () => new Set(activeRelationFilters),
    [activeRelationFilters]
  );

  const visibleGraphData = useMemo(() => {
    const layerOk = (n: ForceNode) => {
      if (n.isCenter) return true;
      if (n.nodeKind === 'relative') return showRelatives;
      return showAssociates;
    };

    let links = fullGraphData.links.filter((l) => {
      const src = linkNodeId(l.source);
      const tgt = linkNodeId(l.target);
      const srcNode = fullGraphData.nodes.find((n) => n.id === src);
      const tgtNode = fullGraphData.nodes.find((n) => n.id === tgt);
      if (!srcNode || !tgtNode) return false;
      return layerOk(srcNode) && layerOk(tgtNode);
    });

    if (relationFilterSet.size > 0) {
      links = links.filter((l) => relationFilterSet.has(linkFilterKey(l)));
    }

    const connectedIds = new Set<string>();
    for (const link of links) {
      connectedIds.add(linkNodeId(link.source));
      connectedIds.add(linkNodeId(link.target));
    }

    const nodesVisible = fullGraphData.nodes.filter((n) => {
      if (n.isCenter) return true;
      if (!connectedIds.has(n.id)) return false;
      return layerOk(n);
    });

    const visibleIds = new Set(nodesVisible.map((n) => n.id));
    links = links.filter(
      (l) => visibleIds.has(linkNodeId(l.source)) && visibleIds.has(linkNodeId(l.target))
    );

    return { nodes: nodesVisible, links };
  }, [fullGraphData, showAssociates, showRelatives, relationFilterSet]);

  const graphData = visibleGraphData;

  const highlightIds = useMemo(() => {
    if (!focusActive || !selectedNodeId) return null;
    const ids = new Set<string>([selectedNodeId]);
    for (const link of graphData.links) {
      const src = linkNodeId(link.source);
      const tgt = linkNodeId(link.target);
      if (src === selectedNodeId) ids.add(tgt);
      if (tgt === selectedNodeId) ids.add(src);
    }
    return ids;
  }, [focusActive, selectedNodeId, graphData.links]);

  const associateCount = graphData.nodes.filter((n) => n.nodeKind === 'associate').length;
  const relativeCount = graphData.nodes.filter((n) => n.nodeKind === 'relative').length;

  const graphKey = useMemo(
    () =>
      `${centerId}:${nodes.length}:${edges.length}:${showAssociates}:${showRelatives}:${activeRelationFilters.join('|')}`,
    [centerId, nodes.length, edges.length, showAssociates, showRelatives, activeRelationFilters]
  );

  const fitGraphToView = useCallback(
    (durationMs = 0) => {
      const fg = fgRef.current;
      if (!fg || graphData.nodes.length === 0) return;
      fg.centerAt(0, 0, 0);
      fg.zoomToFit(durationMs, FIT_PADDING);
    },
    [graphData.nodes.length]
  );

  const selectedGraphNode = selectedNodeId ? nodesById.get(selectedNodeId) ?? null : null;

  useEffect(() => {
    setImages({});
    loadedPhotoIds.current = new Set();
    fittedGraphKey.current = null;
    setSelectedNodeId(null);
    setFocusActive(false);
  }, [centerId]);

  useEffect(() => {
    if (selectedNodeId && !graphData.nodes.some((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setFocusActive(false);
    }
  }, [selectedNodeId, graphData.nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? { width: 900, height: 560 };
      setDimensions({ width: Math.max(320, width), height: Math.max(420, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;

    const linkForce = fg.d3Force('link');
    if (linkForce?.distance) {
      linkForce.distance((link: ForceLink) => {
        const src = (typeof link.source === 'object' ? link.source : null) as ForceNode | null;
        const tgt = (typeof link.target === 'object' ? link.target : null) as ForceNode | null;
        const r1 = nodeCollisionRadius(Boolean(src?.isCenter), src?.nodeKind);
        const r2 = nodeCollisionRadius(Boolean(tgt?.isCenter), tgt?.nodeKind);
        const extra = link.linkKind === 'relative' ? 24 : 48;
        return r1 + r2 + extra;
      });
      linkForce.strength?.(0.22);
    }

    const chargeForce = fg.d3Force('charge');
    if (chargeForce?.strength) {
      chargeForce.strength(-720);
    }

    fg.d3Force(
      'collision',
      forceCollide<ForceNode>()
        .radius((n) => nodeCollisionRadius(Boolean(n.isCenter), n.nodeKind))
        .strength(1)
        .iterations(4)
    );

    fittedGraphKey.current = null;
    fg.d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    const timer = window.setTimeout(() => fitGraphToView(200), 250);
    return () => window.clearTimeout(timer);
  }, [dimensions.width, dimensions.height, graphData.nodes.length, fitGraphToView]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (const node of fullGraphData.nodes) {
        if (node.nodeKind === 'relative') continue;
        if (!node.photoId || !node.dossierDraftId || !node.storageKey) continue;
        if (loadedPhotoIds.current.has(node.id)) continue;
        loadedPhotoIds.current.add(node.id);
        try {
          const dataUrl = await fetchSuspectPhotoPreviewDataUrl(
            node.dossierDraftId,
            node.photoId,
            node.storageKey
          );
          if (cancelled) return;
          const img = new Image();
          img.onload = () => {
            if (cancelled) return;
            setImages((prev) => ({ ...prev, [node.id]: img }));
            bump((n) => n + 1);
          };
          img.src = dataUrl;
        } catch {
          /* placeholder used */
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fullGraphData.nodes]);

  const handleNodeClick = useCallback(
    (node: ForceNode) => {
      const now = Date.now();
      const prev = lastNodeClick.current;
      const isDouble =
        prev?.id === node.id &&
        now - prev.time < DOUBLE_CLICK_MS &&
        node.nodeKind !== 'relative' &&
        !node.id.startsWith('relative:');

      if (isDouble) {
        lastNodeClick.current = null;
        onOpenSuspectProfile?.(node.id);
        return;
      }

      lastNodeClick.current = { id: node.id, time: now };
      setSelectedNodeId(node.id);
      setFocusActive(true);
    },
    [onOpenSuspectProfile]
  );

  const handleEngineStop = useCallback(() => {
    if (fittedGraphKey.current !== graphKey) {
      fitGraphToView(0);
      fittedGraphKey.current = graphKey;
    }
    const center = graphData.nodes.find((n) => n.isCenter);
    if (center) {
      center.fx = undefined;
      center.fy = undefined;
    }
    bump((n) => n + 1);
  }, [graphData.nodes, graphKey, fitGraphToView]);

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as ForceNode;
      const dimmed = highlightIds && !highlightIds.has(n.id);
      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.22;
      drawNetworkNode(ctx, n, globalScale, images[n.id] ?? null, graphTheme);
      ctx.restore();
      if (selectedNodeId === n.id) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const extent = nodeFitExtent(n.isCenter, n.nodeKind);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, extent + 6 / globalScale, 0, Math.PI * 2);
        ctx.strokeStyle = graphTheme.centerRing;
        ctx.lineWidth = 2.5 / globalScale;
        ctx.setLineDash([6 / globalScale, 4 / globalScale]);
        ctx.stroke();
        ctx.restore();
      }
    },
    [images, graphTheme, highlightIds, selectedNodeId]
  );

  const paintLink = useCallback(
    (link: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const l = link as ForceLink;
      const src = l.source as ForceNode;
      const tgt = l.target as ForceNode;
      if (src.x == null || tgt.x == null || src.y == null || tgt.y == null) return;
      const dimmed =
        highlightIds &&
        (!highlightIds.has(src.id) || !highlightIds.has(tgt.id));
      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.15;
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      drawLinkLabel(
        ctx,
        mx,
        my,
        formatRelationRole(l.role),
        globalScale,
        graphTheme,
        l.linkKind
      );
      ctx.restore();
    },
    [graphTheme, highlightIds]
  );

  if (graphData.nodes.length === 0) {
    return (
      <div className="kg-graph-empty">
        <p>No network links visible.</p>
        <p className="kg-graph-empty__hint">
          Enable associate or relative layers, or add links on the dossier Links step.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="kg-graph-viewport">
      <div className="kg-graph-toolbar">
        <button
          type="button"
          className={`kg-graph-tool-btn${showAssociates ? ' kg-graph-tool-btn--active' : ''}`}
          onClick={() => setShowAssociates((v) => !v)}
        >
          <Network size={14} />
          Associates
        </button>
        <button
          type="button"
          className={`kg-graph-tool-btn${showRelatives ? ' kg-graph-tool-btn--active' : ''}`}
          onClick={() => setShowRelatives((v) => !v)}
        >
          <UserRound size={14} />
          Relatives
        </button>
        <button
          type="button"
          className={`kg-graph-tool-btn${focusActive ? ' kg-graph-tool-btn--active' : ''}`}
          onClick={() => {
            if (focusActive) {
              setFocusActive(false);
              setSelectedNodeId(null);
            } else if (selectedNodeId) {
              setFocusActive(true);
            }
          }}
          disabled={!selectedNodeId}
        >
          <Focus size={14} />
          {focusActive ? 'Clear focus' : 'Focus'}
        </button>
        <button type="button" className="kg-graph-tool-btn" onClick={() => fitGraphToView(400)}>
          <Maximize2 size={14} />
          Fit view
        </button>
      </div>

      <div className="kg-graph-hud">
        <span className="kg-graph-hud__tag">LINK ANALYSIS</span>
        <span className="kg-graph-hud__stat">{graphData.nodes.length} visible</span>
        {associateCount > 0 && (
          <span className="kg-graph-hud__stat">{associateCount} associates</span>
        )}
        {relativeCount > 0 && (
          <span className="kg-graph-hud__stat kg-graph-hud__stat--muted">{relativeCount} relatives</span>
        )}
        <span className="kg-graph-hud__stat">{graphData.links.length} relations</span>
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor="transparent"
        nodeRelSize={1}
        nodeVal={(n) => {
          const fn = n as ForceNode;
          const extent = nodeFitExtent(fn.isCenter, fn.nodeKind);
          return extent * extent;
        }}
        minZoom={0.08}
        maxZoom={8}
        nodeLabel={(n) => {
          const fn = n as ForceNode;
          const lines = [fn.name];
          if (fn.gender) lines.push(fn.gender);
          lines.push(
            fn.isCenter ? 'Subject' : fn.nodeKind === 'relative' ? 'Family relative' : 'Associate'
          );
          return lines.join(' · ');
        }}
        linkLabel={(l) => formatRelationRole((l as ForceLink).role)}
        linkWidth={(l) => {
          const link = l as ForceLink;
          const hl =
            highlightIds &&
            highlightIds.has(linkNodeId(link.source)) &&
            highlightIds.has(linkNodeId(link.target));
          const base = link.linkKind === 'relative' ? 1.2 : 1.8;
          return hl ? base + 1.2 : base;
        }}
        linkColor={(l) => {
          const link = l as ForceLink;
          const hl =
            highlightIds &&
            highlightIds.has(linkNodeId(link.source)) &&
            highlightIds.has(linkNodeId(link.target));
          if (hl) {
            return link.linkKind === 'relative'
              ? 'rgba(148, 163, 184, 0.75)'
              : 'rgba(34, 211, 238, 0.85)';
          }
          return link.linkKind === 'relative'
            ? graphTheme.relativeLinkColor
            : graphTheme.linkColor;
        }}
        linkLineDash={(l) => ((l as ForceLink).linkKind === 'relative' ? [5, 5] : null)}
        linkDirectionalArrowLength={(l) => ((l as ForceLink).linkKind === 'relative' ? 5 : 7)}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l) =>
          (l as ForceLink).linkKind === 'relative'
            ? graphTheme.relativeLinkArrow
            : graphTheme.linkArrow
        }
        linkCurvature={0.12}
        warmupTicks={90}
        cooldownTicks={220}
        d3AlphaDecay={0.012}
        d3VelocityDecay={0.42}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={paintNode}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={paintLink}
        enableNodeDrag
        onNodeClick={(node) => handleNodeClick(node as ForceNode)}
        onBackgroundClick={() => {
          setSelectedNodeId(null);
          setFocusActive(false);
        }}
        showPointerCursor={(obj) => Boolean(obj)}
        onEngineStop={handleEngineStop}
      />

      {selectedGraphNode && (
        <KgNodeIntelPanel
          node={selectedGraphNode}
          edges={edges}
          nodesById={nodesById}
          onClose={() => {
            setSelectedNodeId(null);
            setFocusActive(false);
          }}
          onOpenProfile={onOpenSuspectProfile}
          onFocusConnections={() => setFocusActive(true)}
        />
      )}

      <div className="kg-graph-legend">
        <span><i className="kg-legend-dot kg-legend-dot--center" /> Subject</span>
        <span><i className="kg-legend-dot kg-legend-dot--link" /> Associate</span>
        <span><i className="kg-legend-dot kg-legend-dot--relative" /> Relative</span>
        <span>click → intel panel · double-click → dossier</span>
      </div>
    </div>
  );
}
