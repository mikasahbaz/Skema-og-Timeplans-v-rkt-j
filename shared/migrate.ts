// Migrering af gemte data til den aktuelle datamodel. Intet slettes:
// - Fag bliver klassens titel. Hold bliver en liste med ét hold.
// - Kildens hold, tidsregler og morgensamling tilføjes (eksisterende hold matches på navn).
// - En klasse, der præcis matcher en tidsregel (hold, dag og tidsrum), knyttes til reglen.
// - Alle andre klasser beholder deres tider som "Egne tider"; dagdelen sættes ud fra klokkeslættet.
import { deriveStandardTimes } from './rules.js';
import { emptyStandardTimes, sameGroups, SCHEMA_VERSION, type AppData, type Block } from './schema.js';
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
    teachers: old.teachers,
    groups: old.groups,
    rooms: old.rooms,
    timeRules: [],
    blocks: [],
    settings: {
      prepPercent: old.settings.prepPercent,
      saturdayPercent: old.settings.saturdayPercent,
      prepBasis: old.settings.prepBasis,
      teachingWeeks: old.settings.teachingWeeks,
      assembly: { enabled: false, day: 4, start: 490, end: 500, groupIds: [], location: '', teacherId: null, prepMode: 'same', prepPercent: null, source: '' },
      standardTimes: emptyStandardTimes(),
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
    };
    if (rule) {
      matched++;
      return { ...common, period: rule.period, timeMode: 'rule' as const, ruleId: rule.id };
    }
    return { ...common, period: periodForClock(b.start), timeMode: 'custom' as const, ruleId: null };
  });
  return { data: { ...base, blocks }, report: { from: 1, matched, custom: blocks.length - matched } };
}

/** Version 2 → 3: standardtider pr. ugedag og dagdel udledes af tidstabellen. Intet andet ændres. */
export function migrateV2(old: Omit<AppData, 'schemaVersion' | 'settings'> & { schemaVersion: 2; settings: Omit<AppData['settings'], 'standardTimes'> }): {
  data: AppData;
  report: MigrationReport;
} {
  const data: AppData = { ...old, schemaVersion: SCHEMA_VERSION, settings: { ...old.settings, standardTimes: deriveStandardTimes(old.timeRules) } };
  const ruleBlocks = data.blocks.filter((b) => b.timeMode === 'rule').length;
  return { data, report: { from: 2, matched: ruleBlocks, custom: data.blocks.length - ruleBlocks } };
}

/** Bringer et vilkårligt gemt eller importeret dokument op på den aktuelle version. */
export function migrateAny(input: unknown): { data: unknown; report: MigrationReport | null } {
  const version = input && typeof input === 'object' ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
  try {
    if (version === 1) return migrateV1(input as V1);
    if (version === 2) return migrateV2(input as Parameters<typeof migrateV2>[0]);
  } catch {
    /* ugyldigt dokument – valideringen giver en forståelig fejl */
  }
  return { data: input, report: null };
}
