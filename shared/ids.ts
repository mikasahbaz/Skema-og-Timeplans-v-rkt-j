/** Stabilt, unikt id med præfiks (fx "b-…" for blokke). */
export function newId(prefix: string): string {
  const c = globalThis.crypto;
  const raw = c && 'randomUUID' in c ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw}`;
}
