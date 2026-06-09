/** Canvas helpers for sci-fi knowledge-graph nodes (no React deps). */

export type NormalizedGender = 'male' | 'female' | 'unknown';
export type NodeKind = 'center' | 'associate' | 'relative';
export type LinkKind = 'associate' | 'relative';

export function normalizeGender(g?: string | null): NormalizedGender {
  const raw = (g ?? '').trim().toLowerCase();
  if (raw.includes('female') || raw === 'f' || raw === 'woman') return 'female';
  if (raw.includes('male') || raw === 'm' || raw === 'man') return 'male';
  return 'unknown';
}

export function formatRelationRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const NODE_R_CENTER = 30;
const NODE_R_ASSOCIATE = 24;
const NODE_R_RELATIVE = 18;
const LABEL_CLEARANCE = 34;

export function resolveNodeKind(isCenter: boolean, nodeKind?: string | null): NodeKind {
  if (isCenter || nodeKind === 'center') return 'center';
  if (nodeKind === 'relative') return 'relative';
  return 'associate';
}

export function nodeRadius(isCenter: boolean, nodeKind?: string | null): number {
  const kind = resolveNodeKind(isCenter, nodeKind);
  if (kind === 'center') return NODE_R_CENTER;
  if (kind === 'relative') return NODE_R_RELATIVE;
  return NODE_R_ASSOCIATE;
}

/** Minimum gap between node centers (avatar + name label). */
export function nodeCollisionRadius(isCenter: boolean, nodeKind?: string | null): number {
  return nodeRadius(isCenter, nodeKind) + LABEL_CLEARANCE;
}

/** Visual footprint for zoom-to-fit (avatar ring + label + link labels). */
export function nodeFitExtent(isCenter: boolean, nodeKind?: string | null): number {
  return nodeCollisionRadius(isCenter, nodeKind) + 16;
}

export interface KgGraphTheme {
  mode: 'light' | 'dark';
  centerRing: string;
  associateRing: string;
  relativeRing: string;
  centerGlow: string;
  associateGlow: string;
  relativeGlow: string;
  labelBg: string;
  centerLabel: string;
  associateLabel: string;
  relativeLabel: string;
  linkLabelBg: string;
  linkLabelBorder: string;
  linkLabelText: string;
  relativeLinkLabelBg: string;
  relativeLinkLabelBorder: string;
  relativeLinkLabelText: string;
  linkColor: string;
  linkArrow: string;
  relativeLinkColor: string;
  relativeLinkArrow: string;
}

export function getKgGraphTheme(mode: 'light' | 'dark'): KgGraphTheme {
  if (mode === 'dark') {
    return {
      mode: 'dark',
      centerRing: '#fbbf24',
      associateRing: '#22d3ee',
      relativeRing: '#94a3b8',
      centerGlow: 'rgba(251, 191, 36, 0.9)',
      associateGlow: 'rgba(34, 211, 238, 0.85)',
      relativeGlow: 'rgba(148, 163, 184, 0.35)',
      labelBg: 'rgba(2, 8, 23, 0.82)',
      centerLabel: '#fde68a',
      associateLabel: '#a5f3fc',
      relativeLabel: '#cbd5e1',
      linkLabelBg: 'rgba(2, 8, 23, 0.92)',
      linkLabelBorder: 'rgba(34, 211, 238, 0.75)',
      linkLabelText: '#67e8f9',
      relativeLinkLabelBg: 'rgba(15, 23, 42, 0.88)',
      relativeLinkLabelBorder: 'rgba(148, 163, 184, 0.5)',
      relativeLinkLabelText: '#94a3b8',
      linkColor: 'rgba(34, 211, 238, 0.45)',
      linkArrow: 'rgba(103, 232, 249, 0.9)',
      relativeLinkColor: 'rgba(148, 163, 184, 0.35)',
      relativeLinkArrow: 'rgba(148, 163, 184, 0.65)',
    };
  }
  return {
    mode: 'light',
    centerRing: '#d97706',
    associateRing: '#0284c7',
    relativeRing: '#94a3b8',
    centerGlow: 'rgba(217, 119, 6, 0.35)',
    associateGlow: 'rgba(2, 132, 199, 0.3)',
    relativeGlow: 'rgba(148, 163, 184, 0.25)',
    labelBg: 'rgba(255, 255, 255, 0.94)',
    centerLabel: '#92400e',
    associateLabel: '#0c4a6e',
    relativeLabel: '#475569',
    linkLabelBg: 'rgba(255, 255, 255, 0.96)',
    linkLabelBorder: 'rgba(2, 132, 199, 0.45)',
    linkLabelText: '#0369a1',
    relativeLinkLabelBg: 'rgba(248, 250, 252, 0.96)',
    relativeLinkLabelBorder: 'rgba(148, 163, 184, 0.55)',
    relativeLinkLabelText: '#64748b',
    linkColor: 'rgba(2, 132, 199, 0.35)',
    linkArrow: 'rgba(3, 105, 161, 0.85)',
    relativeLinkColor: 'rgba(148, 163, 184, 0.45)',
    relativeLinkArrow: 'rgba(100, 116, 139, 0.75)',
  };
}

