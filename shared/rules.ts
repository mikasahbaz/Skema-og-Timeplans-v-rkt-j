// Tidsregler: opslag af en klasses tid ud fra hold, ugedag og dagdel.
// Én fælles logik bruges ved placering, flytning, kopiering, holdskift, validering og genberegning.
//
// Rækkefølge (første, der giver en tid, vinder):
//   1. Holdets egen regel den dag i den dagdel (tidstabellen fra skemadokumentet).
//   2. En fælles klasse uden egen regel: hvert hold har netop én regel, og de er ens.
//   3. Holdets egen tid i samme dagdel på en anden dag (fx Hold 2's middagstid).
//   4. Dagdelens standardtid for ugedagen (udledt af dokumentet, kan rettes).
// Først hvis ingen af dem findes, er der "ingen tid".
import { DAY_COUNT, DAY_NAMES, PERIOD_COUNT, sameGroups, type AppData, type Block, type StandardTimes, type TimeRule } from './schema.js';

export type TimeSource = 'rule' | 'combined' | 'group' | 'standard';

export type Resolution =
  | { kind: 'single'; start: number; end: number; ruleId: string | null; label: string; source: TimeSource }
  | { kind: 'choice'; options: TimeRule[] }
  | { kind: 'none' };

export interface Target {
  day: number;
  period: number;
  roomId: string;
}

/** Det, opslaget har brug for: tidsregler og standardtider. */
export interface TimeTable {
  timeRules: readonly TimeRule[];
  settings: { standardTimes: StandardTimes };
}

/** Ønsket udfald, når flere er mulige (klassens nuværende regel eller tidsrum). */
export interface Preference {
  ruleId?: string | null;
  start?: number;
  end?: number;
}

/** Regler, der præcis gælder for dette holdsæt, denne dag og denne dagdel. */
export function findRules(rules: readonly TimeRule[], groupIds: readonly string[], day: number, period: number): TimeRule[] {
  return rules.filter((r) => r.day === day && r.period === period && sameGroups(r.groupIds, groupIds)).sort((a, b) => a.start - b.start || a.end - b.end);
}

const key = (r: { start: number; end: number }) => `${r.start}-${r.end}`;

/** Mest almindelige tidsrum i en liste (uafgjort: tidligste start). */
function mostCommon<T extends { start: number; end: number }>(list: T[]): T | undefined {
  const count = new Map<string, number>();
  for (const r of list) count.set(key(r), (count.get(key(r)) ?? 0) + 1);
  return [...list].sort((a, b) => count.get(key(b))! - count.get(key(a))! || a.start - b.start || a.end - b.end)[0];
}

export function resolveTime(t: TimeTable, groupIds: readonly string[], day: number, period: number, prefer: Preference = {}): Resolution {
  const rules = t.timeRules;
  // 1. Udtrykkelig regel
  const exact = findRules(rules, groupIds, day, period);
  const preferred =
    exact.find((r) => r.id === prefer.ruleId) ?? (prefer.start !== undefined ? exact.find((r) => r.start === prefer.start && r.end === prefer.end) : undefined);
  const pick = preferred ?? (exact.length === 1 ? exact[0] : undefined);
  if (pick) return { kind: 'single', start: pick.start, end: pick.end, ruleId: pick.id, label: pick.label, source: 'rule' };
  if (exact.length > 1) return { kind: 'choice', options: exact };

  // 2. Fælles klasse: holdenes egne regler er ens
  if (groupIds.length > 1) {
    const each = groupIds.map((g) => findRules(rules, [g], day, period));
    if (each.every((l) => l.length === 1)) {
      const [first] = each[0];
      if (each.every(([r]) => r.start === first.start && r.end === first.end)) {
        return { kind: 'single', start: first.start, end: first.end, ruleId: null, label: 'Fælles tid for holdene', source: 'combined' };
      }
    }
  }

  // 3. Holdets egen tid i samme dagdel på andre dage
  const elsewhere = rules.filter((r) => r.period === period && sameGroups(r.groupIds, groupIds));
  if (elsewhere.length) {
    const same = prefer.start !== undefined ? elsewhere.find((r) => r.start === prefer.start && r.end === prefer.end) : undefined;
    const r = same ?? mostCommon(elsewhere)!;
    return { kind: 'single', start: r.start, end: r.end, ruleId: null, label: `Holdets tid (som ${DAY_NAMES[r.day].toLowerCase()})`, source: 'group' };
  }

  // 4. Dagdelens standardtid
  const std = t.settings.standardTimes[day]?.[period];
  if (std) return { kind: 'single', start: std.start, end: std.end, ruleId: null, label: 'Dagdelens standardtid', source: 'standard' };
  return { kind: 'none' };
}

/** Den tid en regelklasse skal have lige nu (bruges af validering og genberegning). */
export function resolveBlock(t: TimeTable, block: Pick<Block, 'groupIds' | 'day' | 'period' | 'ruleId' | 'start' | 'end'>): Resolution {
  return resolveTime(t, block.groupIds, block.day, block.period, { ruleId: block.ruleId, start: block.start, end: block.end });
}

/** Er klassens gemte tid i overensstemmelse med tidstabellen? */
export function blockMatchesRules(t: TimeTable, block: Block): boolean {
  if (block.timeMode === 'custom') return true;
  const r = resolveBlock(t, block);
  return r.kind === 'single' && r.ruleId === block.ruleId && r.start === block.start && r.end === block.end;
}

/**
 * Genberegner alle regelklasser efter en ændring af tidstabellen eller standardtiderne.
 * Egne tider røres aldrig. Klasser, der ikke kan bestemmes, ændres ikke og returneres i `unresolved`.
 */
export function recomputeRuleBlocks(data: AppData): { data: AppData; changed: string[]; unresolved: string[] } {
  const changed: string[] = [];
  const unresolved: string[] = [];
  const blocks = data.blocks.map((b) => {
    if (b.timeMode !== 'rule') return b;
    // Klassens regel vælges først (så en ændret regel slår igennem); ellers bevares dens tidsrum,
    // hvis det stadig er en gyldig mulighed.
    const r = resolveBlock(data, b);
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

/**
 * Standardtider pr. ugedag og dagdel udledt af tidstabellen: det mest almindelige tidsrum den dag i
 * den dagdel; ved uafgjort eller ingen regler den dag, det mest almindelige i dagdelen hele ugen.
 */
export function deriveStandardTimes(rules: readonly TimeRule[]): StandardTimes {
  return Array.from({ length: DAY_COUNT }, (_, day) =>
    Array.from({ length: PERIOD_COUNT }, (_, period) => {
      const all = rules.filter((r) => r.period === period);
      if (!all.length) return null;
      const today = all.filter((r) => r.day === day);
      const count = (list: TimeRule[]) => {
        const m = new Map<string, number>();
        for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
        return m;
      };
      const weekCount = count(all);
      let pick: TimeRule | undefined;
      if (today.length) {
        const c = count(today);
        const best = Math.max(...c.values());
        const top = today.filter((r) => c.get(key(r)) === best);
        // Uafgjort: det tidsrum, der er mest almindeligt i dagdelen hele ugen.
        pick = [...top].sort((a, b) => weekCount.get(key(b))! - weekCount.get(key(a))! || a.start - b.start)[0];
      } else pick = mostCommon(all);
      return pick ? { start: pick.start, end: pick.end } : null;
    }),
  );
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
