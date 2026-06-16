import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide } from 'd3-force';
import { Focus, Maximize2, Network, UserRound, Sparkles, Brain, X, Send, GitPullRequest, Loader2, Compass } from 'lucide-react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { GraphEdge, GraphNode } from '../../api/knowledgeGraph';
import {
  assistantAnalyzeNetwork,
  assistantExplainPath,
  assistantFilterGraph,
  assistantSuggestMissingLinks,
  type AssistantLanguage,
  type GraphNodeInfo,
  type GraphEdgeInfo,
} from '../../api/assistant';
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
import { relationFilterKey } from './kgGraphStats';
import { resolveLinkVisuals, withAlpha as withRelationAlpha } from './kgRelationColors';

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
  crimeNumber?: string | null;
  psName?: string | null;
}

function linkNodeId(endpoint: string | ForceNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function linkFilterKey(link: ForceLink): string {
  const role = (link.role || 'UNKNOWN').trim();
  return relationFilterKey(link.linkKind, role);
}

function findShortestPath(
  nodes: ForceNode[],
  links: ForceLink[],
  startId: string,
  endId: string
): any[] | null {
  if (startId === endId) {
    const nObj = nodes.find(n => n.id === startId);
    return [{ id: startId, label: nObj?.name || startId }];
  }

  const queue: string[][] = [[startId]];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const currentId = path[path.length - 1];

    if (currentId === endId) {
      const fullPath: any[] = [];
      for (let i = 0; i < path.length; i++) {
        const nodeObj = nodes.find(n => n.id === path[i]);
        fullPath.push({
          id: path[i],
          label: nodeObj?.name || path[i],
        });

        if (i < path.length - 1) {
          const nextId = path[i + 1];
          const link = links.find(
            l =>
              (linkNodeId(l.source) === path[i] && linkNodeId(l.target) === nextId) ||
              (linkNodeId(l.source) === nextId && linkNodeId(l.target) === path[i])
          );
          fullPath.push({
            role: link?.role || 'ASSOCIATE',
          });
        }
      }
      return fullPath;
    }

    const neighbors: string[] = [];
    for (const link of links) {
      const s = linkNodeId(link.source);
      const t = linkNodeId(link.target);
      if (s === currentId && !visited.has(t)) {
        neighbors.push(t);
        visited.add(t);
      } else if (t === currentId && !visited.has(s)) {
        neighbors.push(s);
        visited.add(s);
      }
    }

    for (const n of neighbors) {
      queue.push([...path, n]);
    }
  }

  return null;
}

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string | null) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const content = line.trim();
    if (content.startsWith('###')) {
      const headerText = content.replace(/^###\s*/, '');
      return <h4 key={idx} className="text-xs font-bold text-cyan-500 dark:text-cyan-400 mt-3 mb-1 uppercase tracking-wider">{headerText}</h4>;
    }
    if (content.startsWith('##')) {
      const headerText = content.replace(/^##\s*/, '');
      return <h3 key={idx} className="text-sm font-bold text-cyan-400 dark:text-cyan-300 mt-4 mb-2 uppercase tracking-wide">{headerText}</h3>;
    }
    if (content.startsWith('-') || content.startsWith('*') || content.startsWith('•')) {
      const bulletText = content.replace(/^[-*•]\s*/, '');
      return (
        <li key={idx} className="list-disc list-inside text-xs text-iip-text-muted ml-2 my-1 leading-relaxed">
          {parseInlineMarkdown(bulletText)}
        </li>
      );
    }
    if (content === '') {
      return <div key={idx} className="h-2" />;
    }
    return <p key={idx} className="text-xs text-iip-text-muted leading-relaxed mb-1.5">{parseInlineMarkdown(content)}</p>;
  });
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

  // AI Graph Analyst States
  const [showAiAnalyst, setShowAiAnalyst] = useState(false);
  const [conversationalFilterIds, setConversationalFilterIds] = useState<Set<string> | null>(null);
  const [pathHighlightNodeIds, setPathHighlightNodeIds] = useState<Set<string> | null>(null);
  const [pathHighlightLinkIds, setPathHighlightLinkIds] = useState<Set<string> | null>(null);

  // AI Analyst Specific UI States
  const [aiActiveTab, setAiActiveTab] = useState<'briefing' | 'path' | 'gaps'>('briefing');
  const [aiLanguage, setAiLanguage] = useState<AssistantLanguage>('english');
  
  // Tab 1: Briefing & Q&A
  const [briefingReport, setBriefingReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  
  const [filterQuery, setFilterQuery] = useState('');
  const [filteringGraph, setFilteringGraph] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  // Tab 2: Connection Explainer
  const [explainTargetId, setExplainTargetId] = useState('');
  const [pathExplanation, setPathExplanation] = useState<string | null>(null);
  const [explainingPath, setExplainingPath] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Tab 3: Syndicate Gaps
  const [gapsRecommendations, setGapsRecommendations] = useState<string[] | null>(null);
  const [analyzingGaps, setAnalyzingGaps] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const apiNodes = useMemo<GraphNodeInfo[]>(() => {
    return nodes.map((n) => ({
      id: n.id,
      label: n.label,
      node_kind: n.node_kind || 'associate',
      criminal_name: n.criminal_name,
    }));
  }, [nodes]);

  const apiEdges = useMemo<GraphEdgeInfo[]>(() => {
    return edges.map((e) => ({
      source: e.source,
      target: e.target,
      role: e.role,
    }));
  }, [edges]);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setReportError(null);
    try {
      const res = await assistantAnalyzeNetwork(apiNodes, apiEdges, aiLanguage);
      setBriefingReport(res);
    } catch (err: any) {
      console.error(err);
      setReportError(err?.response?.data?.detail || err.message || 'Failed to generate network analysis report.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleApplyConversationalFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterQuery.trim()) return;
    setFilteringGraph(true);
    setFilterError(null);
    try {
      const matchedIds = await assistantFilterGraph(filterQuery, apiNodes, apiEdges, aiLanguage);
      if (matchedIds && matchedIds.length > 0) {
        setConversationalFilterIds(new Set(matchedIds));
      } else {
        setConversationalFilterIds(new Set());
        setFilterError('No suspects matched your search query.');
      }
    } catch (err: any) {
      console.error(err);
      setFilterError(err?.response?.data?.detail || err.message || 'Failed to apply filter query.');
    } finally {
      setFilteringGraph(false);
    }
  };

  const handleClearConversationalFilter = () => {
    setConversationalFilterIds(null);
    setFilterQuery('');
    setFilterError(null);
  };

  const handleExplainPath = async () => {
    if (!selectedNodeId || !explainTargetId) return;
    setExplainingPath(true);
    setExplainError(null);
    setPathExplanation(null);
    setPathHighlightNodeIds(null);
    setPathHighlightLinkIds(null);
    try {
      const nodesList = graphData.nodes;
      const linksList = graphData.links;
      
      const fullPath = findShortestPath(nodesList, linksList, selectedNodeId, explainTargetId);
      
      if (!fullPath || fullPath.length === 0) {
        setExplainError('No connection path was found between these suspects in the current network.');
        return;
      }
      
      const pathNodeIds = new Set<string>();
      const pathLinkIds = new Set<string>();
      
      for (let i = 0; i < fullPath.length; i++) {
        const step = fullPath[i];
        if (step.id) {
          pathNodeIds.add(step.id);
        }
        if (i < fullPath.length - 1) {
          const nextNodeId = fullPath[i+2]?.id;
          if (nextNodeId) {
            const link = linksList.find(
              l =>
                (linkNodeId(l.source) === step.id && linkNodeId(l.target) === nextNodeId) ||
                (linkNodeId(l.source) === nextNodeId && linkNodeId(l.target) === step.id)
            );
            if (link) pathLinkIds.add(link.id);
          }
        }
      }
      
      setPathHighlightNodeIds(pathNodeIds);
      setPathHighlightLinkIds(pathLinkIds);
      
      const textExplanation = await assistantExplainPath(fullPath, aiLanguage);
      setPathExplanation(textExplanation);
    } catch (err: any) {
      console.error(err);
      setExplainError(err?.response?.data?.detail || err.message || 'Failed to analyze path connection.');
    } finally {
      setExplainingPath(false);
    }
  };

  const handleAnalyzeGaps = async () => {
    setAnalyzingGaps(true);
    setGapsError(null);
    try {
      const res = await assistantSuggestMissingLinks(apiNodes, apiEdges, aiLanguage);
      setGapsRecommendations(res);
    } catch (err: any) {
      console.error(err);
      setGapsError(err?.response?.data?.detail || err.message || 'Failed to identify syndicate gaps.');
    } finally {
      setAnalyzingGaps(false);
    }
  };

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
      crimeNumber: e.crime_number,
      psName: e.ps_name,
    }));
    return { nodes: forceNodes, links: forceLinks };
  }, [nodes, edges, centerId]);

  const relationFilterSet = useMemo(
    () => new Set(activeRelationFilters),
    [activeRelationFilters]
  );

  const linkAlphasRef = useRef<Record<string, number>>({});
  const nodeAlphasRef = useRef<Record<string, number>>({});
  const layoutLockedRef = useRef(false);

  const conversationalFilterActive = conversationalFilterIds !== null;
  const filtersActive = relationFilterSet.size > 0 || conversationalFilterActive;

  const nodePassesConversationalFilter = useCallback(
    (nodeId: string) => {
      if (!conversationalFilterIds) return true;
      const node = fullGraphData.nodes.find((n) => n.id === nodeId);
      if (node?.isCenter) return true;
      return conversationalFilterIds.has(nodeId);
    },
    [conversationalFilterIds, fullGraphData.nodes]
  );

  const linkPassesConversationalFilter = useCallback(
    (link: ForceLink) => {
      const src = linkNodeId(link.source);
      const tgt = linkNodeId(link.target);
      return nodePassesConversationalFilter(src) && nodePassesConversationalFilter(tgt);
    },
    [nodePassesConversationalFilter]
  );

  /** Layer-only layout — relation filters toggle link visibility without moving nodes. */
  const layoutGraphData = useMemo(() => {
    const layerOk = (n: ForceNode) => {
      if (n.isCenter) return true;
      if (n.nodeKind === 'relative') return showRelatives;
      return showAssociates;
    };

    const nodes = fullGraphData.nodes.filter((n) => n.isCenter || layerOk(n));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = fullGraphData.links.filter((l) => {
      const src = linkNodeId(l.source);
      const tgt = linkNodeId(l.target);
      return nodeIds.has(src) && nodeIds.has(tgt);
    });

    return { nodes, links };
  }, [fullGraphData, showAssociates, showRelatives]);

  const graphData = layoutGraphData;

  const linkPassesRelationFilter = useCallback(
    (link: ForceLink) =>
      relationFilterSet.size === 0 || relationFilterSet.has(linkFilterKey(link)),
    [relationFilterSet]
  );

  const getLinkAlpha = useCallback((link: ForceLink) => {
    const stored = linkAlphasRef.current[link.id];
    if (stored !== undefined) return stored;
    return 1;
  }, []);

  const getLinkVisuals = useCallback(
    (link: ForceLink) => {
      const alpha = getLinkAlpha(link);
      return resolveLinkVisuals({
        role: link.role,
        linkKind: link.linkKind,
        theme: graphTheme,
        filtersActive,
        passesFilter: linkPassesRelationFilter(link),
        alpha,
      });
    },
    [getLinkAlpha, graphTheme, filtersActive, linkPassesRelationFilter]
  );

  const getNodeAlpha = useCallback(
    (node: ForceNode) => {
      if (!filtersActive || node.isCenter) return 1;
      const stored = nodeAlphasRef.current[node.id];
      if (stored !== undefined) return stored;
      return 1;
    },
    [filtersActive]
  );

  const visibleLinkCount = useMemo(
    () => layoutGraphData.links.filter((l) => linkPassesRelationFilter(l)).length,
    [layoutGraphData.links, linkPassesRelationFilter]
  );

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
    () => `${centerId}:${nodes.length}:${edges.length}:${showAssociates}:${showRelatives}`,
    [centerId, nodes.length, edges.length, showAssociates, showRelatives]
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

  const fitFilteredGraphToView = useCallback(
    (durationMs = 400) => {
      const fg = fgRef.current;
      if (!fg || layoutGraphData.nodes.length === 0) return;

      if (!filtersActive) {
        fitGraphToView(durationMs);
        return;
      }

      fg.zoomToFit(durationMs, 72, (node) => {
        const n = node as ForceNode;
        if (n.isCenter) return true;
        return layoutGraphData.links.some((link) => {
          if (!linkPassesRelationFilter(link)) return false;
          const src = linkNodeId(link.source);
          const tgt = linkNodeId(link.target);
          return src === n.id || tgt === n.id;
        });
      });
    },
    [
      layoutGraphData.links,
      layoutGraphData.nodes,
      filtersActive,
      linkPassesRelationFilter,
      fitGraphToView,
    ]
  );

  const filterFitKey = activeRelationFilters.join('|');

  const selectedGraphNode = selectedNodeId ? nodesById.get(selectedNodeId) ?? null : null;

  useEffect(() => {
    setImages({});
    loadedPhotoIds.current = new Set();
    fittedGraphKey.current = null;
    layoutLockedRef.current = false;
    linkAlphasRef.current = {};
    nodeAlphasRef.current = {};
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

    if (!layoutLockedRef.current) {
      fittedGraphKey.current = null;
      fg.d3ReheatSimulation();
    }
  }, [graphData]);

  useEffect(() => {
    for (const link of layoutGraphData.links) {
      if (linkAlphasRef.current[link.id] === undefined) {
        linkAlphasRef.current[link.id] = 1;
      }
    }
    for (const node of layoutGraphData.nodes) {
      if (nodeAlphasRef.current[node.id] === undefined) {
        nodeAlphasRef.current[node.id] = 1;
      }
    }
  }, [layoutGraphData.links, layoutGraphData.nodes]);

  const pathHighlightActive = pathHighlightNodeIds !== null;

  useEffect(() => {
    if (layoutGraphData.links.length === 0) return;
    let frame = 0;
    const step = () => {
      let moving = false;
      for (const link of layoutGraphData.links) {
        const relationOk = linkPassesRelationFilter(link);
        let target = 0;
        if (relationOk) {
          if (pathHighlightActive && pathHighlightLinkIds) {
            target = pathHighlightLinkIds.has(link.id) ? 1 : 0.08;
          } else if (conversationalFilterActive) {
            target = linkPassesConversationalFilter(link) ? 1 : 0.08;
          } else {
            target = 1;
          }
        }
        
        const current = linkAlphasRef.current[link.id] ?? 1;
        if (Math.abs(current - target) < 0.02) {
          linkAlphasRef.current[link.id] = target;
          continue;
        }
        linkAlphasRef.current[link.id] = current + (target - current) * 0.18;
        moving = true;
      }

      for (const node of layoutGraphData.nodes) {
        let target = 1;
        if (node.isCenter) {
          target = 1;
        } else if (pathHighlightActive && pathHighlightNodeIds) {
          target = pathHighlightNodeIds.has(node.id) ? 1 : 0.15;
        } else if (conversationalFilterActive) {
          target = nodePassesConversationalFilter(node.id) ? 1 : 0.15;
        } else if (relationFilterSet.size > 0) {
          const connected = layoutGraphData.links.some((link) => {
            const src = linkNodeId(link.source);
            const tgt = linkNodeId(link.target);
            if (src !== node.id && tgt !== node.id) return false;
            return (linkAlphasRef.current[link.id] ?? 1) > 0.25;
          });
          target = connected ? 1 : 0.16;
        }

        const current = nodeAlphasRef.current[node.id] ?? 1;
        if (Math.abs(current - target) < 0.02) {
          nodeAlphasRef.current[node.id] = target;
          continue;
        }
        nodeAlphasRef.current[node.id] = current + (target - current) * 0.18;
        moving = true;
      }

      (fgRef.current as ForceGraphMethods<ForceNode, ForceLink> & { refresh?: () => void })?.refresh?.();
      bump((n) => n + 1);
      if (moving) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [
    layoutGraphData.links,
    layoutGraphData.nodes,
    linkPassesRelationFilter,
    relationFilterSet.size,
    pathHighlightActive,
    pathHighlightNodeIds,
    pathHighlightLinkIds,
    conversationalFilterActive,
    nodePassesConversationalFilter,
    linkPassesConversationalFilter,
  ]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || layoutGraphData.nodes.length === 0) return;
    const timer = window.setTimeout(() => fitFilteredGraphToView(450), 460);
    return () => window.clearTimeout(timer);
  }, [filterFitKey, layoutGraphData.nodes.length, fitFilteredGraphToView]);

  useEffect(() => {
    if (graphData.nodes.length === 0 || layoutLockedRef.current) return;
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
    if (!layoutLockedRef.current) {
      for (const node of graphData.nodes) {
        if (node.x != null && node.y != null) {
          node.fx = node.x;
          node.fy = node.y;
        }
      }
      layoutLockedRef.current = true;
      if (fittedGraphKey.current !== graphKey) {
        fitGraphToView(0);
        fittedGraphKey.current = graphKey;
      }
    }
    const center = graphData.nodes.find((n) => n.isCenter);
    if (center) {
      center.fx = center.x;
      center.fy = center.y;
    }
    bump((n) => n + 1);
  }, [graphData.nodes, graphKey, fitGraphToView]);

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as ForceNode;
      const focusDimmed = highlightIds && !highlightIds.has(n.id);
      const filterAlpha = getNodeAlpha(n);
      ctx.save();
      ctx.globalAlpha = filterAlpha * (focusDimmed ? 0.22 : 1);
      drawNetworkNode(ctx, n, globalScale, images[n.id] ?? null, graphTheme);
      ctx.restore();

      const inHighlightedPath = pathHighlightNodeIds?.has(n.id);
      if (inHighlightedPath) {
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const extent = nodeFitExtent(n.isCenter, n.nodeKind);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, extent + 4 / globalScale, 0, Math.PI * 2);
        ctx.strokeStyle = '#22d3ee'; // cyan-400
        ctx.lineWidth = 3 / globalScale;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10 / globalScale;
        ctx.stroke();
        ctx.restore();
      }

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
    [images, graphTheme, highlightIds, selectedNodeId, getNodeAlpha, pathHighlightNodeIds]
  );

  const paintLink = useCallback(
    (link: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const l = link as ForceLink;
      const alpha = getLinkAlpha(l);
      if (alpha < 0.03) return;
      const src = l.source as ForceNode;
      const tgt = l.target as ForceNode;
      if (src.x == null || tgt.x == null || src.y == null || tgt.y == null) return;
      const focusDimmed =
        highlightIds &&
        (!highlightIds.has(src.id) || !highlightIds.has(tgt.id));
      const inHighlightedPath = pathHighlightLinkIds?.has(l.id);
      const visuals = { ...getLinkVisuals(l) };
      if (inHighlightedPath) {
        visuals.line = '#22d3ee';
        visuals.arrow = '#22d3ee';
        visuals.glow = '#22d3ee';
      }
      const boosted = (filtersActive || inHighlightedPath) && alpha > 0.65;
      ctx.save();
      ctx.globalAlpha = alpha * (focusDimmed ? 0.15 : 1);
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      if (boosted) {
        ctx.shadowColor = visuals.glow;
        ctx.shadowBlur = 14 / globalScale;
      }
      let labelText = formatRelationRole(l.role);
      if (l.role === 'CO_ACCUSED' && l.crimeNumber && l.psName) {
        labelText = `Co-Accused (FIR ${l.crimeNumber} - ${l.psName})`;
      } else if (l.role === 'CO_ACCUSED' && l.crimeNumber) {
        labelText = `Co-Accused (FIR ${l.crimeNumber})`;
      }
      drawLinkLabel(
        ctx,
        mx,
        my,
        labelText,
        globalScale,
        graphTheme,
        l.linkKind,
        (filtersActive || inHighlightedPath) && linkPassesRelationFilter(l)
          ? {
              labelBg: visuals.labelBg,
              labelBorder: visuals.labelBorder,
              labelText: visuals.label,
            }
          : undefined
      );
      ctx.restore();
    },
    [graphTheme, highlightIds, getLinkAlpha, getLinkVisuals, filtersActive, linkPassesRelationFilter, pathHighlightLinkIds]
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
        <button type="button" className="kg-graph-tool-btn" onClick={() => fitFilteredGraphToView(400)}>
          <Maximize2 size={14} />
          Fit view
        </button>
        <button
          type="button"
          className={`kg-graph-tool-btn${showAiAnalyst ? ' kg-graph-tool-btn--active bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : ''}`}
          onClick={() => setShowAiAnalyst((v) => !v)}
        >
          <Sparkles size={14} className={showAiAnalyst ? 'animate-pulse text-cyan-400' : ''} />
          AI Analyst
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
        <span className="kg-graph-hud__stat">{visibleLinkCount} relations</span>
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
        linkVisibility={(l) => getLinkAlpha(l as ForceLink) > 0.03}
        linkLabel={(l) => {
          const fl = l as ForceLink;
          if (getLinkAlpha(fl) > 0.35) {
            if (fl.role === 'CO_ACCUSED' && fl.crimeNumber && fl.psName) {
              return `Co-Accused (FIR ${fl.crimeNumber} - ${fl.psName})`;
            }
            if (fl.role === 'CO_ACCUSED' && fl.crimeNumber) {
              return `Co-Accused (FIR ${fl.crimeNumber})`;
            }
            return formatRelationRole(fl.role);
          }
          return '';
        }}
        linkWidth={(l) => {
          const link = l as ForceLink;
          const alpha = getLinkAlpha(link);
          const hl =
            highlightIds &&
            highlightIds.has(linkNodeId(link.source)) &&
            highlightIds.has(linkNodeId(link.target));
          const boosted = filtersActive && alpha > 0.65;
          const base = link.linkKind === 'relative' ? 1.4 : 2.4;
          return (hl ? base + 1.4 : base) * alpha * (boosted ? 1.5 : 1);
        }}
        linkColor={(l) => {
          const link = l as ForceLink;
          const alpha = getLinkAlpha(link);
          const visuals = getLinkVisuals(link);
          const hl =
            highlightIds &&
            highlightIds.has(linkNodeId(link.source)) &&
            highlightIds.has(linkNodeId(link.target));
          if (hl && !filtersActive) {
            return link.linkKind === 'relative'
              ? `rgba(148, 163, 184, ${0.75 * alpha})`
              : `rgba(34, 211, 238, ${0.85 * alpha})`;
          }
          return withRelationAlpha(visuals.line, alpha);
        }}
        linkLineDash={(l) => ((l as ForceLink).linkKind === 'relative' ? [5, 5] : null)}
        linkDirectionalArrowLength={(l) => {
          const link = l as ForceLink;
          const alpha = getLinkAlpha(link);
          const boosted = filtersActive && alpha > 0.65;
          return (link.linkKind === 'relative' ? 5 : 8) * alpha * (boosted ? 1.35 : 1);
        }}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l) => {
          const link = l as ForceLink;
          const alpha = getLinkAlpha(link);
          const visuals = getLinkVisuals(link);
          return withRelationAlpha(visuals.arrow, alpha);
        }}
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

      {showAiAnalyst && (
        <aside className="absolute top-14 right-3 bottom-3 z-20 w-[23rem] rounded-xl border border-iip-border bg-iip-surface/95 shadow-xl backdrop-blur flex flex-col overflow-hidden" aria-label="AI Graph Analyst Panel">
          <div className="flex items-center justify-between border-b border-iip-border px-3.5 py-2.5 bg-iip-bg/50">
            <div className="flex items-center gap-2">
              <Sparkles className="text-cyan-500 animate-pulse shrink-0" size={16} />
              <span className="text-xs font-bold uppercase tracking-widest text-iip-primary">AI Graph Analyst</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={aiLanguage}
                onChange={(e) => setAiLanguage(e.target.value as AssistantLanguage)}
                className="rounded border border-iip-border bg-iip-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-iip-text focus:border-cyan-500/60 focus:ring-0"
                aria-label="AI Graph Analyst language"
                title="Select AI response language"
              >
                <option value="english">English</option>
                <option value="malayalam">Malayalam</option>
              </select>
              <button
                type="button"
                className="rounded p-1 text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text"
                onClick={() => {
                  setShowAiAnalyst(false);
                  setPathHighlightNodeIds(null);
                  setPathHighlightLinkIds(null);
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Sub Tabs */}
          <div className="flex border-b border-iip-border bg-iip-bg/30 text-[10px] uppercase font-bold tracking-wider">
            <button
              type="button"
              className={`flex-1 py-2 text-center border-b-2 hover:bg-iip-surface-hover/50 ${
                aiActiveTab === 'briefing' ? 'border-cyan-500 text-cyan-400 font-bold' : 'border-transparent text-iip-text-muted font-medium'
              }`}
              onClick={() => setAiActiveTab('briefing')}
            >
              Briefing
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-center border-b-2 hover:bg-iip-surface-hover/50 ${
                aiActiveTab === 'path' ? 'border-cyan-500 text-cyan-400 font-bold' : 'border-transparent text-iip-text-muted font-medium'
              }`}
              onClick={() => setAiActiveTab('path')}
            >
              Path Explainer
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-center border-b-2 hover:bg-iip-surface-hover/50 ${
                aiActiveTab === 'gaps' ? 'border-cyan-500 text-cyan-400 font-bold' : 'border-transparent text-iip-text-muted font-medium'
              }`}
              onClick={() => setAiActiveTab('gaps')}
            >
              Syndicate Gaps
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {aiActiveTab === 'briefing' && (
              <div className="space-y-4">
                {/* Q&A Filter */}
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 space-y-2">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Brain size={12} /> Conversational Filter
                  </span>
                  <form onSubmit={handleApplyConversationalFilter} className="flex gap-2">
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="e.g. associates in Thrissur, theft cases..."
                      className="flex-1 rounded-md border border-iip-border bg-iip-bg px-2 py-1.5 text-xs text-iip-text placeholder:text-iip-text-muted/50 focus:border-cyan-500/60 focus:ring-0"
                    />
                    <button
                      type="submit"
                      disabled={filteringGraph || !filterQuery.trim()}
                      className="rounded-md bg-cyan-600 hover:bg-cyan-500 text-cyan-50 p-1.5 px-3 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
                    >
                      {filteringGraph ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    </button>
                  </form>
                  {filterError && <p className="text-[10px] text-red-500 font-medium">{filterError}</p>}
                  {conversationalFilterActive && (
                    <div className="flex items-center justify-between text-[10px] bg-cyan-500/10 rounded px-2 py-1 text-cyan-200">
                      <span>Showing {conversationalFilterIds?.size ?? 0} matches</span>
                      <button
                        type="button"
                        onClick={handleClearConversationalFilter}
                        className="font-bold underline hover:text-cyan-100"
                      >
                        Clear Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* Briefing */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-iip-text-muted uppercase tracking-widest">
                      Network Intelligence briefing
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateReport}
                      disabled={generatingReport}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:underline disabled:opacity-50"
                    >
                      {generatingReport ? (
                        <>
                          <Loader2 size={10} className="animate-spin" />
                          Analyzing...
                        </>
                      ) : briefingReport ? (
                        'Regenerate Briefing'
                      ) : (
                        'Generate Briefing'
                      )}
                    </button>
                  </div>
                  
                  {reportError && (
                    <div className="rounded border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400">
                      {reportError}
                    </div>
                  )}

                  {briefingReport ? (
                    <div className="rounded-lg border border-iip-border bg-iip-bg/40 p-3 space-y-1.5 text-xs text-iip-text-muted max-h-[300px] overflow-y-auto">
                      {renderMarkdown(briefingReport)}
                    </div>
                  ) : (
                    !generatingReport && (
                      <div className="rounded-lg border border-dashed border-iip-border p-6 text-center text-xs text-iip-text-muted/60">
                        Click "Generate Briefing" to run AI topological analysis on this network.
                      </div>
                    )
                  )}
                  {generatingReport && (
                    <div className="rounded-lg border border-iip-border bg-iip-bg/40 p-6 flex flex-col items-center justify-center gap-2 text-xs text-iip-text-muted">
                      <Loader2 className="animate-spin text-cyan-400" size={20} />
                      <span>Synthesizing centralities & threat vectors...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {aiActiveTab === 'path' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 space-y-3">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                    <GitPullRequest size={12} /> Indirect Link Explainer
                  </span>
                  
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-iip-text-muted uppercase tracking-wide">Start Suspect</label>
                      <div className="rounded-md border border-iip-border bg-iip-bg px-2.5 py-1.5 text-xs font-semibold text-iip-text">
                        {selectedGraphNode ? selectedGraphNode.criminal_name || selectedGraphNode.label : '(Click a suspect on the graph first)'}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-iip-text-muted uppercase tracking-wide">End Suspect</label>
                      <select
                        value={explainTargetId}
                        onChange={(e) => {
                          setExplainTargetId(e.target.value);
                          setPathExplanation(null);
                          setPathHighlightNodeIds(null);
                          setPathHighlightLinkIds(null);
                          setExplainError(null);
                        }}
                        disabled={!selectedNodeId}
                        className="w-full rounded-md border border-iip-border bg-iip-bg px-2.5 py-1.5 text-xs text-iip-text focus:border-cyan-500/60 focus:ring-0 disabled:opacity-40"
                      >
                        <option value="">-- Select target suspect --</option>
                        {graphData.nodes
                          .filter((n) => n.id !== selectedNodeId)
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleExplainPath}
                      disabled={explainingPath || !selectedNodeId || !explainTargetId}
                      className="w-full rounded-md bg-cyan-600 hover:bg-cyan-500 text-cyan-50 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {explainingPath ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Explaining Path...
                        </>
                      ) : (
                        <>
                          <Compass size={12} />
                          Explain Connection Path
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {explainError && (
                  <div className="rounded border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400">
                    {explainError}
                  </div>
                )}

                {pathExplanation && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-iip-text-muted uppercase tracking-widest">
                      <span>Narrative Explanation</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPathExplanation(null);
                          setPathHighlightNodeIds(null);
                          setPathHighlightLinkIds(null);
                          setExplainTargetId('');
                        }}
                        className="text-cyan-400 hover:underline"
                      >
                        Clear Highlight
                      </button>
                    </div>
                    <div className="rounded-lg border border-iip-border bg-iip-bg/40 p-3 text-xs text-iip-text-muted leading-relaxed">
                      {pathExplanation}
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiActiveTab === 'gaps' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-iip-text-muted uppercase tracking-widest">
                    Syndicate Gap analysis
                  </span>
                  <button
                    type="button"
                    onClick={handleAnalyzeGaps}
                    disabled={analyzingGaps}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:underline disabled:opacity-50"
                  >
                    {analyzingGaps ? (
                      <>
                        <Loader2 size={10} className="animate-spin" />
                        Analyzing...
                      </>
                    ) : gapsRecommendations ? (
                      'Refresh Analysis'
                    ) : (
                      'Analyze Gaps'
                    )}
                  </button>
                </div>

                {gapsError && (
                  <div className="rounded border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-400">
                    {gapsError}
                  </div>
                )}

                {gapsRecommendations ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-iip-text-muted italic">
                      The AI identified the following missing syndicate structural elements based on this network's topology:
                    </p>
                    <ul className="space-y-2">
                      {gapsRecommendations.map((rec, idx) => (
                        <li
                          key={idx}
                          className="rounded-lg border border-iip-border bg-iip-bg/40 p-2.5 text-xs text-iip-text-muted flex gap-2 items-start"
                        >
                          <span className="h-5 w-5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  !analyzingGaps && (
                    <div className="rounded-lg border border-dashed border-iip-border p-6 text-center text-xs text-iip-text-muted/60">
                      Run Syndicate Gap Analysis to evaluate missing roles/coordinates.
                    </div>
                  )
                )}

                {analyzingGaps && (
                  <div className="rounded-lg border border-iip-border bg-iip-bg/40 p-6 flex flex-col items-center justify-center gap-2 text-xs text-iip-text-muted">
                    <Loader2 className="animate-spin text-cyan-400" size={20} />
                    <span>Predicting unrepresented syndicate nodes...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
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
