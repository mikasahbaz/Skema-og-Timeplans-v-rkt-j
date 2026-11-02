// Fuld validering af et AppData-dokument: struktur (zod) + referencer og forretningsregler.
// Samme funktion bruges af klienten (før en ændring accepteres) og serveren (før lagring).
import { appDataSchema, blockSchema, type AppData, type Block } from './schema.js';

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

/** Regler for én blok, givet referencedata. Returnerer danske fejlbeskeder. */
export function validateBlock(block: Block, data: Pick<AppData, 'teachers' | 'subjects' | 'groups' | 'rooms'>): string[] {
  const errors: string[] = [];
  const parsed = blockSchema.safeParse(block);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(issue.message);
  }
  if (!(block.end > block.start)) errors.push('Sluttid skal ligge efter starttid');
  if (block.start < 0 || block.end > 1440) errors.push('Undervisningen skal ligge inden for samme døgn');
  if (new Set(block.teacherIds).size !== block.teacherIds.length) errors.push('Samme lærer er valgt to gange');
  if (!data.subjects.some((s) => s.id === block.subjectId)) errors.push('Vælg et fag');
  if (!data.groups.some((g) => g.id === block.groupId)) errors.push('Vælg et hold');
  if (!data.rooms.some((r) => r.id === block.roomId)) errors.push('Vælg en sal');
  for (const t of block.teacherIds) {
    if (!data.teachers.some((x) => x.id === t)) errors.push('En valgt lærer findes ikke');
  }
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
    ['fag', data.subjects],
    ['hold', data.groups],
    ['sal', data.rooms],
    ['blok', data.blocks],
  ];
  for (const [label, list] of idGroups) {
    for (const d of duplicates(list, (x) => x.id)) errors.push(`Dubleret id for ${label}: ${d}`);
  }
  for (const d of duplicates(data.teachers, (t) => norm(t.initials))) errors.push(`Initialerne "${d.toUpperCase()}" bruges af flere lærere`);
  for (const d of duplicates(data.subjects, (s) => norm(s.name))) errors.push(`Faget "${d}" findes flere gange`);
  for (const d of duplicates(data.groups, (g) => norm(g.name))) errors.push(`Holdet "${d}" findes flere gange`);
  for (const d of duplicates(data.rooms, (r) => norm(r.name))) errors.push(`Salsnavnet "${d}" bruges flere gange`);

  const [a, b, c] = data.settings.daypartStarts;
  if (!(0 < a && a < b && b < c && c < 1440)) errors.push('Dagdelenes skel skal være stigende og ligge inden for døgnet');

  for (const block of data.blocks) {
    for (const e of validateBlock(block, data)) errors.push(`Blok ${block.id}: ${e}`);
    if (errors.length > 50) break;
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], data };
}

/** Er stamdataelementet i brug på en blok? */
export function usage(data: AppData) {
  const teachers = new Map<string, number>();
  const subjects = new Map<string, number>();
  const groups = new Map<string, number>();
  const rooms = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const b of data.blocks) {
    b.teacherIds.forEach((t) => inc(teachers, t));
    inc(subjects, b.subjectId);
    inc(groups, b.groupId);
    inc(rooms, b.roomId);
  }
  return { teachers, subjects, groups, rooms };
}
