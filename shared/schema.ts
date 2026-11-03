// Datamodel og strukturel validering, delt mellem klient og server.
// Version 2: klasser har titel, ét eller flere hold, dagdel og en tidsmodel
// ("rule" = tid fra tidstabellen, "custom" = egne tider). Se SPEC.md.
import { z } from 'zod';

// Danske standardbeskeder for valideringsfejl, der ikke har en egen tekst.
z.config(z.locales.da());

export const DAY_COUNT = 6; // mandag (0) … lørdag (5)
export const SATURDAY = 5;
export const FRIDAY = 4;
export const ROOM_COUNT = 8;
export const PERIOD_COUNT = 4; // Morgen, Formiddag, Middag, Eftermiddag (som i skemadokumentet)
export const MAX_TEACHERS_PER_BLOCK = 2;
export const MAX_GROUPS_PER_BLOCK = 4;
export const SCHEMA_VERSION = 3;
export const DEFAULT_TITLE = 'Balletklasse';

const id = z.string().trim().min(1, 'Mangler id').max(80);
const minutes = (label: string) => z.number().int(`${label} skal være hele minutter`).min(0).max(1440);
const nullableNumber = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label} skal være et tal` })
    .min(min, `${label} skal være mindst ${min}`)
    .max(max, `${label} må højst være ${max}`)
    .nullable();

export const teacherSchema = z.object({
  id,
  initials: z.string().trim().min(1, 'Initialer mangler').max(6, 'Initialer må højst have 6 tegn'),
  name: z.string().trim().max(80).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farve skal være en hex-farve som #a1b2c3'),
  annualHours: nullableNumber(0, 5000, 'Årsarbejdstimer'),
  archived: z.boolean().default(false),
});

export const groupSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Holdets navn mangler').max(80),
  archived: z.boolean().default(false),
});

export const roomSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Salens navn mangler').max(40),
});

const groupIds = z
  .array(id)
  .min(1, 'Vælg mindst ét hold')
  .max(MAX_GROUPS_PER_BLOCK, `Højst ${MAX_GROUPS_PER_BLOCK} hold på én klasse`);

/** Én dokumenteret tidsmulighed: hold (eller kombination) + ugedag + dagdel → tidsrum. */
export const timeRuleSchema = z.object({
  id,
  groupIds,
  day: z.number().int().min(0).max(DAY_COUNT - 1),
  period: z.number().int().min(0).max(PERIOD_COUNT - 1),
  start: minutes('Starttid'),
  end: minutes('Sluttid'),
  /** Kort navn på varianten, fx aktiviteten i kilden ("Fysisk", "POINT"). */
  label: z.string().trim().max(60).default(''),
  note: z.string().trim().max(300).default(''),
  /** Henvisning til kilden, fx "KDS !B4", eller "Manuel". */
  source: z.string().trim().max(200).default(''),
});

export const blockSchema = z.object({
  id,
  title: z.string().trim().min(1, 'Titel mangler').max(60, 'Titlen må højst have 60 tegn'),
  groupIds,
  teacherIds: z
    .array(id)
    .min(1, 'Vælg mindst én lærer')
    .max(MAX_TEACHERS_PER_BLOCK, 'Højst to lærere pr. klasse'),
  day: z.number().int().min(0).max(DAY_COUNT - 1),
  /** Visuel dagdel. For regelklasser = reglens dagdel; for egne tider uafhængig af klokkeslættet. */
  period: z.number().int().min(0).max(PERIOD_COUNT - 1),
  roomId: id,
  start: minutes('Starttid'),
  end: minutes('Sluttid'),
  /** Tidsmodel: "rule" = tid fra tidstabellen, "custom" = egne, faste tider. */
  timeMode: z.enum(['rule', 'custom']),
  /** Valgt tidsregel (rule-mode). null = fælles tid afledt af holdenes egne regler. */
  ruleId: id.nullable(),
  note: z.string().trim().max(300, 'Noten må højst have 300 tegn').default(''),
});

export const assemblySchema = z.object({
  enabled: z.boolean(),
  day: z.number().int().min(0).max(DAY_COUNT - 1),
  start: minutes('Starttid'),
  end: minutes('Sluttid'),
  groupIds: z.array(id).max(20),
  location: z.string().trim().max(60).default(''),
  /** Ingen lærer = ikke bemandet i værktøjet og giver ingen lærertimer. */
  teacherId: id.nullable(),
  /** Forberedelse for morgensamlingen: som klasser, ingen, eller egen sats. */
  prepMode: z.enum(['same', 'none', 'custom']),
  prepPercent: nullableNumber(0, 1000, 'Forberedelse for morgensamlingen'),
  source: z.string().trim().max(300).default(''),
});

const slotSchema = z.object({ start: minutes('Starttid'), end: minutes('Sluttid') }).nullable();
/** Standardtid pr. ugedag (6) og dagdel (4); null = ingen standardtid. */
export const standardTimesSchema = z.array(z.array(slotSchema).length(PERIOD_COUNT)).length(DAY_COUNT);

export const settingsSchema = z.object({
  prepPercent: nullableNumber(0, 1000, 'Forberedelsesprocent'),
  saturdayPercent: nullableNumber(0, 1000, 'Lørdagstillæg'),
  prepBasis: z.enum(['actual', 'withSaturday']),
  teachingWeeks: nullableNumber(0, 60, 'Undervisningsuger'),
  assembly: assemblySchema,
  standardTimes: standardTimesSchema,
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  teachers: z.array(teacherSchema),
  groups: z.array(groupSchema),
  rooms: z.array(roomSchema).length(ROOM_COUNT, `Der skal være præcis ${ROOM_COUNT} sale`),
  timeRules: z.array(timeRuleSchema).max(2000),
  blocks: z.array(blockSchema),
  settings: settingsSchema,
});

export type Teacher = z.infer<typeof teacherSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Room = z.infer<typeof roomSchema>;
export type TimeRule = z.infer<typeof timeRuleSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Assembly = z.infer<typeof assemblySchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type AppData = z.infer<typeof appDataSchema>;
export type PrepBasis = Settings['prepBasis'];
export type TimeMode = Block['timeMode'];
export type StandardTimes = z.infer<typeof standardTimesSchema>;

export const emptyStandardTimes = (): StandardTimes => Array.from({ length: DAY_COUNT }, () => Array.from({ length: PERIOD_COUNT }, () => null));

export const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'] as const;
export const DAY_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'] as const;
export const PERIOD_NAMES = ['Morgen', 'Formiddag', 'Middag', 'Eftermiddag'] as const;

/** Morgensamlingen uden kendte oplysninger (bruges kun, hvis kilden ikke kan læses). */
export const EMPTY_ASSEMBLY: Assembly = {
  enabled: false,
  day: FRIDAY,
  start: 490,
  end: 500,
  groupIds: [],
  location: '',
  teacherId: null,
  prepMode: 'same',
  prepPercent: null,
  source: '',
};

export const DEFAULT_SETTINGS: Settings = {
  prepPercent: null,
  saturdayPercent: null,
  prepBasis: 'actual',
  teachingWeeks: null,
  assembly: EMPTY_ASSEMBLY,
  standardTimes: Array.from({ length: DAY_COUNT }, () => Array.from({ length: PERIOD_COUNT }, () => null)),
};

export function defaultRooms(): Room[] {
  return [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `room-${i + 1}`, name: `Sal ${i + 1}` })),
    { id: 'room-gym', name: 'Motionsrum' },
  ];
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    teachers: [],
    groups: [],
    rooms: defaultRooms(),
    timeRules: [],
    blocks: [],
    settings: { ...DEFAULT_SETTINGS, assembly: { ...EMPTY_ASSEMBLY, groupIds: [] }, standardTimes: emptyStandardTimes() },
  };
}

/** Holdsæt sammenlignes uafhængigt af rækkefølge. */
export const sameGroups = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((g) => b.includes(g));
