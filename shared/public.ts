import type { AppData } from './schema.js';

/** Læsevisningen får kun det, der skal til for at vise skemaet (ingen årstimer, satser eller regler). */
export function publicProjection(data: AppData) {
  const a = data.settings.assembly;
  return {
    rooms: data.rooms,
    blocks: data.blocks,
    groups: data.groups,
    teachers: data.teachers.map(({ id, initials, name, color, archived }) => ({ id, initials, name, color, archived })),
    assembly: { enabled: a.enabled, day: a.day, start: a.start, end: a.end, groupIds: a.groupIds, location: a.location, teacherId: a.teacherId },
  };
}
