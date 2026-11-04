// Åbne spørgsmål til skolen. Hvert svar gemmes i indstillingerne og anvendes straks på data
// (én fortrydbar handling). Spørgsmålene stammer fra skemadokumentet (KDS) og timeopgørelsen (FM 26/27).
import { nextTeacherColor } from '../../shared/colors';
import { recomputeRuleBlocks } from '../../shared/rules';
import { MAX_ROOM_COUNT, type AppData, type Teacher } from '../../shared/schema';
import { K_ROOM_ID, sourceWeek, groupIdFor } from '../../shared/source/index';

export interface Answer {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  title: string;
  context: string;
  answers: Answer[];
  /** Anvend svaret på data (rent – returnerer nye data). */
  apply: (data: AppData, value: string) => AppData;
}

const norm = (s: string) => s.trim().toUpperCase();

function teacherByInitials(data: AppData, initials: string): { data: AppData; id: string } {
  const t = data.teachers.find((x) => norm(x.initials) === initials);
  if (t) return { data, id: t.id };
  const nt: Teacher = {
    id: `t-${initials.toLowerCase()}`,
    initials,
    name: '',
    color: nextTeacherColor(data.teachers.map((x) => x.color)),
    annualHours: null,
    contractHours: null,
    orientationHours: null,
    saturdays: null,
    archived: false,
  };
  return { data: { ...data, teachers: [...data.teachers, nt] }, id: nt.id };
}

const isMarked = (note: string) => /÷\s*p/.test(note);

