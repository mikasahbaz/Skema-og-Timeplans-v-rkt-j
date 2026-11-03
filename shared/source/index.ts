// Skolens skemadokument som kilde: afledte tidsregler, morgensamling, hold og (valgfrit) ugeskema.
// Kilden er arket "KDS" i Balletskole_Skema_26_27_Master_fra_uge_43 (bekræftet af skolen).
import { nextTeacherColor } from '../colors.js';
import { deriveStandardTimes } from '../rules.js';
import { DEFAULT_TITLE, FRIDAY, type AppData, type Assembly, type Block, type Group, type Teacher, type TimeRule } from '../schema.js';
import { SOURCE } from './kds.js';

export { SOURCE };
export const SOURCE_NAME = `${SOURCE.file.replace(/\.xlsx$/, '')}, ark "${SOURCE.sheet.trim()}"`;

type Entry = (typeof SOURCE.entries)[number];

/** Kildens ni rumkolonner → appens otte. K-salen (kolonne 7 i kilden) har ingen kolonne i appen. */
export const SOURCE_ROOM_TO_APP: (number | null)[] = [0, 1, 2, 3, 4, 5, 6, null, 7];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const groupIdFor = (name: string) => `g-${slug(name)}`;
const norm = (s: string) => s.trim().toLocaleLowerCase('da-DK').replace(/\s+/g, ' ');

/** Alle holdnavne i kilden (inkl. undergrupper som "Hold 6 piger"), i naturlig rækkefølge. */
export function sourceGroupNames(): string[] {
  const names = new Set<string>();
  for (const e of SOURCE.entries) for (const g of e.groups) names.add(g);
  for (const g of SOURCE.assembly?.groups ?? []) names.add(g);
  return [...names].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
}

/** Sikrer, at kildens hold findes (matcher eksisterende hold på navn). Returnerer navn → id. */
export function ensureSourceGroups(groups: Group[]): { groups: Group[]; idByName: Map<string, string> } {
  const out = [...groups];
  const idByName = new Map<string, string>();
  for (const name of sourceGroupNames()) {
    const existing = out.find((g) => norm(g.name) === norm(name));
    if (existing) idByName.set(name, existing.id);
    else {
      const id = groupIdFor(name);
      out.push({ id, name, archived: false });
      idByName.set(name, id);
    }
  }
  return { groups: out, idByName };
}

const ruleKey = (e: Pick<Entry, 'groups' | 'day' | 'period'>) => `${[...e.groups].sort().join('|')}#${e.day}#${e.period}`;

/**
 * Tidsregler fra kilden. Én regel pr. (holdsæt, ugedag, dagdel, tidsrum). Samme tidsrum i flere
 * celler (fx One2One i to sale) bliver én regel med flere kildehenvisninger. Forskellige tidsrum
 * for samme hold, dag og dagdel bliver separate varianter. Tomme celler giver ingen regler.
 */
export function sourceRules(idByName: Map<string, string>): TimeRule[] {
  const map = new Map<string, { entries: Entry[] }>();
  for (const e of SOURCE.entries) {
    if (!e.groups.length) continue; // fx personalemøde: ikke en klasse
    const k = `${ruleKey(e)}#${e.start}-${e.end}`;
    const cur = map.get(k) ?? { entries: [] };
    cur.entries.push(e);
    map.set(k, cur);
  }
  const rules: TimeRule[] = [];
  for (const { entries } of map.values()) {
    const e = entries[0];
    const groupIds = e.groups.map((g) => idByName.get(g)!);
    const labels = [...new Map(entries.map((x) => [norm(x.activity), x.activity.trim()])).values()].filter(Boolean);
    const marked = entries.some((x) => x.mark);
    rules.push({
      id: `r-${e.day}-${e.period}-${groupIds.map((g) => g.replace(/^g-/, '')).join('+')}-${e.start}-${e.end}`,
      groupIds,
      day: e.day,
      period: e.period,
      start: e.start,
      end: e.end,
      label: labels.join(' / '),
      note: marked ? 'Kilden er markeret "÷ p" (betydning ikke afklaret – bruges ikke i beregningen).' : '',
      source: entries.map((x) => x.source.replace(/\s+!/, '!')).join(', '),
    });
  }
  return rules.sort((a, b) => a.day - b.day || a.period - b.period || a.start - b.start || a.id.localeCompare(b.id));
}

