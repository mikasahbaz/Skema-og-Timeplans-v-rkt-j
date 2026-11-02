// Tidsregler: opslag af en klasses tid ud fra hold, ugedag og dagdel.
// Én fælles logik bruges ved placering, flytning, kopiering, holdskift, validering og genberegning.
import { sameGroups, type AppData, type Block, type TimeRule } from './schema.js';

export type Resolution =
  | { kind: 'single'; start: number; end: number; ruleId: string | null; label: string; derived: boolean }
  | { kind: 'choice'; options: TimeRule[] }
  | { kind: 'none' };

export interface Target {
  day: number;
  period: number;
  roomId: string;
}

/** Regler, der præcis gælder for dette holdsæt, denne dag og denne dagdel. */
export function findRules(rules: readonly TimeRule[], groupIds: readonly string[], day: number, period: number): TimeRule[] {
  return rules
    .filter((r) => r.day === day && r.period === period && sameGroups(r.groupIds, groupIds))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Finder tiden for et holdsæt på en dag og dagdel.
 * 1) En udtrykkelig regel for præcis dette holdsæt (en ønsket variant vælges, hvis den findes).
 * 2) For en fælles klasse uden egen regel: kun hvis hvert hold har netop én regel, og de er ens.
 * Ellers "none" – der opfindes aldrig en tid.
 */
export function resolveTime(
  rules: readonly TimeRule[],
  groupIds: readonly string[],
  day: number,
  period: number,
  preferRuleId?: string | null,
): Resolution {
  const exact = findRules(rules, groupIds, day, period);
  const preferred = preferRuleId ? exact.find((r) => r.id === preferRuleId) : undefined;
  const pick = preferred ?? (exact.length === 1 ? exact[0] : undefined);
  if (pick) return { kind: 'single', start: pick.start, end: pick.end, ruleId: pick.id, label: pick.label, derived: false };
  if (exact.length > 1) return { kind: 'choice', options: exact };
  if (groupIds.length > 1) {
    const each = groupIds.map((g) => findRules(rules, [g], day, period));
    if (each.every((l) => l.length === 1)) {
      const [first] = each[0];
      if (each.every(([r]) => r.start === first.start && r.end === first.end)) {
        return { kind: 'single', start: first.start, end: first.end, ruleId: null, label: 'Fælles tid for holdene', derived: true };
      }
    }
  }
  return { kind: 'none' };
}

/** Den tid en regelklasse skal have lige nu (bruges af validering og genberegning). */
export function resolveBlock(rules: readonly TimeRule[], block: Pick<Block, 'groupIds' | 'day' | 'period' | 'ruleId'>): Resolution {
  return resolveTime(rules, block.groupIds, block.day, block.period, block.ruleId);
}

/** Er klassens gemte tid i overensstemmelse med tidstabellen? */
export function blockMatchesRules(rules: readonly TimeRule[], block: Block): boolean {
  if (block.timeMode === 'custom') return true;
  const r = resolveBlock(rules, block);
  if (r.kind !== 'single') return false;
  if (block.ruleId !== null && r.ruleId !== block.ruleId) return false;
  return r.start === block.start && r.end === block.end;
}

/**
 * Genberegner alle regelklasser efter en ændring af tidstabellen. Egne tider røres aldrig.
 * Klasser, der ikke længere kan bestemmes entydigt, ændres ikke og returneres i `unresolved`.
 */
export function recomputeRuleBlocks(data: AppData): { data: AppData; changed: string[]; unresolved: string[] } {
  const changed: string[] = [];
  const unresolved: string[] = [];
  const blocks = data.blocks.map((b) => {
    if (b.timeMode !== 'rule') return b;
    const r = resolveBlock(data.timeRules, b);
    if (r.kind !== 'single') {
      unresolved.push(b.id);
      return b;
    }
    if (r.start === b.start && r.end === b.end && r.ruleId === b.ruleId) return b;
    changed.push(b.id);
    return { ...b, start: r.start, end: r.end, ruleId: r.ruleId };
  });
  return { data: changed.length ? { ...data, blocks } : data, changed, unresolved };
}

/** Hvor mange klasser bruger en regel? (Regler i brug kan ikke slettes.) */
export function ruleUsage(data: AppData): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of data.blocks) if (b.timeMode === 'rule' && b.ruleId) m.set(b.ruleId, (m.get(b.ruleId) ?? 0) + 1);
  return m;
}

/** Dækning pr. hold: for hver ugedag de dagdele, hvor holdet har mindst én regel (alene). */
export function coverage(data: AppData): { groupId: string; days: number[][] }[] {
  return data.groups
    .filter((g) => !g.archived)
    .map((g) => ({
      groupId: g.id,
      days: Array.from({ length: 6 }, (_, day) =>
        [0, 1, 2, 3].filter((p) => data.timeRules.some((r) => r.day === day && r.period === p && sameGroups(r.groupIds, [g.id]))),
      ),
    }));
}
