// Migrering af gemte data til den aktuelle datamodel. Intet slettes:
// - Fag bliver klassens titel. Hold bliver en liste med ét hold.
// - Kildens hold, tidsregler og morgensamling tilføjes (eksisterende hold matches på navn).
// - En klasse, der præcis matcher en tidsregel (hold, dag og tidsrum), knyttes til reglen.
// - Alle andre klasser beholder deres tider som "Egne tider"; dagdelen sættes ud fra klokkeslættet.
import { deriveStandardTimes } from './rules.js';
import { emptyStandardTimes, sameGroups, SCHEMA_VERSION, SCHOOL_RULES_26_27, type AppData, type Block } from './schema.js';
import { withSourceRules } from './source/index.js';
import { periodForClock } from './time.js';

export interface MigrationReport {
  from: number;
  matched: number;
  custom: number;
}

interface V1 {
  schemaVersion: 1;
  teachers: AppData['teachers'];
  subjects?: { id: string; name: string }[];
  groups: AppData['groups'];
  rooms: AppData['rooms'];
  blocks: { id: string; subjectId: string; groupId: string; teacherIds: string[]; day: number; roomId: string; start: number; end: number; note?: string }[];
  settings: { prepPercent: number | null; saturdayPercent: number | null; prepBasis: 'actual' | 'withSaturday'; teachingWeeks: number | null };
}

export function migrateV1(old: V1): { data: AppData; report: MigrationReport } {
  const subjects = new Map((old.subjects ?? []).map((s) => [s.id, s.name]));
  const base = withSourceRules({
    schemaVersion: SCHEMA_VERSION,
    teachers: old.teachers.map((t) => ({ ...t, contractHours: null, orientationHours: null, saturdays: null })),
    groups: old.groups,
    rooms: old.rooms,
    timeRules: [],
    blocks: [],
    settings: {
      assembly: { enabled: false, day: 4, start: 490, end: 500, groupIds: [], location: '', teacherId: null, prepMode: 'same', prepPercent: null, source: '' },
      standardTimes: emptyStandardTimes(),
      ...SCHOOL_RULES_26_27,
      // Version 1 havde egne satser; de bevares, hvis de var udfyldt.
      ...(old.settings.prepPercent !== null ? { prepPercent: old.settings.prepPercent } : {}),
      ...(old.settings.saturdayPercent !== null ? { saturdayPercent: old.settings.saturdayPercent } : {}),
      ...(old.settings.teachingWeeks !== null ? { teachingWeeks: old.settings.teachingWeeks } : {}),
      answers: {},
    },
  });
  let matched = 0;
  const blocks: Block[] = old.blocks.map((b) => {
    const groupIds = [b.groupId];
    const rule = base.timeRules.find((r) => r.day === b.day && r.start === b.start && r.end === b.end && sameGroups(r.groupIds, groupIds));
    const common = {
      id: b.id,
      title: (subjects.get(b.subjectId) ?? '').trim().slice(0, 60) || 'Balletklasse',
      groupIds,
      teacherIds: b.teacherIds,
      day: b.day,
      roomId: b.roomId,
      start: b.start,
      end: b.end,
      note: b.note ?? '',
      noPrep: false,
    };
    if (rule) {
      matched++;
      return { ...common, period: rule.period, timeMode: 'rule' as const, ruleId: rule.id };
    }
    return { ...common, period: periodForClock(b.start), timeMode: 'custom' as const, ruleId: null };
  });
  return { data: { ...base, blocks }, report: { from: 1, matched, custom: blocks.length - matched } };
}

type Loose = Record<string, unknown> & { schemaVersion: number; settings: Record<string, unknown>; teachers: Record<string, unknown>[]; blocks: Record<string, unknown>[]; timeRules: AppData['timeRules'] };

/** Version 2 → 3: standardtider pr. ugedag og dagdel udledes af tidstabellen. Intet andet ændres. */
function v2to3(old: Loose): Loose {
  return { ...old, schemaVersion: 3, settings: { ...old.settings, standardTimes: deriveStandardTimes(old.timeRules) } };
}

/**
 * Version 3 → 4: skolens beregningsregler fra timeopgørelsen 26/27 (25 min forberedelse pr. time,
 * lørdag × 1,25 med forberedelse inkl. tillæg, 41 uger, 18 lørdage, 1 t orientering, afrunding som
 * dokumentet). Lærere får tomme felter til kontrakttimer; FM får 26 t ifølge dokumentet.
 * Tidligere årstimer bevares i data. Klasser får "uden forberedelse" = nej.
 */
function v3to4(old: Loose): AppData {
  const teachers = old.teachers.map((t) => ({
    ...t,
    contractHours: t.contractHours ?? (String(t.initials).toUpperCase() === 'FM' ? 26 : null),
    orientationHours: t.orientationHours ?? null,
    saturdays: t.saturdays ?? null,
  }));
  const blocks = old.blocks.map((b) => ({ ...b, noPrep: b.noPrep ?? false }));
  const settings = { ...old.settings, ...SCHOOL_RULES_26_27, answers: (old.settings.answers as object) ?? {} };
  return { ...old, schemaVersion: SCHEMA_VERSION, teachers, blocks, settings } as unknown as AppData;
}

export function migrateV2(old: unknown): { data: AppData; report: MigrationReport } {
  const data = v3to4(v2to3(old as Loose));
  const ruleBlocks = data.blocks.filter((b) => b.timeMode === 'rule').length;
  return { data, report: { from: 2, matched: ruleBlocks, custom: data.blocks.length - ruleBlocks } };
}

/** Bringer et vilkårligt gemt eller importeret dokument op på den aktuelle version. */
export function migrateAny(input: unknown): { data: unknown; report: MigrationReport | null } {
  const version = input && typeof input === 'object' ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
  try {
    if (version === 1) return migrateV1(input as V1);
    if (version === 2) return migrateV2(input);
    if (version === 3) {
      const data = v3to4(input as Loose);
      const ruleBlocks = data.blocks.filter((b) => b.timeMode === 'rule').length;
      return { data, report: { from: 3, matched: ruleBlocks, custom: data.blocks.length - ruleBlocks } };
    }
  } catch {
    /* ugyldigt dokument – valideringen giver en forståelig fejl */
  }
  return { data: input, report: null };
}
