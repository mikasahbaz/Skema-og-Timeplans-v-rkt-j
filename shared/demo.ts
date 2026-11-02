// Demonstrationsdata. Bruges KUN i demotilstand eller som bevidst tilvalg i et tomt skema.
import { TEACHER_PALETTE } from './colors.js';
import { defaultRooms, SCHEMA_VERSION, type AppData, type Block } from './schema.js';

export function demoAppData(): AppData {
  const teachers = [
    ['t-th', 'TH', 1600],
    ['t-co', 'CO', 1500],
    ['t-ml', 'ML', 1680],
    ['t-ak', 'AK', 900],
    ['t-sb', 'SB', null],
  ].map(([id, initials, annualHours], i) => ({
    id: id as string,
    initials: initials as string,
    name: '',
    color: TEACHER_PALETTE[i],
    annualHours: annualHours as number | null,
    archived: false,
  }));
  const subjects = [
    ['s-klassisk', 'Klassisk ballet'],
    ['s-rep', 'Repertoire'],
    ['s-fys', 'Fysisk træning'],
    ['s-spids', 'Spidsdans'],
    ['s-mod', 'Moderne dans'],
  ].map(([id, name]) => ({ id, name, archived: false }));
  const groups = ['Hold 3', 'Hold 4', 'Hold 5', 'Hold 6'].map((name, i) => ({ id: `g-${i + 3}`, name, archived: false }));
  const rooms = defaultRooms();

  const h = (s: string) => {
    const [hh, mm] = s.split('.').map(Number);
    return hh * 60 + (mm ?? 0);
  };
  let n = 0;
  const blk = (day: number, room: number, from: string, to: string, subj: string, group: number, teachers: string[], note = ''): Block => ({
    id: `demo-${++n}`,
    day,
    roomId: rooms[room].id,
    start: h(from),
    end: h(to),
    subjectId: subj,
    groupId: `g-${group}`,
    teacherIds: teachers,
    note,
  });

  const blocks: Block[] = [];
  for (let day = 0; day < 5; day++) {
    blocks.push(blk(day, 0, '08.10', '09.50', 's-klassisk', 6, ['t-th']));
    blocks.push(blk(day, 1, '08.10', '09.40', 's-klassisk', 5, [day % 2 ? 't-co' : 't-ml']));
    blocks.push(blk(day, 7, '10.00', '10.45', 's-fys', 6, ['t-ak']));
    blocks.push(blk(day, 2, '15.00', '16.30', 's-klassisk', 3, ['t-co']));
    blocks.push(blk(day, 3, '16.00', '17.30', 's-klassisk', 4, ['t-ml']));
  }
  blocks.push(blk(0, 0, '11.00', '12.30', 's-rep', 6, ['t-th', 't-co'], 'Svanesøen, 2. akt'));
  blocks.push(blk(1, 4, '13.00', '14.30', 's-spids', 5, ['t-ml']));
  blocks.push(blk(2, 0, '10.15', '12.00', 's-mod', 5, ['t-sb']));
  blocks.push(blk(3, 0, '17.30', '19.00', 's-rep', 6, ['t-th', 't-ml']));
  blocks.push(blk(4, 5, '18.00', '19.30', 's-mod', 4, ['t-sb']));
  blocks.push(blk(5, 0, '09.00', '11.00', 's-klassisk', 6, ['t-th', 't-co']));
  blocks.push(blk(5, 1, '09.30', '11.00', 's-klassisk', 5, ['t-ml']));
  blocks.push(blk(5, 0, '11.15', '12.45', 's-rep', 5, ['t-th']));

  return {
    schemaVersion: SCHEMA_VERSION,
    teachers,
    subjects,
    groups,
    rooms,
    blocks,
    settings: {
      prepPercent: 25,
      saturdayPercent: 50,
      prepBasis: 'actual',
      teachingWeeks: 36,
      daypartStarts: [600, 780, 1080],
    },
  };
}
