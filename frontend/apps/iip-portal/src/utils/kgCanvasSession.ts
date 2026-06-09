import type { NetworkGraphResponse, SuspectProfileHit } from '../api/knowledgeGraph';

const STORAGE_KEY = 'iip-kg-canvas-session';

export interface KgCanvasSession {
  query: string;
  results: SuspectProfileHit[];
  selected: SuspectProfileHit | null;
  graph: NetworkGraphResponse | null;
}

export function loadKgCanvasSession(): KgCanvasSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KgCanvasSession;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      results: Array.isArray(parsed.results) ? parsed.results : [],
      selected: parsed.selected ?? null,
      graph: parsed.graph ?? null,
    };
  } catch {
    return null;
  }
}

export function saveKgCanvasSession(session: KgCanvasSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full or unavailable */
  }
}

export function clearKgCanvasSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
