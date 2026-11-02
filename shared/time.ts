// Klokkeslæt, dagdele og tidsformatering. Tider er hele minutter efter midnat.

export const DAYPARTS = ['Morgen', 'Formiddag', 'Eftermiddag', 'Aften'] as const;
export type DaypartIndex = 0 | 1 | 2 | 3;

const pad = (n: number) => String(n).padStart(2, '0');

/** 590 → "09.50" (dansk notation med punktum). 1440 → "24.00". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}.${pad(m)}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}

/**
 * Fortolker brugerindtastet klokkeslæt: "9", "09", "9.30", "9:30", "0930", "930", "21,15".
 * Returnerer minutter eller null ved ugyldigt input. "24.00" tillades (dagens slutning).
 */
export function parseClock(input: string): number | null {
  const s = input.trim().replace(/^kl\.?\s*/i, '');
  if (!s) return null;
  let h: number;
  let m: number;
  const sep = s.match(/^(\d{1,2})[.:,](\d{2})$/);
  if (sep) {
    h = Number(sep[1]);
    m = Number(sep[2]);
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    m = 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, s.length - 2));
    m = Number(s.slice(-2));
  } else {
    return null;
  }
  if (m > 59) return null;
  if (h === 24 && m === 0) return 1440;
  if (h > 23) return null;
  return h * 60 + m;
}

/** Dagdel for en starttid ud fra de tre starttidspunkter for formiddag/eftermiddag/aften. */
export function daypartOf(start: number, starts: readonly [number, number, number]): DaypartIndex {
  if (start >= starts[2]) return 3;
  if (start >= starts[1]) return 2;
  if (start >= starts[0]) return 1;
  return 0;
}

/** Tidsinterval for en dagdel [fra, til). */
export function daypartRange(
  daypart: DaypartIndex,
  starts: readonly [number, number, number],
): { from: number; to: number } {
  const bounds = [0, starts[0], starts[1], starts[2], 1440];
  return { from: bounds[daypart], to: bounds[daypart + 1] };
}

/** Kort beskrivelse af en dagdel, fx "før 10.00" eller "13.00–18.00". */
export function daypartLabel(daypart: DaypartIndex, starts: readonly [number, number, number]): string {
  const { from, to } = daypartRange(daypart, starts);
  if (daypart === 0) return `før ${formatClock(to)}`;
  if (daypart === 3) return `fra ${formatClock(from)}`;
  return `${formatClock(from)}–${formatClock(to)}`;
}

/** Standardforslag til starttid for en ny blok i en dagdel uden andre blokke. */
export function defaultStartForDaypart(daypart: DaypartIndex, starts: readonly [number, number, number]): number {
  if (daypart === 0) return Math.max(0, Math.min(480, starts[0] - 60)); // 08.00
  return daypartRange(daypart, starts).from;
}

/**
 * Forslag til starttid i en målcelle: efter sidste eksisterende blok i dagdelen, hvis den
 * stadig starter i dagdelen; ellers dagdelens standardstart. Varigheden skal kunne nås inden midnat.
 */
export function suggestStart(
  daypart: DaypartIndex,
  starts: readonly [number, number, number],
  duration: number,
  existingEnds: number[],
): number {
  const { from, to } = daypartRange(daypart, starts);
  let start = defaultStartForDaypart(daypart, starts);
  const lastEnd = existingEnds.length ? Math.max(...existingEnds) : null;
  if (lastEnd !== null && lastEnd >= from && lastEnd < to) start = Math.max(start, lastEnd);
  return Math.max(0, Math.min(start, 1440 - duration));
}

export interface Interval {
  start: number;
  end: number;
}

/**
 * Finder en ledig starttid for en blok med given varighed, så den ikke overlapper de
 * optagede intervaller (fx samme sal, hold eller lærer samme dag). Prioritet:
 * 1) første ledige tid fra `preferred` inden for `range`, 2) seneste ledige tid før
 * `preferred` inden for `range` (kun hvis `stayInRange`), 3) første ledige tid efter `preferred`.
 */
export function findFreeStart(opts: {
  preferred: number;
  duration: number;
  busy: Interval[];
  range: { from: number; to: number };
  stayInRange?: boolean;
}): number {
  const { preferred, duration, busy, range } = opts;
  const fits = (c: number) => c >= 0 && c + duration <= 1440;
  const free = (c: number) => !busy.some((b) => c < b.end && b.start < c + duration);
  const inRange = (c: number) => c >= range.from && c < range.to;
  const cands = [...new Set([preferred, ...busy.map((b) => b.end), ...busy.map((b) => b.start - duration)])]
    .filter(fits)
    .sort((a, b) => a - b);
  const after = cands.filter((c) => c >= preferred && free(c));
  const inside = after.find(inRange);
  if (inside !== undefined) return inside;
  if (opts.stayInRange) {
    const before = cands.filter((c) => c < preferred && free(c) && inRange(c));
    if (before.length) return before[before.length - 1];
  }
  if (after.length) return after[0];
  return Math.max(0, Math.min(preferred, 1440 - duration));
}

// ---- Varigheder ----------------------------------------------------------

/** 90 → "1 t 30 min", 120 → "2 t", 25 → "25 min". Afrunder kun til visning. null → "—". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const sign = minutes < 0 ? '−' : '';
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${sign}${m} min`;
  if (m === 0) return `${sign}${h} t`;
  return `${sign}${h} t ${m} min`;
}

const decimalFmt = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoursFmt = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Minutter som decimaltimer: 90 → "1,50 t". Altid med "t" så det ikke forveksles med klokkeslæt. */
export function formatDecimalHours(minutes: number | null): string {
  if (minutes === null) return '—';
  return `${decimalFmt.format(minutes / 60).replace('-', '−')} t`;
}

/** Timetal (fx årstimer): 1384 → "1.384 t", 12.5 → "12,5 t". */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  return `${hoursFmt.format(hours).replace('-', '−')} t`;
}

export function formatNumber(n: number, maxDigits = 2): string {
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits: maxDigits }).format(n);
}
