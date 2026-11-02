// Rene funktioner, der laver en ny AppData ud fra en handling. Ingen sideeffekter.
import { nextTeacherColor } from '../../shared/colors';
import { newId } from '../../shared/ids';
import type { AppData, Block, Group, Room, Settings, Subject, Teacher } from '../../shared/schema';

export const upsertBlock = (data: AppData, block: Block): AppData => {
  const exists = data.blocks.some((b) => b.id === block.id);
  return {
    ...data,
    blocks: exists ? data.blocks.map((b) => (b.id === block.id ? block : b)) : [...data.blocks, block],
  };
};

export const deleteBlock = (data: AppData, id: string): AppData => ({
  ...data,
  blocks: data.blocks.filter((b) => b.id !== id),
});

/** Kopi med nyt id; fag, hold, lærerliste og varighed bevares. */
export const copyOf = (block: Block, patch: Partial<Block>): Block => ({
  ...block,
  teacherIds: [...block.teacherIds],
  ...patch,
  id: newId('b'),
});

/** Del en blok ved et tidspunkt i to sammenhængende blokke. */
export function splitBlock(data: AppData, id: string, at: number): { data: AppData; second: Block } | null {
  const b = data.blocks.find((x) => x.id === id);
  if (!b || at <= b.start || at >= b.end) return null;
  const second: Block = { ...b, teacherIds: [...b.teacherIds], id: newId('b'), start: at };
  const blocks = data.blocks.flatMap((x) => (x.id === id ? [{ ...x, end: at }, second] : [x]));
  return { data: { ...data, blocks }, second };
}

// ---- Stamdata ----------------------------------------------------------------

export function addTeacher(data: AppData, initials: string): { data: AppData; teacher: Teacher } {
  const teacher: Teacher = {
    id: newId('t'),
    initials: initials.trim().toUpperCase(),
    name: '',
    color: nextTeacherColor(data.teachers.filter((t) => !t.archived).map((t) => t.color)),
    annualHours: null,
    archived: false,
  };
  return { data: { ...data, teachers: [...data.teachers, teacher] }, teacher };
}

export const updateTeacher = (data: AppData, id: string, patch: Partial<Teacher>): AppData => ({
  ...data,
  teachers: data.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

export function addNamed<K extends 'subjects' | 'groups'>(data: AppData, key: K, name: string, prefix: string) {
  const item = { id: newId(prefix), name: name.trim(), archived: false };
  return { data: { ...data, [key]: [...data[key], item] } as AppData, item };
}

export const updateNamed = <K extends 'subjects' | 'groups'>(data: AppData, key: K, id: string, patch: Partial<Subject & Group>): AppData =>
  ({ ...data, [key]: (data[key] as (Subject | Group)[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }) as AppData;

export const removeItem = (data: AppData, key: 'teachers' | 'subjects' | 'groups', id: string): AppData =>
  ({ ...data, [key]: (data[key] as { id: string }[]).filter((x) => x.id !== id) }) as AppData;

export const updateRoom = (data: AppData, id: string, patch: Partial<Room>): AppData => ({
  ...data,
  rooms: data.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

export function moveRoom(data: AppData, id: string, dir: -1 | 1): AppData {
  const i = data.rooms.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= data.rooms.length) return data;
  const rooms = [...data.rooms];
  [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
  return { ...data, rooms };
}

export const updateSettings = (data: AppData, patch: Partial<Settings>): AppData => ({
  ...data,
  settings: { ...data.settings, ...patch },
});
