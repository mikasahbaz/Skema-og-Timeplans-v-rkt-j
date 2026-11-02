// Migrering af gemte data til den aktuelle datamodel. Intet slettes:
// - Fag bliver klassens titel. Hold bliver en liste med ét hold.
// - Kildens hold, tidsregler og morgensamling tilføjes (eksisterende hold matches på navn).
// - En klasse, der præcis matcher en tidsregel (hold, dag og tidsrum), knyttes til reglen.
// - Alle andre klasser beholder deres tider som "Egne tider"; dagdelen sættes ud fra klokkeslættet.
import { sameGroups, SCHEMA_VERSION, type AppData, type Block } from './schema.js';
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

/** Bringer et vilkårligt gemt eller importeret dokument op på den aktuelle version. */
export function migrateAny(input: unknown): { data: unknown; report: MigrationReport | null } {
  if (input && typeof input === 'object' && (input as { schemaVersion?: unknown }).schemaVersion === 1) {
    try {
      return migrateV1(input as V1);
    } catch {
      return { data: input, report: null };
    }
  }
  return { data: input, report: null };
}
