// Konfliktkontrol: overlap på samme ugedag med samme sal, fælles lærer eller samme hold.
import type { AppData, Block } from './schema.js';

export type ConflictKind = 'room' | 'teacher' | 'group';

export interface Conflict {
  /** Den blok der kontrolleres. */
  blockId: string;
  /** Den anden blok, som der konfliktes med. */
  otherId: string;
  kinds: ConflictKind[];
  /** Fælles lærere (ved kind 'teacher'). */
  teacherIds: string[];
}

/** Halvåbne intervaller: 09–10 og 10–11 overlapper ikke. */
export const overlaps = (a: Pick<Block, 'start' | 'end'>, b: Pick<Block, 'start' | 'end'>) =>
  a.start < b.end && b.start < a.end;

export function conflictBetween(a: Block, b: Block): Conflict | null {
  if (a.id === b.id || a.day !== b.day || !overlaps(a, b)) return null;
  const kinds: ConflictKind[] = [];
  if (a.roomId === b.roomId) kinds.push('room');
  const shared = a.teacherIds.filter((t) => b.teacherIds.includes(t));
  if (shared.length) kinds.push('teacher');
  if (a.groupId === b.groupId) kinds.push('group');
  return kinds.length ? { blockId: a.id, otherId: b.id, kinds, teacherIds: shared } : null;
}

/** Konflikter for en (ny eller ændret) blok mod alle andre blokke. Bloks eget id ignoreres. */
export function conflictsForBlock(block: Block, blocks: Block[]): Conflict[] {
  const out: Conflict[] = [];
  for (const other of blocks) {
    const c = conflictBetween(block, other);
    if (c) out.push(c);
  }
  return out.sort((x, y) => {
    const a = blocks.find((b) => b.id === x.otherId)!;
    const b = blocks.find((b) => b.id === y.otherId)!;
    return a.start - b.start;
  });
}

/** Alle konfliktpar i skemaet (hvert par én gang) og et sæt af berørte blok-id'er. */
export function allConflicts(blocks: Block[]): { pairs: Conflict[]; blockIds: Set<string> } {
  const pairs: Conflict[] = [];
  const blockIds = new Set<string>();
  const byDay = new Map<number, Block[]>();
  for (const b of blocks) {
    const list = byDay.get(b.day) ?? [];
    list.push(b);
    byDay.set(b.day, list);
  }
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

/** Menneskelig beskrivelse af en konflikt, fx "Sal 3 og læreren TH er optaget af …". */
export function describeConflict(c: Conflict, data: AppData): { resources: string[]; other: Block | undefined } {
  const other = data.blocks.find((b) => b.id === c.otherId);
  const resources: string[] = [];
  if (!other) return { resources, other };
  if (c.kinds.includes('room')) resources.push(data.rooms.find((r) => r.id === other.roomId)?.name ?? 'Salen');
  if (c.kinds.includes('teacher')) {
    for (const t of c.teacherIds) resources.push(`lærer ${data.teachers.find((x) => x.id === t)?.initials ?? '?'}`);
  }
  if (c.kinds.includes('group')) resources.push(data.groups.find((g) => g.id === other.groupId)?.name ?? 'Holdet');
  return { resources, other };
}
