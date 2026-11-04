// Rene funktioner, der laver en ny AppData ud fra en handling. Ingen sideeffekter.
import { nextTeacherColor } from '../../shared/colors';
import { newId } from '../../shared/ids';
import { deriveStandardTimes, recomputeRuleBlocks, resolveTime, type Target, type TimeSource } from '../../shared/rules';
import type { AppData, Block, Group, Room, Settings, Teacher, TimeRule } from '../../shared/schema';

export const upsertBlock = (data: AppData, block: Block): AppData => {
  const exists = data.blocks.some((b) => b.id === block.id);
  return { ...data, blocks: exists ? data.blocks.map((b) => (b.id === block.id ? block : b)) : [...data.blocks, block] };
};

export const deleteBlock = (data: AppData, id: string): AppData => ({ ...data, blocks: data.blocks.filter((b) => b.id !== id) });

/** Resultatet af at placere en klasse i en celle. */
export type PlaceOutcome =
  | { kind: 'ok'; block: Block; source: TimeSource | 'custom' }
  | { kind: 'choice'; base: Block; options: TimeRule[] }
  | { kind: 'none'; base: Block };

/**
 * Placerer en klasse (ny, flyttet eller kopieret) i en målcelle.
 * - Egne tider: tidsrummet bevares præcist; kun dag, dagdel og sal ændres.
 * - Tidsregel: samme dag og dagdel (kun ny sal) bevarer tiden; ellers slås reglen op.
 */
export function placeBlock(data: AppData, block: Block, target: Target): PlaceOutcome {
  const base: Block = { ...block, day: target.day, period: target.period, roomId: target.roomId };
  if (block.timeMode === 'custom') return { kind: 'ok', block: base, source: 'custom' };
  const sameSlot = block.day === target.day && block.period === target.period;
  // Samme dag og dagdel: behold reglen. Ellers foretrækkes klassens nuværende tidsrum, hvis holdet
  // også har det i måldagdelen (fx Hold 2's middagstid på en ny dag).
  const r = resolveTime(data, block.groupIds, target.day, target.period, sameSlot ? { ruleId: block.ruleId } : { start: block.start, end: block.end });
  if (r.kind === 'single') return { kind: 'ok', block: { ...base, start: r.start, end: r.end, ruleId: r.ruleId }, source: r.source };
  if (r.kind === 'choice') return { kind: 'choice', base, options: r.options };
  return { kind: 'none', base };
}

export const withRule = (block: Block, rule: TimeRule): Block => ({ ...block, timeMode: 'rule', ruleId: rule.id, start: rule.start, end: rule.end });

/** Kopi med nyt id; titel, hold, lærere, tidsmodel og (for egne tider) klokkeslæt bevares. */
export const copyOf = (block: Block): Block => ({ ...block, teacherIds: [...block.teacherIds], groupIds: [...block.groupIds], id: newId('b') });

// ---- Tidsregler --------------------------------------------------------------

/**
 * Ændrer tidstabellen og genberegner alle berørte regelklasser i samme handling.
 * En regelklasse, der ikke længere kan få en entydig tid, beholder sit tidsrum som "Egne tider"
 * (den ændres altså ikke) og returneres i `toCustom`, så brugeren kan få det at vide.
 */
export function updateRules(data: AppData, rules: TimeRule[]) {
  const r = recomputeRuleBlocks({ ...data, timeRules: rules });
  if (!r.unresolved.length) return { data: r.data, changed: r.changed, toCustom: [] as string[] };
  const blocks = r.data.blocks.map((b) => (r.unresolved.includes(b.id) ? { ...b, timeMode: 'custom' as const, ruleId: null } : b));
  return { data: { ...r.data, blocks }, changed: r.changed, toCustom: r.unresolved };
}

/** Ændrer en standardtid (null = ingen) og genberegner berørte klasser. */
export function updateStandardTime(data: AppData, day: number, period: number, slot: { start: number; end: number } | null) {
  const standardTimes = data.settings.standardTimes.map((row, d) => row.map((s, p) => (d === day && p === period ? slot : s)));
  return updateRules({ ...data, settings: { ...data.settings, standardTimes } }, data.timeRules);
}

/** Udleder alle standardtider af tidstabellen igen. */
export const resetStandardTimes = (data: AppData) =>
  updateRules({ ...data, settings: { ...data.settings, standardTimes: deriveStandardTimes(data.timeRules) } }, data.timeRules);

export const updateRule = (data: AppData, id: string, patch: Partial<TimeRule>) =>
  updateRules(
    data,
    data.timeRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );

export const addRule = (data: AppData, rule: Omit<TimeRule, 'id'>) => updateRules(data, [...data.timeRules, { ...rule, id: newId('r') }]);

export const removeRule = (data: AppData, id: string) => updateRules(data, data.timeRules.filter((r) => r.id !== id));

// ---- Stamdata ----------------------------------------------------------------

export function addTeacher(data: AppData, initials: string): { data: AppData; teacher: Teacher } {
  const teacher: Teacher = {
    id: newId('t'),
    initials: initials.trim().toUpperCase(),
    name: '',
    color: nextTeacherColor(data.teachers.filter((t) => !t.archived).map((t) => t.color)),
    annualHours: null,
    contractHours: null,
    orientationHours: null,
    saturdays: null,
    archived: false,
  };
  return { data: { ...data, teachers: [...data.teachers, teacher] }, teacher };
}

export const updateTeacher = (data: AppData, id: string, patch: Partial<Teacher>): AppData => ({
  ...data,
  teachers: data.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

export function addGroup(data: AppData, name: string) {
  const item: Group = { id: newId('g'), name: name.trim(), archived: false };
  return { data: { ...data, groups: [...data.groups, item] }, item };
}

export const updateGroup = (data: AppData, id: string, patch: Partial<Group>): AppData => ({
  ...data,
  groups: data.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
});

export const removeTeacher = (data: AppData, id: string): AppData => ({ ...data, teachers: data.teachers.filter((t) => t.id !== id) });
export const removeGroup = (data: AppData, id: string): AppData => ({ ...data, groups: data.groups.filter((g) => g.id !== id) });

export const updateRoom = (data: AppData, id: string, patch: Partial<Room>): AppData => ({
  ...data,
  rooms: data.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

export function moveRoom(data: AppData, id: string, dir: -1 | 1): AppData {
  const i = data.rooms.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= data.rooms.length) return data;
  const rooms = [...data.rooms];
  [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
  return { ...data, rooms };
}

export const updateSettings = (data: AppData, patch: Partial<Settings>): AppData => ({ ...data, settings: { ...data.settings, ...patch } });

export const updateAssembly = (data: AppData, patch: Partial<Settings['assembly']>): AppData =>
  updateSettings(data, { assembly: { ...data.settings.assembly, ...patch } });
