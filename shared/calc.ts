// Den ENESTE beregningslogik for lærertimer. Bruges af timekolonnen, detaljer og sæsontal.
//
// Følger skolens timeopgørelse (Fernando_Mora_timer_26_27.docx):
//   Undervisning ma–fre (inkl. morgensamling)             U
//   Forberedelse ma–fre = U × p                            (p = fx 25 min pr. time)
//   Lørdag pr. lørdag    = lørdagstid × (1 + s)            (s = fx 25 % → × 1,25)
//   Forberedelse lørdag  = lørdag (inkl. tillæg) × p       (eller faktisk lørdagstid × p)
//   Lørdag pr. sæson     = pr. lørdag × antal lørdage;  pr. uge = pr. sæson / undervisningsuger
//   I alt pr. uge K      = U + forberedelse + lørdag (gns.) + forberedelse lørdag (gns.)
//   Til rådighed pr. uge = (kontrakttimer − orientering) ;  Timebank = til rådighed − K
// Afrunding: "steps" afrunder til hele minutter i hvert trin som dokumentet; "exact" bevarer
// fuld præcision og afrunder kun i visningen.
import { DAY_COUNT, SATURDAY, type AppData, type Block, type Settings } from './schema.js';

/** Dagstal for én forekomst af dagen (lørdag = én lørdag). */
export interface Figures {
  U: number;
  F: number | null;
  L: number | null;
  UF: number | null;
  K: number | null;
}

/** Ugens tal (lørdagene fordelt på undervisningsugerne). Alle værdier i minutter. */
export interface WeekTotals {
  /** Faktisk undervisning mandag–fredag (inkl. morgensamling). */
  weekdayU: number;
  /** Forberedelse mandag–fredag. */
  weekdayF: number | null;
  /** Lørdagsundervisning inkl. tillæg, gennemsnit pr. uge. */
  saturday: number | null;
  /** Forberedelse til lørdage, gennemsnit pr. uge. */
  saturdayF: number | null;
  /** Samlet medregnet tid pr. uge. */
  K: number | null;
}

export type MissingField = 'prepPercent' | 'saturdayPercent' | 'teachingWeeks' | 'saturdaysPerSeason' | 'contractHours' | 'orientationHours';

export const MISSING_LABELS: Record<MissingField, string> = {
  prepPercent: 'Forberedelse pr. undervisningstime',
  saturdayPercent: 'Lørdagstillæg',
  teachingWeeks: 'Antal undervisningsuger',
  saturdaysPerSeason: 'Antal lørdage pr. sæson',
  contractHours: 'Kontrakttimer pr. uge',
  orientationHours: 'Tid til orientering pr. uge',
};

export interface TeacherSummary {
  teacherId: string;
  /** Faktisk undervisning i grundugen (ma–lør), til lister og sortering. */
  teachingMinutes: number;
  days: Figures[];
  blocksByDay: Block[][];
  byTitle: { id: string; minutes: number }[];
  byGroup: { id: string; minutes: number }[];
  blockCount: number;
  assembly: { day: number; minutes: number; prepPercent: number | null } | null;
  /** Én lørdag: faktisk tid, tid inkl. tillæg og forberedelse. */
  saturday: { U: number; counted: number | null; F: number | null };
  /** Antal lørdage, der regnes med (lærerens eget eller skolens). */
  saturdays: number | null;
  /** Lørdage over hele sæsonen. */
  seasonSaturday: { counted: number | null; F: number | null };
  week: WeekTotals;
  contract: { hours: number | null; orientation: number | null; available: number | null };
  timebank: { week: number | null; season: number | null };
  /** Sæsontal i timer. */
  annual: { weeks: number | null; plannedHours: number | null; availableHours: number | null; timebankHours: number | null };
  missing: MissingField[];
}

export const duration = (b: Pick<Block, 'start' | 'end'>) => b.end - b.start;

/** Én undervisningspost for en lærer på en dag: varighed og den forberedelsessats, der gælder. */
export interface Item {
  minutes: number;
  prepPercent: number | null;
}

/** Dagstal (fuld præcision) for én forekomst af en dag. L = U × s/100 om lørdagen. */
export function dayItemsFigures(items: Item[], day: number, settings: Settings): Figures {
  const { saturdayPercent: s, prepBasis } = settings;
  const U = items.reduce((a, i) => a + i.minutes, 0);
  const sat = day === SATURDAY;
  const L = !sat || U === 0 ? 0 : s === null ? null : (U * s) / 100;
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
    F += ((prepBasis === 'actual' ? i.minutes : i.minutes + (itemL as number)) * i.prepPercent) / 100;
  }
  const UF = F === null ? null : U + F;
  const K = F === null || L === null ? null : U + F + L;
  return { U, F, L, UF, K };
}

