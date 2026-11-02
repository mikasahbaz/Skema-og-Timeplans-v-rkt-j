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
  byTitle: { id: string; minutes: number }[];
  byGroup: { id: string; minutes: number }[];
  blockCount: number;
  /** Morgensamlingen, hvis læreren er tilknyttet (indgår én gang i dagens tal). */
  assembly: { day: number; minutes: number; prepPercent: number | null } | null;
  annual: Annual;
  missing: MissingField[];
}

export const duration = (b: Pick<Block, 'start' | 'end'>) => b.end - b.start;

/** Én undervisningspost for en lærer på en dag: varighed og den forberedelsessats, der gælder. */
export interface Item {
  minutes: number;
  prepPercent: number | null;
}

/**
 * Dagstal for én lærer. L = U × s/100 om lørdagen. F beregnes pr. post med postens sats
 * (klasser bruger den fælles sats p; morgensamlingen kan have sin egen).
 */
export function dayItemsFigures(items: Item[], day: number, settings: Settings): Figures {
  const { saturdayPercent: s, prepBasis } = settings;
  const U = items.reduce((a, i) => a + i.minutes, 0);
  const sat = day === SATURDAY;
  let L: number | null;
  if (!sat || U === 0) L = 0;
  else L = s === null ? null : (U * s) / 100;

  let F: number | null = 0;
  for (const i of items) {
    if (i.minutes === 0) continue;
    if (i.prepPercent === null) {
      F = null;
      break;
    }
    const itemL = sat ? (s === null ? null : (i.minutes * s) / 100) : 0;
    if (prepBasis === 'withSaturday' && itemL === null) {
      F = null;
      break;
    }
    const basis = prepBasis === 'actual' ? i.minutes : i.minutes + (itemL as number);
    F += (basis * i.prepPercent) / 100;
  }

  const UF = F === null ? null : U + F;
  const K = F === null || L === null ? null : U + F + L;
  return { U, F, L, UF, K };
}

/** Dagstal når al undervisning har den fælles sats (bevaret til tests og enkle beregninger). */
export function dayFigures(U: number, day: number, settings: Settings): Figures {
  return dayItemsFigures([{ minutes: U, prepPercent: settings.prepPercent }], day, settings);
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

/** Forberedelsessats for morgensamlingen ud fra indstillingen. */
export function assemblyPrepPercent(settings: Settings): number | null {
  const a = settings.assembly;
  if (a.prepMode === 'none') return 0;
  if (a.prepMode === 'custom') return a.prepPercent;
  return settings.prepPercent;
}

export function computeTeacherSummary(data: AppData, teacherId: string): TeacherSummary {
  const blocksByDay: Block[][] = Array.from({ length: DAY_COUNT }, () => []);
  const byTitle: { id: string; minutes: number }[] = [];
  const byGroup: { id: string; minutes: number }[] = [];
  for (const b of data.blocks) {
    if (!b.teacherIds.includes(teacherId)) continue;
    blocksByDay[b.day].push(b);
    addTo(byTitle, b.title, duration(b));
    // En klasse med flere hold tælles én gang for læreren; fordelingen viser holdsættet samlet.
    addTo(byGroup, b.groupIds.join('+'), duration(b));
  }
  for (const list of blocksByDay) list.sort((a, b) => a.start - b.start || a.end - b.end);
  byTitle.sort((a, b) => b.minutes - a.minutes);
  byGroup.sort((a, b) => b.minutes - a.minutes);

  const a = data.settings.assembly;
  const assembly =
    a.enabled && a.teacherId === teacherId && data.teachers.some((t) => t.id === teacherId)
      ? { day: a.day, minutes: a.end - a.start, prepPercent: assemblyPrepPercent(data.settings) }
      : null;

  const days = blocksByDay.map((list, day) => {
    const items: Item[] = list.map((b) => ({ minutes: duration(b), prepPercent: data.settings.prepPercent }));
    if (assembly && assembly.day === day) items.push({ minutes: assembly.minutes, prepPercent: assembly.prepPercent });
    return dayItemsFigures(items, day, data.settings);
  });
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
    byTitle,
    byGroup,
    blockCount: blocksByDay.reduce((n, l) => n + l.length, 0),
    assembly,
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
