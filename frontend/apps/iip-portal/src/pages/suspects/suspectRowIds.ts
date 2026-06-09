/** Stable row IDs for repeatable dossier form sections (no imports — avoids circular deps). */

export function newRowId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
