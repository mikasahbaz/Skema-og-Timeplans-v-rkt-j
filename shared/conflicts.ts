// Konfliktkontrol: overlap på samme ugedag med samme sal, fælles lærer eller fælles hold.
// Fredagens morgensamling indgår med sine hold og (hvis valgt) sin lærer, men booker ingen sal.
import type { AppData, Block, Settings } from './schema.js';

export type ConflictKind = 'room' | 'teacher' | 'group';
export const ASSEMBLY_ID = 'morgensamling';

export interface Conflict {
  blockId: string;
  otherId: string;
  kinds: ConflictKind[];
  teacherIds: string[];
  groupIds: string[];
}

type Slot = Pick<Block, 'id' | 'day' | 'start' | 'end' | 'roomId' | 'teacherIds' | 'groupIds'>;

/** Halvåbne intervaller: 09–10 og 10–11 overlapper ikke. */
export const overlaps = (a: Pick<Block, 'start' | 'end'>, b: Pick<Block, 'start' | 'end'>) => a.start < b.end && b.start < a.end;

/** Morgensamlingen som "tidsrum" til konfliktkontrol (ingen sal). */
export function assemblySlot(settings: Settings): Slot | null {
  const a = settings.assembly;
  if (!a.enabled) return null;
  return { id: ASSEMBLY_ID, day: a.day, start: a.start, end: a.end, roomId: '', teacherIds: a.teacherId ? [a.teacherId] : [], groupIds: a.groupIds };
}

export function conflictBetween(a: Slot, b: Slot): Conflict | null {
  if (a.id === b.id || a.day !== b.day || !overlaps(a, b)) return null;
  const kinds: ConflictKind[] = [];
  if (a.roomId && a.roomId === b.roomId) kinds.push('room');
  const teacherIds = a.teacherIds.filter((t) => b.teacherIds.includes(t));
  if (teacherIds.length) kinds.push('teacher');
  const groupIds = a.groupIds.filter((g) => b.groupIds.includes(g));
  if (groupIds.length) kinds.push('group');
  return kinds.length ? { blockId: a.id, otherId: b.id, kinds, teacherIds, groupIds } : null;
}

function slotsOf(data: Pick<AppData, 'blocks' | 'settings'>): Slot[] {
  const a = assemblySlot(data.settings);
  return a ? [...data.blocks, a] : data.blocks;
}

/** Konflikter for en (ny eller ændret) klasse mod alle andre. Klassens eget id ignoreres. */
export function conflictsForBlock(block: Slot, data: Pick<AppData, 'blocks' | 'settings'>): Conflict[] {
  const slots = slotsOf(data);
  const out: Conflict[] = [];
  for (const other of slots) {
    const c = conflictBetween(block, other);
    if (c) out.push(c);
  }
  const start = (id: string) => slots.find((s) => s.id === id)?.start ?? 0;
  return out.sort((x, y) => start(x.otherId) - start(y.otherId));
}

/** Alle konfliktpar (hvert par én gang) og de berørte id'er. */
export function allConflicts(data: Pick<AppData, 'blocks' | 'settings'>): { pairs: Conflict[]; blockIds: Set<string> } {
  const pairs: Conflict[] = [];
  const blockIds = new Set<string>();
  const byDay = new Map<number, Slot[]>();
  for (const b of slotsOf(data)) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b]);
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
        const c = conflictBetween(sorted[i], sorted[j]);
        if (c) {
          pairs.push(c);
          blockIds.add(c.blockId);
          blockIds.add(c.otherId);
        }
      }
    }
  }
  return { pairs, blockIds };
}

/** Navn på det, der konfliktes med (klasse eller morgensamling). */
export function slotTitle(id: string, data: AppData): string {
  if (id === ASSEMBLY_ID) return 'Morgensamlingen';
  const b = data.blocks.find((x) => x.id === id);
  if (!b) return 'en klasse';
  const groups = b.groupIds.map((g) => data.groups.find((x) => x.id === g)?.name ?? '?').join(' + ');
  return `${b.title} · ${groups}`;
}

/** Menneskelig beskrivelse af de fælles ressourcer, fx ["Sal 3", "lærer TH", "Hold 6"]. */
export function describeConflict(c: Conflict, data: AppData): { resources: string[]; other: Slot | undefined } {
  const other = slotsOf(data).find((b) => b.id === c.otherId);
  const resources: string[] = [];
  if (!other) return { resources, other };
  if (c.kinds.includes('room')) resources.push(data.rooms.find((r) => r.id === other.roomId)?.name ?? 'Salen');
  for (const t of c.teacherIds) resources.push(`lærer ${data.teachers.find((x) => x.id === t)?.initials ?? '?'}`);
  for (const g of c.groupIds) resources.push(data.groups.find((x) => x.id === g)?.name ?? 'holdet');
  return { resources, other };
}