/** Dagstal når al undervisning har den fælles sats. */
export function dayFigures(U: number, day: number, settings: Settings): Figures {
  return dayItemsFigures([{ minutes: U, prepPercent: settings.prepPercent }], day, settings);
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

const add = (...v: (number | null)[]) => (v.some((x) => x === null) ? null : v.reduce<number>((a, x) => a + (x as number), 0));
const mul = (a: number | null, b: number | null) => (a === null || b === null ? null : a * b);

/** Forberedelse for en liste poster (sats pr. post), før afrunding. null = sats mangler. */
function prepOf(items: Item[], factor = 1): number | null {
  let F = 0;
  for (const i of items) {
    if (i.minutes === 0) continue;
    if (i.prepPercent === null) return null;
    F += (i.minutes * factor * i.prepPercent) / 100;
  }
  return F;
}

export function computeTeacherSummary(data: AppData, teacherId: string): TeacherSummary {
  const st = data.settings;
  const r = st.rounding === 'steps' ? Math.round : (x: number) => x;
  const R = (x: number | null) => (x === null ? null : r(x));

  const blocksByDay: Block[][] = Array.from({ length: DAY_COUNT }, () => []);
  const byTitle: { id: string; minutes: number }[] = [];
  const byGroup: { id: string; minutes: number }[] = [];
  for (const b of data.blocks) {
    if (!b.teacherIds.includes(teacherId)) continue;
    blocksByDay[b.day].push(b);
    addTo(byTitle, b.title, duration(b));
    // En klasse med flere hold tælles én gang for læreren.
    addTo(byGroup, b.groupIds.join('+'), duration(b));
  }
  for (const list of blocksByDay) list.sort((a, b) => a.start - b.start || a.end - b.end);
  byTitle.sort((a, b) => b.minutes - a.minutes);
  byGroup.sort((a, b) => b.minutes - a.minutes);

  const a = st.assembly;
  const assembly =
    a.enabled && a.teacherId === teacherId && data.teachers.some((t) => t.id === teacherId)
      ? { day: a.day, minutes: a.end - a.start, prepPercent: assemblyPrepPercent(st) }
      : null;

  const itemsByDay = blocksByDay.map((list, day) => {
    const items: Item[] = list.map((b) => ({ minutes: duration(b), prepPercent: b.noPrep ? 0 : st.prepPercent }));
    if (assembly && assembly.day === day) items.push({ minutes: assembly.minutes, prepPercent: assembly.prepPercent });
    return items;
  });
  const days = itemsByDay.map((items, day) => dayItemsFigures(items, day, st));

  // Mandag–fredag
  const weekdayItems = itemsByDay.slice(0, SATURDAY).flat();
  const weekdayU = weekdayItems.reduce((n, i) => n + i.minutes, 0);
  const weekdayF = R(prepOf(weekdayItems));

  // Én lørdag
  const satItems = itemsByDay[SATURDAY];
  const satU = satItems.reduce((n, i) => n + i.minutes, 0);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const saturdays = teacher?.saturdays ?? st.saturdaysPerSeason;
  const W = st.teachingWeeks;
  let saturday: TeacherSummary['saturday'] = { U: 0, counted: 0, F: 0 };
  let seasonSaturday: TeacherSummary['seasonSaturday'] = { counted: 0, F: 0 };
  let weekSat: number | null = 0;
  let weekSatF: number | null = 0;
  if (satU > 0) {
    const factor = st.saturdayPercent === null ? null : 1 + st.saturdayPercent / 100;
    const counted = R(mul(satU, factor));
    let satF: number | null;
    if (st.prepBasis === 'withSaturday') {
      // Forberedelse af lørdagstiden inkl. tillæg (som dokumentet: 3 t 51 min × 25 min pr. time).
      const avgP = prepOf(satItems);
      satF = counted === null || avgP === null ? null : R((counted * avgP) / satU);
    } else satF = R(prepOf(satItems));
    saturday = { U: satU, counted, F: satF };
    seasonSaturday = { counted: mul(counted, saturdays), F: mul(satF, saturdays) };
    weekSat = W === null || W === 0 || seasonSaturday.counted === null ? null : r(seasonSaturday.counted / W);
    weekSatF = W === null || W === 0 || seasonSaturday.F === null ? null : r(seasonSaturday.F / W);
  }
  const K = add(weekdayU, weekdayF, weekSat, weekSatF);
  const week: WeekTotals = { weekdayU, weekdayF, saturday: weekSat, saturdayF: weekSatF, K };

  // Kontrakt og timebank
  const hours = teacher?.contractHours ?? null;
  const orientation = teacher?.orientationHours ?? st.orientationHours;
  const available = hours === null || orientation === null ? null : (hours - orientation) * 60;
  const tbWeek = available === null || K === null ? null : available - K;
  const tbSeason = mul(tbWeek, W);

  const missing: MissingField[] = [];
  if (st.prepPercent === null && weekdayU + satU > 0) missing.push('prepPercent');
  if (satU > 0 && st.saturdayPercent === null) missing.push('saturdayPercent');
  if (W === null) missing.push('teachingWeeks');
  if (satU > 0 && saturdays === null) missing.push('saturdaysPerSeason');
  if (hours === null) missing.push('contractHours');
  if (orientation === null) missing.push('orientationHours');

  return {
    teacherId,
    teachingMinutes: weekdayU + satU,
    days,
    blocksByDay,
    byTitle,
    byGroup,
    blockCount: blocksByDay.reduce((n, l) => n + l.length, 0),
    assembly,
    saturday,
    saturdays,
    seasonSaturday,
    week,
    contract: { hours, orientation, available },
    timebank: { week: tbWeek, season: tbSeason },
    annual: {
      weeks: W,
      plannedHours: K === null || W === null ? null : (K * W) / 60,
      availableHours: available === null || W === null ? null : (available * W) / 60,
      timebankHours: tbSeason === null ? null : tbSeason / 60,
    },
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
/** Minutter pr. undervisningstime → procent. 25 min → 41,67 %. */
export const prepPercentFromMinutes = (minutes: number) => (minutes / 60) * 100;