export const QUESTIONS: Question[] = [
  {
    id: 'rounding',
    title: 'Skal timerne afrundes som i timeopgørelsen?',
    context:
      'FM’s timeopgørelse afrunder til hele minutter i hvert trin og får 7 t 52 min i timebank pr. uge (322 t 32 min i sæsonen). Regnes der helt præcist, bliver det 7 t 51 min (321 t 41 min).',
    answers: [
      { value: 'steps', label: 'Ja, som timeopgørelsen' },
      { value: 'exact', label: 'Nej, regn præcist' },
    ],
    apply: (d, v) => ({ ...d, settings: { ...d.settings, rounding: v === 'exact' ? 'exact' : 'steps' } }),
  },
  {
    id: 'weeks',
    title: 'Gælder 41 undervisningsuger og 18 lørdage for alle lærere?',
    context: 'Tallene står i FM’s timeopgørelse. Varierer antallet af lørdage, kan det sættes pr. lærer under Arbejdstid → Kontrakt og timebank.',
    answers: [
      { value: 'yes', label: 'Ja, for alle' },
      { value: 'varies', label: 'Nej, det varierer' },
    ],
    apply: (d) => d,
  },
  {
    id: 'orientation',
    title: 'Har alle lærere 1 time om ugen til orientering og mails?',
    context: 'FM’s kontrakt: 26 t pr. uge, heraf 1 time til at holde sig orienteret på platforme og læse/skrive mails. Kan sættes pr. lærer, hvis det varierer.',
    answers: [
      { value: 'yes', label: 'Ja, alle' },
      { value: 'varies', label: 'Nej, det varierer' },
    ],
    apply: (d) => d,
  },
  {
    id: 'assemblyTeacher',
    title: 'Hvem har morgensamlingen om fredagen?',
    context: 'KDS-arket (D26) angiver "DT/CO". Kun den valgte lærer får de 10 minutter (plus forberedelse) med i sine timer.',
    answers: [
      { value: 'DT', label: 'DT' },
      { value: 'CO', label: 'CO' },
      { value: 'none', label: 'Ingen / de skiftes' },
    ],
    apply: (d, v) => {
      if (v === 'none') return { ...d, settings: { ...d.settings, assembly: { ...d.settings.assembly, teacherId: null } } };
      const r = teacherByInitials(d, v);
      return { ...r.data, settings: { ...r.data.settings, assembly: { ...r.data.settings.assembly, teacherId: r.id } } };
    },
  },
  {
    id: 'noPrep',
    title: 'Betyder "÷ p" i skemaet, at klassen er uden forberedelse?',
    context: 'Markeringen står ved bl.a. Fysisk, One2One, Contemp. og Kompagni B. Svarer du ja, får klasser med markeringen ingen forberedelse (kan ændres på den enkelte klasse).',
    answers: [
      { value: 'yes', label: 'Ja, uden forberedelse' },
      { value: 'no', label: 'Nej, ignorér markeringen' },
    ],
    apply: (d, v) => ({ ...d, blocks: d.blocks.map((b) => (isMarked(b.note) ? { ...b, noPrep: v === 'yes' } : b)) }),
  },
  {
    id: 'kRoom',
    title: 'Skal K-salen have sin egen kolonne i skemaet?',
    context:
      'Skemadokumentet har ni rum: 7 balletsale, K-salen og Motionsrum. Appen har otte kolonner, så tre klasser i K-salen (KDS P5, P6 og P29) er ikke placeret, og deres timer tæller ikke med.',
    answers: [
      { value: 'yes', label: 'Ja, tilføj K-salen' },
      { value: 'no', label: 'Nej, otte kolonner' },
    ],
    apply: (d, v) => {
      if (v !== 'yes' || d.rooms.some((r) => r.id === K_ROOM_ID) || d.rooms.length >= MAX_ROOM_COUNT) return d;
      const gym = d.rooms.findIndex((r) => r.id === 'room-gym');
      const rooms = [...d.rooms];
      rooms.splice(gym < 0 ? rooms.length : gym, 0, { id: K_ROOM_ID, name: 'K-salen' });
      let next: AppData = { ...d, rooms };
      // Er ugeskemaet indlæst fra kilden, placeres K-salens klasser også.
      if (d.blocks.some((b) => b.id.startsWith('kds-'))) {
        const w = sourceWeek(next).data;
        const add = w.blocks.filter((b) => b.roomId === K_ROOM_ID && !d.blocks.some((x) => x.id === b.id));
        const teacherIds = new Set(add.flatMap((b) => b.teacherIds));
        const teachers = [...next.teachers, ...w.teachers.filter((t) => teacherIds.has(t.id) && !next.teachers.some((x) => x.id === t.id))];
        next = { ...next, teachers, blocks: [...next.blocks, ...add.map((b) => ({ ...b, noPrep: isMarked(b.note) && d.settings.answers.noPrep?.answer === 'yes' }))] };
      }
      return next;
    },
  },
  {
    id: 'subgroups',
    title: 'Er "Hold 6 piger", "Hold 5 & 6 drenge" og "Hold 5 piger" egne hold?',
    context: 'De står torsdag morgen i KDS-arket (B22, L22, N22) og er oprettet som egne hold med egne tider.',
    answers: [
      { value: 'yes', label: 'Ja, det er rigtigt' },
      { value: 'no', label: 'Nej (noteres)' },
    ],
    apply: (d) => d,
  },
  {
    id: 'hold1',
    title: 'Skal Hold 1 med i skemaet?',
    context: 'Hold 1 står ikke i KDS-arket og findes derfor ikke i appen. Opretter du holdet, får dets klasser dagdelenes standardtider, indtil der er tider for holdet.',
    answers: [
      { value: 'no', label: 'Nej, ikke i denne sæson' },
      { value: 'yes', label: 'Ja, opret Hold 1' },
    ],
    apply: (d, v) =>
      v === 'yes' && !d.groups.some((g) => g.name.trim().toLowerCase() === 'hold 1')
        ? { ...d, groups: [{ id: groupIdFor('Hold 1'), name: 'Hold 1', archived: false }, ...d.groups] }
        : d,
  },
];

/** Svar på et spørgsmål: gem svaret og anvend det; regelklassernes tider holdes i trit. */
export function answerQuestion(data: AppData, q: Question, value: string): AppData {
  const applied = q.apply(data, value);
  const withAnswer: AppData = {
    ...applied,
    settings: { ...applied.settings, answers: { ...applied.settings.answers, [q.id]: { answer: value, at: new Date().toISOString() } } },
  };
  return recomputeRuleBlocks(withAnswer).data;
}

/** Lærere med undervisning, der mangler kontrakttimer. */
export function teachersMissingContract(data: AppData) {
  const teaching = new Set(data.blocks.flatMap((b) => b.teacherIds));
  return data.teachers.filter((t) => !t.archived && t.contractHours === null && teaching.has(t.id));
}

/** Antal åbne punkter (ubesvarede spørgsmål + lærere uden kontrakt) – vises som prik på tandhjulet. */
export function openCount(data: AppData) {
  return QUESTIONS.filter((q) => !data.settings.answers[q.id]).length + teachersMissingContract(data).length;
}
