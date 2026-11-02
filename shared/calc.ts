// Den ENESTE beregningslogik for lærertimer. Bruges af timepanel, detaljer og årstal.
// Alle mellemresultater er i minutter med fuld præcision; afrunding sker kun i visningen.
import { DAY_COUNT, SATURDAY, type AppData, type Block, type Settings } from './schema.js';

export interface Figures {
  /** Faktisk undervisningstid. */
  U: number;
  /** Forberedelsestid. null = kan ikke beregnes (manglende sats). */
  F: number | null;
  /** Lørdagstillæg. null = kan ikke beregnes (manglende sats). */
  L: number | null;
  /** Undervisning + forberedelse. */
  UF: number | null;
  /** Samlet medregnet arbejdstid. */
  K: number | null;
}

export type MissingField = 'prepPercent' | 'saturdayPercent' | 'teachingWeeks' | 'annualHours';

export const MISSING_LABELS: Record<MissingField, string> = {
  prepPercent: 'Forberedelsesprocent',
  saturdayPercent: 'Lørdagstillæg',
  teachingWeeks: 'Antal undervisningsuger',
  annualHours: 'Årsarbejdstimer',
};

export interface Annual {
  /** Forventede årsarbejdstimer (timer). */
  expectedHours: number | null;
  weeks: number | null;
  /** Planlagt årsarbejdstid fra grundugen (timer) = K × W. */
  plannedHours: number | null;
  /** A − planlagt (timer). Negativ = overplanlagt. */
  remainingHours: number | null;
}

export interface TeacherSummary {
  teacherId: string;
  days: Figures[];
  week: Figures;
  blocksByDay: Block[][];
  bySubject: { id: string; minutes: number }[];
  byGroup: { id: string; minutes: number }[];
  blockCount: number;
  annual: Annual;
  missing: MissingField[];
}

export const duration = (b: Pick<Block, 'start' | 'end'>) => b.end - b.start;

/** Dagstal for én lærer ud fra faktisk undervisningstid U på en given ugedag. */
export function dayFigures(U: number, day: number, settings: Settings): Figures {
  const { prepPercent: p, saturdayPercent: s, prepBasis } = settings;
  let L: number | null;
  if (day !== SATURDAY || U === 0) L = 0;
  else L = s === null ? null : (U * s) / 100;

  let F: number | null;
  if (p === null) F = U === 0 ? 0 : null;
  else if (prepBasis === 'actual') F = (U * p) / 100;
  else F = L === null ? null : ((U + L) * p) / 100;

  const UF = F === null ? null : U + F;
  const K = F === null || L === null ? null : U + F + L;
  return { U, F, L, UF, K };
}

const sumNullable = (values: (number | null)[]) =>
  values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v as number), 0);

export function sumFigures(list: Figures[]): Figures {
  return {
    U: list.reduce((a, f) => a + f.U, 0),
    F: sumNullable(list.map((f) => f.F)),
    L: sumNullable(list.map((f) => f.L)),
    UF: sumNullable(list.map((f) => f.UF)),
    K: sumNullable(list.map((f) => f.K)),
  };
}

function addTo(list: { id: string; minutes: number }[], id: string, minutes: number) {
  const row = list.find((r) => r.id === id);
  if (row) row.minutes += minutes;
  else list.push({ id, minutes });
}

export function computeTeacherSummary(data: AppData, teacherId: string): TeacherSummary {
  const blocksByDay: Block[][] = Array.from({ length: DAY_COUNT }, () => []);
  const bySubject: { id: string; minutes: number }[] = [];
  const byGroup: { id: string; minutes: number }[] = [];
  for (const b of data.blocks) {
    if (!b.teacherIds.includes(teacherId)) continue;
    blocksByDay[b.day].push(b);
    addTo(bySubject, b.subjectId, duration(b));
    addTo(byGroup, b.groupId, duration(b));
  }
  for (const list of blocksByDay) list.sort((a, b) => a.start - b.start || a.end - b.end);
  bySubject.sort((a, b) => b.minutes - a.minutes);
  byGroup.sort((a, b) => b.minutes - a.minutes);

  const days = blocksByDay.map((list, day) =>
    dayFigures(
      list.reduce((a, b) => a + duration(b), 0),
      day,
      data.settings,
    ),
  );
  const week = sumFigures(days);

  const teacher = data.teachers.find((t) => t.id === teacherId);
  const expectedHours = teacher?.annualHours ?? null;
  const weeks = data.settings.teachingWeeks;
  const plannedHours = week.K === null || weeks === null ? null : (week.K * weeks) / 60;
  const remainingHours = plannedHours === null || expectedHours === null ? null : expectedHours - plannedHours;

  const missing: MissingField[] = [];
  if (data.settings.prepPercent === null) missing.push('prepPercent');
  if (data.settings.saturdayPercent === null) missing.push('saturdayPercent');
  if (weeks === null) missing.push('teachingWeeks');
  if (expectedHours === null) missing.push('annualHours');

  return {
    teacherId,
    days,
    week,
    blocksByDay,
    bySubject,
    byGroup,
    blockCount: blocksByDay.reduce((a, l) => a + l.length, 0),
    annual: { expectedHours, weeks, plannedHours, remainingHours },
    missing,
  };
}

export function computeAllSummaries(data: AppData): Map<string, TeacherSummary> {
  const map = new Map<string, TeacherSummary>();
  for (const t of data.teachers) map.set(t.id, computeTeacherSummary(data, t.id));
  return map;
}

/** Skemaets samlede mål: salstid (hver blok én gang) og lærertimer (pr. lærer på blokken). */
export function scheduleTotals(data: AppData) {
  let roomMinutes = 0;
  let teacherMinutes = 0;
  for (const b of data.blocks) {
    roomMinutes += duration(b);
    teacherMinutes += duration(b) * b.teacherIds.length;
  }
  return { roomMinutes, teacherMinutes, blockCount: data.blocks.length };
}

/** Forberedelsessatsen vist som minutter pr. 60 minutters undervisning. 25 % → 15. */
export const prepMinutesPerHour = (percent: number) => (60 * percent) / 100;
