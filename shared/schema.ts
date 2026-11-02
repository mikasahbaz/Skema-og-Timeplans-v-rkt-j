// Datamodel og strukturel validering, delt mellem klient og server.
import { z } from 'zod';

// Danske standardbeskeder for valideringsfejl, der ikke har en egen tekst.
z.config(z.locales.da());

export const DAY_COUNT = 6; // mandag (0) … lørdag (5)
export const SATURDAY = 5;
export const ROOM_COUNT = 8;
export const MAX_TEACHERS_PER_BLOCK = 2;
export const SCHEMA_VERSION = 1;

const id = z.string().trim().min(1, 'Mangler id').max(64);
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

export const subjectSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Fagets navn mangler').max(80),
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

export const blockSchema = z.object({
  id,
  subjectId: id,
  groupId: id,
  teacherIds: z
    .array(id)
    .min(1, 'Vælg mindst én lærer')
    .max(MAX_TEACHERS_PER_BLOCK, 'Højst to lærere pr. blok'),
  day: z.number().int().min(0).max(DAY_COUNT - 1),
  roomId: id,
  start: z.number().int('Starttid skal være hele minutter').min(0).max(1439),
  end: z.number().int('Sluttid skal være hele minutter').min(1).max(1440),
  note: z.string().trim().max(300, 'Noten må højst have 300 tegn').default(''),
});

export const settingsSchema = z.object({
  prepPercent: nullableNumber(0, 1000, 'Forberedelsesprocent'),
  saturdayPercent: nullableNumber(0, 1000, 'Lørdagstillæg'),
  prepBasis: z.enum(['actual', 'withSaturday']),
  teachingWeeks: nullableNumber(0, 60, 'Undervisningsuger'),
  /** Starttidspunkter (minutter) for Formiddag, Eftermiddag og Aften. */
  daypartStarts: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  teachers: z.array(teacherSchema),
  subjects: z.array(subjectSchema),
  groups: z.array(groupSchema),
  rooms: z.array(roomSchema).length(ROOM_COUNT, `Der skal være præcis ${ROOM_COUNT} sale`),
  blocks: z.array(blockSchema),
  settings: settingsSchema,
});

export type Teacher = z.infer<typeof teacherSchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type AppData = z.infer<typeof appDataSchema>;
export type PrepBasis = Settings['prepBasis'];

export const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'] as const;
export const DAY_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'] as const;

export const DEFAULT_SETTINGS: Settings = {
  prepPercent: null,
  saturdayPercent: null,
  prepBasis: 'actual',
  teachingWeeks: null,
  daypartStarts: [600, 780, 1080],
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
    subjects: [],
    groups: [],
    rooms: defaultRooms(),
    blocks: [],
    settings: { ...DEFAULT_SETTINGS, daypartStarts: [...DEFAULT_SETTINGS.daypartStarts] },
  };
}
