import type { AppData } from './schema.js';

/** Læsevisningen får kun det, der skal til for at vise skemaet (ingen årstimer eller satser). */
export function publicProjection(data: AppData) {
  return {
    rooms: data.rooms,
    blocks: data.blocks,
    subjects: data.subjects,
    groups: data.groups,
    teachers: data.teachers.map(({ id, initials, name, color, archived }) => ({ id, initials, name, color, archived })),
    settings: { daypartStarts: data.settings.daypartStarts },
  };
}
