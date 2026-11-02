// Klokkeslæt, dagdele og tidsformatering. Tider er hele minutter efter midnat.

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

/**
 * Kun til migrering af gamle data og forslag til egne tider: dagdel ud fra et klokkeslæt.
 * Grænserne er valgt efter skemadokumentets struktur (morgen slutter senest 9.55, formiddag
 * slutter senest 12.00, middag ligger 11.50–15.00, eftermiddag fra 16.10). Ny undervisning får
 * altid sin dagdel fra cellen, den placeres i.
 */
export function periodForClock(start: number): 0 | 1 | 2 | 3 {
  if (start < 600) return 0;
  if (start < 690) return 1;
  if (start < 960) return 2;
  return 3;
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
