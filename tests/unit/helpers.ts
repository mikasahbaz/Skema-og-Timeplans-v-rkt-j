import { emptyAppData, type AppData, type Block, type TimeRule } from '../../shared/schema';

/** Testopsætningen fra kravene: p = 25 %, s = 50 %, W = 36, A(TH) = 1600. */
export function setup(): AppData {
  const d = emptyAppData();
  d.settings = { ...d.settings, prepPercent: 25, saturdayPercent: 50, teachingWeeks: 36 };
  d.teachers = [
    { id: 'th', initials: 'TH', name: '', color: '#f9c6c9', annualHours: 1600, archived: false },
    { id: 'co', initials: 'CO', name: '', color: '#bfe3c6', annualHours: null, archived: false },
  ];
  d.groups = [
    { id: 'h3', name: 'Hold 3', archived: false },
    { id: 'h4', name: 'Hold 4', archived: false },
  ];
  return d;
}

export const block = (over: Partial<Block>): Block => ({
  id: 'x',
  title: 'Balletklasse',
  groupIds: ['h3'],
  teacherIds: ['th'],
  day: 0,
  period: 0,
  roomId: 'room-1',
  start: 540,
  end: 660,
  timeMode: 'custom',
  ruleId: null,
  note: '',
  ...over,
});

export const rule = (over: Partial<TimeRule>): TimeRule => ({
  id: 'r',
  groupIds: ['h3'],
  day: 0,
  period: 0,
  start: 490,
  end: 595,
  label: '',
  note: '',
  source: 'test',
  ...over,
});