/** Morgensamlingen fra kilden. Lærer vælges i Indstillinger (kilden angiver "DT/CO"). */
export function sourceAssembly(idByName: Map<string, string>): Assembly {
  const a = SOURCE.assembly;
  if (!a)
    return { enabled: false, day: FRIDAY, start: 490, end: 500, groupIds: [], location: '', teacherId: null, prepMode: 'same', prepPercent: null, source: '' };
  return {
    enabled: true,
    day: a.day,
    start: a.start,
    end: a.end,
    groupIds: a.groups.map((g) => idByName.get(g)!).filter(Boolean),
    location: a.location,
    teacherId: null,
    prepMode: 'same',
    prepPercent: null,
    source: `${a.source.replace(/\s+!/, '!')}: "${a.raw}"`,
  };
}

/** Tilføjer kildens hold, tidsregler og morgensamling til data (uden at røre klasser og lærere). */
export function withSourceRules(data: AppData): AppData {
  const { groups, idByName } = ensureSourceGroups(data.groups);
  const timeRules = sourceRules(idByName);
  return { ...data, groups, timeRules, settings: { ...data.settings, assembly: sourceAssembly(idByName), standardTimes: deriveStandardTimes(timeRules) } };
}

/**
 * Kildens ugeskema som klasser (bevidst tilvalg under Indstillinger og i prøveversionen).
 * Klasser i K-salen kan ikke placeres i appens otte kolonner og returneres i `unplaced`.
 */
export function sourceWeek(data: AppData): { data: AppData; unplaced: Entry[]; skipped: Entry[] } {
  const base = withSourceRules(data);
  const { idByName } = ensureSourceGroups(base.groups);
  const teachers: Teacher[] = [...base.teachers];
  const teacherId = (initials: string) => {
    const t = teachers.find((x) => norm(x.initials) === norm(initials));
    if (t) return t.id;
    const nt: Teacher = {
      id: `t-${slug(initials)}`,
      initials,
      name: '',
      color: nextTeacherColor(teachers.map((x) => x.color)),
      annualHours: null,
      archived: false,
    };
    teachers.push(nt);
    return nt.id;
  };
  const blocks: Block[] = [];
  const unplaced: Entry[] = [];
  const skipped: Entry[] = [];
  for (const e of SOURCE.entries) {
    if (!e.groups.length || !e.teachers.length) {
      skipped.push(e);
      continue;
    }
    const roomIndex = SOURCE_ROOM_TO_APP[e.room];
    if (roomIndex === null) {
      unplaced.push(e);
      continue;
    }
    const groupIds = e.groups.map((g) => idByName.get(g)!);
    const rule = base.timeRules.find((r) => r.day === e.day && r.period === e.period && r.start === e.start && r.end === e.end && r.groupIds.join() === groupIds.join());
    blocks.push({
      id: `kds-${e.source.replace(/[^A-Za-z0-9]/g, '')}`,
      title: e.activity.trim() || DEFAULT_TITLE,
      groupIds,
      teacherIds: [...new Set(e.teachers.map(teacherId))].slice(0, 2),
      day: e.day,
      period: e.period,
      roomId: base.rooms[roomIndex].id,
      start: e.start,
      end: e.end,
      timeMode: 'rule',
      ruleId: rule?.id ?? null,
      note: e.mark ? '÷ p (fra kilden)' : '',
    });
  }
  return { data: { ...base, teachers, blocks }, unplaced, skipped };
}

/** Kendte usikkerheder og spørgsmål til kilden (vises under Indstillinger → Tidsregler). */
export const SOURCE_ISSUES: { ref: string; text: string }[] = [
  {
    ref: 'KDS!P5, P6, P29',
    text: 'Kilden har ni rum (7 balletsale, K-salen og Motionsrum). Appen har otte kolonner, så K-salen har ingen kolonne. Tre klasser i K-salen placeres ikke ved indlæsning af ugeskemaet; deres tidsregler findes dog.',
  },
  { ref: 'KDS!D26', text: 'Morgensamlingen angiver "DT/CO". Appen tilknytter én lærer; vælg den under Morgensamling.' },
  { ref: 'Flere celler', text: '"÷ p" er ikke forklaret i kilden. Markeringen vises som note, men ændrer ikke forberedelsen.' },
  {
    ref: 'KDS!B22, L22, N22',
    text: 'Torsdag morgen har undergrupperne "Hold 6 piger", "Hold 5 & 6 drenge" og "Hold 5 piger". De er oprettet som egne hold med egne tidsregler.',
  },
  { ref: 'Flere celler', text: 'Forkortelser som POINT, BV, PDD, Bourn, Tech/rep og Contemp. bevares som tekst og fortolkes ikke.' },
  { ref: 'KDS!L12', text: 'Cellen indeholder kun et komma og er ignoreret.' },
  { ref: 'KDS (hele arket)', text: 'Hold 1 forekommer ikke i KDS-arket og har derfor ingen tidsregler.' },
];
