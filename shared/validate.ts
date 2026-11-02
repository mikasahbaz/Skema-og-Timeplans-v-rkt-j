// Fuld validering af et AppData-dokument: struktur (zod) + referencer og forretningsregler.
// Samme funktion bruges af klienten (før en ændring accepteres) og serveren (før lagring).
import { blockMatchesRules } from './rules.js';
import { appDataSchema, blockSchema, timeRuleSchema, type AppData, type Block, type TimeRule } from './schema.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: AppData;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('da-DK');

function duplicates<T>(items: T[], key: (t: T) => string): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) dup.add(k);
    seen.add(k);
  }
  return [...dup];
}

type Refs = Pick<AppData, 'teachers' | 'groups' | 'rooms' | 'timeRules'>;

/** Regler for én klasse, givet referencedata. Returnerer danske fejlbeskeder. */
export function validateBlock(block: Block, data: Refs): string[] {
  const errors: string[] = [];
  const parsed = blockSchema.safeParse(block);
  if (!parsed.success) for (const issue of parsed.error.issues) errors.push(issue.message);
  if (!(block.end > block.start)) errors.push('Sluttid skal ligge efter starttid');
  if (block.start < 0 || block.end > 1440) errors.push('Undervisningen skal ligge inden for samme døgn');
  if (new Set(block.teacherIds).size !== block.teacherIds.length) errors.push('Samme lærer er valgt to gange');
  if (new Set(block.groupIds).size !== block.groupIds.length) errors.push('Samme hold er valgt to gange');
  for (const g of block.groupIds) if (!data.groups.some((x) => x.id === g)) errors.push('Et valgt hold findes ikke');
  if (!data.rooms.some((r) => r.id === block.roomId)) errors.push('Vælg en sal');
  for (const t of block.teacherIds) if (!data.teachers.some((x) => x.id === t)) errors.push('En valgt lærer findes ikke');
  if (block.timeMode === 'custom' && block.ruleId !== null) errors.push('En klasse med egne tider kan ikke have en tidsregel');
  if (block.timeMode === 'rule' && !blockMatchesRules(data.timeRules, block)) errors.push('Klassens tid stemmer ikke med tidstabellen');
  return [...new Set(errors)];
}

export function validateRule(rule: TimeRule, data: Pick<AppData, 'groups'>): string[] {
  const errors: string[] = [];
  const parsed = timeRuleSchema.safeParse(rule);
  if (!parsed.success) for (const issue of parsed.error.issues) errors.push(issue.message);
  if (!(rule.end > rule.start)) errors.push('Sluttid skal ligge efter starttid');
  if (new Set(rule.groupIds).size !== rule.groupIds.length) errors.push('Samme hold er valgt to gange');
  for (const g of rule.groupIds) if (!data.groups.some((x) => x.id === g)) errors.push('Et hold i tidsreglen findes ikke');
  return [...new Set(errors)];
}

export function validateAppData(input: unknown): ValidationResult {
  const parsed = appDataSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 20).map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    });
    return { ok: false, errors };
  }
  const data = parsed.data;
  const errors: string[] = [];

  const idGroups: [string, { id: string }[]][] = [
    ['lærer', data.teachers],
    ['hold', data.groups],
    ['sal', data.rooms],
    ['tidsregel', data.timeRules],
    ['klasse', data.blocks],
  ];
  for (const [label, list] of idGroups) for (const d of duplicates(list, (x) => x.id)) errors.push(`Dubleret id for ${label}: ${d}`);
  for (const d of duplicates(data.teachers, (t) => norm(t.initials))) errors.push(`Initialerne "${d.toUpperCase()}" bruges af flere lærere`);
  for (const d of duplicates(data.groups, (g) => norm(g.name))) errors.push(`Holdet "${d}" findes flere gange`);
  for (const d of duplicates(data.rooms, (r) => norm(r.name))) errors.push(`Salsnavnet "${d}" bruges flere gange`);

  for (const rule of data.timeRules) {
    for (const e of validateRule(rule, data)) errors.push(`Tidsregel ${rule.id}: ${e}`);
    if (errors.length > 50) break;
  }
  const a = data.settings.assembly;
  if (a.enabled && !(a.end > a.start)) errors.push('Morgensamlingen: sluttid skal ligge efter starttid');
  if (a.teacherId && !data.teachers.some((t) => t.id === a.teacherId)) errors.push('Morgensamlingen: den valgte lærer findes ikke');
  for (const g of a.groupIds) if (!data.groups.some((x) => x.id === g)) errors.push('Morgensamlingen: et hold findes ikke');

  for (const block of data.blocks) {
    for (const e of validateBlock(block, data)) errors.push(`Klasse ${block.id}: ${e}`);
    if (errors.length > 50) break;
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], data };
}

/** Hvor mange klasser bruger hvert stamdataelement? */
export function usage(data: AppData) {
  const teachers = new Map<string, number>();
  const groups = new Map<string, number>();
  const rooms = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const b of data.blocks) {
    b.teacherIds.forEach((t) => inc(teachers, t));
    b.groupIds.forEach((g) => inc(groups, g));
    inc(rooms, b.roomId);
  }
  if (data.settings.assembly.teacherId) inc(teachers, data.settings.assembly.teacherId);
  for (const r of data.timeRules) r.groupIds.forEach((g) => inc(groups, g));
  for (const g of data.settings.assembly.groupIds) inc(groups, g);
  return { teachers, groups, rooms };
}