export function spreadNodesInitially(
  nodes: Array<{
    isCenter?: boolean;
    nodeKind?: string | null;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
  }>
): void {
  const center = nodes.find((n) => n.isCenter);
  const associates = nodes.filter((n) => !n.isCenter && n.nodeKind !== 'relative');
  const relatives = nodes.filter((n) => n.nodeKind === 'relative');

  const associateRing = Math.max(120, associates.length * 56);
  const relativeRing = associateRing + Math.max(85, relatives.length * 44);

  if (center) {
    center.x = 0;
    center.y = 0;
    center.fx = 0;
    center.fy = 0;
  }

  associates.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(associates.length, 1) - Math.PI / 2;
    node.x = Math.cos(angle) * associateRing;
    node.y = Math.sin(angle) * associateRing;
    node.fx = undefined;
    node.fy = undefined;
  });

  relatives.forEach((node, index) => {
    const offset = relatives.length > 1 ? Math.PI / relatives.length : 0;
    const angle =
      (2 * Math.PI * index) / Math.max(relatives.length, 1) - Math.PI / 2 + offset;
    node.x = Math.cos(angle) * relativeRing;
    node.y = Math.sin(angle) * relativeRing;
    node.fx = undefined;
    node.fy = undefined;
  });
}

export function drawGenderPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  gender?: string | null,
  muted = false
): void {
  const g = normalizeGender(gender);
  const grad = ctx.createRadialGradient(x, y - r * 0.1, r * 0.1, x, y, r);
  if (muted) {
    if (g === 'female') {
      grad.addColorStop(0, '#e9d5ff');
      grad.addColorStop(1, '#6b7280');
    } else if (g === 'male') {
      grad.addColorStop(0, '#cbd5e1');
      grad.addColorStop(1, '#64748b');
    } else {
      grad.addColorStop(0, '#e2e8f0');
      grad.addColorStop(1, '#94a3b8');
    }
  } else if (g === 'female') {
    grad.addColorStop(0, '#f472b6');
    grad.addColorStop(1, '#831843');
  } else if (g === 'male') {
    grad.addColorStop(0, '#60a5fa');
    grad.addColorStop(1, '#1e3a8a');
  } else {
    grad.addColorStop(0, '#22d3ee');
    grad.addColorStop(1, '#0e7490');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = muted ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.22, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y + r * 0.95);
  ctx.quadraticCurveTo(x, y + r * 0.35, x + r * 0.55, y + r * 0.95);
  ctx.lineTo(x + r * 0.55, y + r);
  ctx.lineTo(x - r * 0.55, y + r);
  ctx.closePath();
  ctx.fill();
}

export function drawNetworkNode(
  ctx: CanvasRenderingContext2D,
  node: {
    x?: number;
    y?: number;
    name?: string;
    isCenter?: boolean;
    nodeKind?: string | null;
    gender?: string | null;
  },
  globalScale: number,
  image: HTMLImageElement | null | undefined,
  theme: KgGraphTheme
): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const kind = resolveNodeKind(Boolean(node.isCenter), node.nodeKind);
  const r = nodeRadius(Boolean(node.isCenter), node.nodeKind);
  const ring =
    kind === 'center' ? theme.centerRing : kind === 'relative' ? theme.relativeRing : theme.associateRing;
  const glow =
    kind === 'center' ? theme.centerGlow : kind === 'relative' ? theme.relativeGlow : theme.associateGlow;
  const isRelative = kind === 'relative';

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = (isRelative ? 10 : 22) / globalScale;
  ctx.beginPath();
  ctx.arc(x, y, r + (isRelative ? 3 : 5), 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = (isRelative ? 1.5 : 2.5) / globalScale;
  if (isRelative) {
    ctx.setLineDash([4 / globalScale, 3 / globalScale]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  if (!isRelative && image && image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, x - r, y - r, r * 2, r * 2);
  } else {
    drawGenderPlaceholder(ctx, x, y, r, node.gender, isRelative);
  }
  ctx.restore();

  const label = (node.name ?? '').length > 18 ? `${(node.name ?? '').slice(0, 16)}…` : (node.name ?? '');
  ctx.font = `${isRelative ? 500 : 600} ${(isRelative ? 10 : 11) / globalScale}px "JetBrains Mono", "SF Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const ly = y + r + 8 / globalScale;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = theme.labelBg;
  ctx.fillRect(x - tw / 2 - 6 / globalScale, ly - 2 / globalScale, tw + 12 / globalScale, 16 / globalScale);
  ctx.fillStyle =
    kind === 'center' ? theme.centerLabel : kind === 'relative' ? theme.relativeLabel : theme.associateLabel;
  ctx.fillText(label, x, ly);
}

export function drawLinkLabel(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  text: string,
  globalScale: number,
  theme: KgGraphTheme,
  linkKind: LinkKind = 'associate'
): void {
  const isRelative = linkKind === 'relative';
  ctx.font = `${isRelative ? 600 : 700} ${(isRelative ? 8 : 9) / globalScale}px "JetBrains Mono", monospace`;
  const w = ctx.measureText(text).width;
  const pad = 6 / globalScale;
  const h = 14 / globalScale;
  ctx.fillStyle = isRelative ? theme.relativeLinkLabelBg : theme.linkLabelBg;
  ctx.strokeStyle = isRelative ? theme.relativeLinkLabelBorder : theme.linkLabelBorder;
  ctx.lineWidth = 1 / globalScale;
  const rx = mx - w / 2 - pad;
  const ry = my - h / 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w + pad * 2, h, 3 / globalScale);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = isRelative ? theme.relativeLinkLabelText : theme.linkLabelText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, mx, my);
}
