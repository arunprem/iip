import type { KgGraphTheme } from './kgGraphCanvas';

export interface RelationLinkStyle {
  line: string;
  arrow: string;
  label: string;
  labelBorder: string;
  labelBg: string;
  glow: string;
}

const ROLE_STYLES_DARK: Record<string, RelationLinkStyle> = {
  ACCOMPLICE: {
    line: 'rgba(239, 68, 68, 0.82)',
    arrow: 'rgba(252, 165, 165, 0.98)',
    label: '#fecaca',
    labelBorder: 'rgba(239, 68, 68, 0.85)',
    labelBg: 'rgba(69, 10, 10, 0.92)',
    glow: 'rgba(239, 68, 68, 0.55)',
  },
  CONTACT: {
    line: 'rgba(249, 115, 22, 0.82)',
    arrow: 'rgba(253, 186, 116, 0.98)',
    label: '#fed7aa',
    labelBorder: 'rgba(249, 115, 22, 0.85)',
    labelBg: 'rgba(67, 20, 7, 0.92)',
    glow: 'rgba(249, 115, 22, 0.55)',
  },
  HANDLER: {
    line: 'rgba(168, 85, 247, 0.82)',
    arrow: 'rgba(216, 180, 254, 0.98)',
    label: '#e9d5ff',
    labelBorder: 'rgba(168, 85, 247, 0.85)',
    labelBg: 'rgba(59, 7, 100, 0.92)',
    glow: 'rgba(168, 85, 247, 0.55)',
  },
  FINANCIER: {
    line: 'rgba(16, 185, 129, 0.82)',
    arrow: 'rgba(110, 231, 183, 0.98)',
    label: '#a7f3d0',
    labelBorder: 'rgba(16, 185, 129, 0.85)',
    labelBg: 'rgba(6, 78, 59, 0.92)',
    glow: 'rgba(16, 185, 129, 0.55)',
  },
  FRIEND: {
    line: 'rgba(244, 63, 94, 0.82)',
    arrow: 'rgba(253, 164, 175, 0.98)',
    label: '#fecdd3',
    labelBorder: 'rgba(244, 63, 94, 0.85)',
    labelBg: 'rgba(76, 5, 25, 0.92)',
    glow: 'rgba(244, 63, 94, 0.55)',
  },
};

const ROLE_STYLES_LIGHT: Record<string, RelationLinkStyle> = {
  ACCOMPLICE: {
    line: 'rgba(220, 38, 38, 0.78)',
    arrow: 'rgba(185, 28, 28, 0.95)',
    label: '#991b1b',
    labelBorder: 'rgba(220, 38, 38, 0.65)',
    labelBg: 'rgba(254, 242, 242, 0.96)',
    glow: 'rgba(220, 38, 38, 0.35)',
  },
  CONTACT: {
    line: 'rgba(234, 88, 12, 0.78)',
    arrow: 'rgba(194, 65, 12, 0.95)',
    label: '#9a3412',
    labelBorder: 'rgba(234, 88, 12, 0.65)',
    labelBg: 'rgba(255, 247, 237, 0.96)',
    glow: 'rgba(234, 88, 12, 0.35)',
  },
  HANDLER: {
    line: 'rgba(147, 51, 234, 0.78)',
    arrow: 'rgba(126, 34, 206, 0.95)',
    label: '#6b21a8',
    labelBorder: 'rgba(147, 51, 234, 0.65)',
    labelBg: 'rgba(250, 245, 255, 0.96)',
    glow: 'rgba(147, 51, 234, 0.35)',
  },
  FINANCIER: {
    line: 'rgba(5, 150, 105, 0.78)',
    arrow: 'rgba(4, 120, 87, 0.95)',
    label: '#065f46',
    labelBorder: 'rgba(5, 150, 105, 0.65)',
    labelBg: 'rgba(236, 253, 245, 0.96)',
    glow: 'rgba(5, 150, 105, 0.35)',
  },
  FRIEND: {
    line: 'rgba(225, 29, 72, 0.78)',
    arrow: 'rgba(190, 18, 60, 0.95)',
    label: '#9f1239',
    labelBorder: 'rgba(225, 29, 72, 0.65)',
    labelBg: 'rgba(255, 241, 242, 0.96)',
    glow: 'rgba(225, 29, 72, 0.35)',
  },
};

const FALLBACK_PALETTE_DARK: RelationLinkStyle[] = [
  ROLE_STYLES_DARK.HANDLER,
  ROLE_STYLES_DARK.FINANCIER,
  ROLE_STYLES_DARK.FRIEND,
  ROLE_STYLES_DARK.CONTACT,
];

export function normalizeRelationRole(role: string): string {
  return (role || 'UNKNOWN').trim().toUpperCase().replace(/\s+/g, '_');
}

export function getRelationLinkStyle(
  role: string,
  isDark: boolean
): RelationLinkStyle {
  const key = normalizeRelationRole(role);
  const table = isDark ? ROLE_STYLES_DARK : ROLE_STYLES_LIGHT;
  if (table[key]) return table[key];
  const idx = Math.abs(hashCode(key)) % FALLBACK_PALETTE_DARK.length;
  return isDark ? FALLBACK_PALETTE_DARK[idx] : ROLE_STYLES_LIGHT.CONTACT;
}

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h << 5) - h + value.charCodeAt(i);
  return h;
}

export function resolveLinkVisuals(
  opts: {
    role: string;
    linkKind: string;
    theme: KgGraphTheme;
    filtersActive: boolean;
    passesFilter: boolean;
    alpha: number;
  }
): RelationLinkStyle {
  const { role, linkKind, theme, filtersActive, passesFilter, alpha } = opts;
  const isRelative = linkKind === 'relative';

  if (filtersActive && passesFilter && alpha > 0.08) {
    return getRelationLinkStyle(role, theme.mode === 'dark');
  }

  if (isRelative) {
    return {
      line: theme.relativeLinkColor,
      arrow: theme.relativeLinkArrow,
      label: theme.relativeLinkLabelText,
      labelBorder: theme.relativeLinkLabelBorder,
      labelBg: theme.relativeLinkLabelBg,
      glow: theme.relativeGlow,
    };
  }

  return {
    line: theme.linkColor,
    arrow: theme.linkArrow,
    label: theme.linkLabelText,
    labelBorder: theme.linkLabelBorder,
    labelBg: theme.linkLabelBg,
    glow: theme.associateGlow,
  };
}

export function relationChipColor(role: string, isDark: boolean): string {
  return getRelationLinkStyle(role, isDark).line;
}

export function withAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba?\(\s*([^)]+)\s*\)/);
  if (!match) return color;
  const parts = match[1].split(',').map((s) => s.trim());
  if (parts.length >= 4) {
    const base = Number.parseFloat(parts[3]);
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${base * alpha})`;
  }
  if (parts.length === 3) {
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return color;
}
