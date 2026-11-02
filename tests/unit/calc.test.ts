import { describe, expect, it } from 'vitest';
import { computeTeacherSummary, prepMinutesPerHour, scheduleTotals } from '../../shared/calc';
import { emptyAppData, type AppData, type Block } from '../../shared/schema';
import { formatDecimalHours, formatDuration, parseClock, formatClock, daypartOf } from '../../shared/time';

function setup(): AppData {
  const d = emptyAppData();
  d.settings.prepPercent = 25;
  d.settings.saturdayPercent = 50;
  d.settings.teachingWeeks = 36;
  d.teachers = [
    { id: 'th', initials: 'TH', name: '', color: '#f9c6c9', annualHours: 1600, archived: false },
    { id: 'co', initials: 'CO', name: '', color: '#bfe3c6', annualHours: null, archived: false },
  ];
  d.subjects = [{ id: 'kb', name: 'Klassisk ballet', archived: false }];
  d.groups = [{ id: 'h3', name: 'Hold 3', archived: false }];
  return d;
}
const block = (over: Partial<Block>): Block => ({
  id: 'x', subjectId: 'kb', groupId: 'h3', teacherIds: ['th'], day: 0, roomId: 'room-1', start: 540, end: 660, note: '', ...over,
});
const blockA = block({ id: 'A', day: 0, teacherIds: ['th'] });
const blockB = block({ id: 'B', day: 5, teacherIds: ['th', 'co'] });

describe('beregningseksempler', () => {
  it('Eksempel A: mandag 09–11 TH', () => {
    const d = setup();
    d.blocks = [blockA];
    const s = computeTeacherSummary(d, 'th');
    expect(s.days[0]).toEqual({ U: 120, F: 30, L: 0, UF: 150, K: 150 });
  });

  it('Eksempel B: lørdag 09–11 TH + CO', () => {
    const d = setup();
    d.blocks = [blockB];
    for (const t of ['th', 'co']) {
      expect(computeTeacherSummary(d, t).week).toEqual({ U: 120, F: 30, L: 60, UF: 150, K: 210 });
    }
    expect(scheduleTotals(d).roomMinutes).toBe(120);
  });

  it('Eksempel C: A + B', () => {
    const d = setup();
    d.blocks = [blockA, blockB];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week).toEqual({ U: 240, F: 60, L: 60, UF: 300, K: 360 });
    expect(th.annual.plannedHours).toBe(216);
    expect(th.annual.remainingHours).toBe(1384);
    expect(computeTeacherSummary(d, 'co').week.K).toBe(210);
    const totals = scheduleTotals(d);
    expect(totals.roomMinutes).toBe(240);
    expect(totals.teacherMinutes).toBe(360);
  });

  it('Eksempel D: forberedelse inkl. lørdagstillæg', () => {
    const d = setup();
    d.settings.prepBasis = 'withSaturday';
    d.blocks = [blockB];
    expect(computeTeacherSummary(d, 'th').week).toEqual({ U: 120, F: 45, L: 60, UF: 165, K: 225 });
  });

  it('flytning fredag → lørdag ændrer tillæg, ikke varighed', () => {
    const d = setup();
    d.blocks = [block({ day: 4 })];
    const fri = computeTeacherSummary(d, 'th').week;
    d.blocks = [block({ day: 5 })];
    const sat = computeTeacherSummary(d, 'th').week;
    expect(fri.U).toBe(sat.U);
    expect(fri.L).toBe(0);
    expect(sat.L).toBe(60);
  });

  it('tilføj og fjern anden lærer opdaterer begge opgørelser', () => {
    const d = setup();
    d.blocks = [block({ teacherIds: ['th', 'co'] })];
    expect(computeTeacherSummary(d, 'co').week.U).toBe(120);
    d.blocks = [block({ teacherIds: ['th'] })];
    expect(computeTeacherSummary(d, 'co').week.U).toBe(0);
    expect(computeTeacherSummary(d, 'th').week.U).toBe(120);
  });

  it('manglende satser og årsdata er ikke nul', () => {
    const d = setup();
    d.settings.prepPercent = null;
    d.settings.saturdayPercent = null;
    d.settings.teachingWeeks = null;
    d.blocks = [blockA, blockB];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week.U).toBe(240);
    expect(th.week.F).toBeNull();
    expect(th.week.L).toBeNull();
    expect(th.week.K).toBeNull();
    expect(th.annual.plannedHours).toBeNull();
    expect(th.annual.remainingHours).toBeNull();
    expect(th.missing).toEqual(['prepPercent', 'saturdayPercent', 'teachingWeeks']);
    // CO mangler årsarbejdstimer
    d.settings.prepPercent = 25;
    d.settings.saturdayPercent = 50;
    d.settings.teachingWeeks = 36;
    const co = computeTeacherSummary(d, 'co');
    expect(co.annual.plannedHours).toBe(126);
    expect(co.annual.remainingHours).toBeNull();
  });

  it('eksplicit 0 er en gyldig værdi', () => {
    const d = setup();
    d.settings.prepPercent = 0;
    d.settings.saturdayPercent = 0;
    d.teachers[0].annualHours = 0;
    d.blocks = [blockB];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week).toEqual({ U: 120, F: 0, L: 0, UF: 120, K: 120 });
    expect(th.annual.remainingHours).toBe(-72);
  });

  it('manglende lørdagssats påvirker ikke en lærer uden lørdagsundervisning', () => {
    const d = setup();
    d.settings.saturdayPercent = null;
    d.blocks = [blockA];
    expect(computeTeacherSummary(d, 'th').week.K).toBe(150);
  });

  it('fuld præcision bevares; afrunding kun ved visning', () => {
    const d = setup();
    d.blocks = [block({ start: 540, end: 590 })]; // 50 min → F = 12,5 min
    const w = computeTeacherSummary(d, 'th').week;
    expect(w.F).toBe(12.5);
    expect(formatDuration(w.F)).toBe('13 min');
  });

  it('25 % svarer til 15 minutter pr. undervisningstime', () => {
    expect(prepMinutesPerHour(25)).toBe(15);
  });
});

describe('tid', () => {
  it('08.10–09.50 er 100 minutter', () => {
    expect(parseClock('09.50')! - parseClock('08.10')!).toBe(100);
  });
  it('fortolker og formaterer klokkeslæt', () => {
    expect(parseClock('9')).toBe(540);
    expect(parseClock('930')).toBe(570);
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('24.00')).toBe(1440);
    expect(parseClock('25')).toBeNull();
    expect(parseClock('9.75')).toBeNull();
    expect(formatClock(110)).toBe('01.50');
  });
  it('skelner varighed, decimaltimer og klokkeslæt', () => {
    expect(formatDuration(90)).toBe('1 t 30 min');
    expect(formatDecimalHours(90)).toBe('1,50 t');
    expect(formatClock(110)).toBe('01.50');
  });
  it('dagdel efter starttid', () => {
    const s: [number, number, number] = [600, 780, 1080];
    expect(daypartOf(599, s)).toBe(0);
    expect(daypartOf(600, s)).toBe(1);
    expect(daypartOf(779, s)).toBe(1);
    expect(daypartOf(780, s)).toBe(2);
    expect(daypartOf(1080, s)).toBe(3);
  });
});

import { findFreeStart } from '../../shared/time';
describe('forslag til ledig tid', () => {
  const range = { from: 0, to: 600 };
  it('foreslår efter en eksisterende blok, ikke oven på den', () => {
    expect(findFreeStart({ preferred: 660, duration: 120, busy: [{ start: 540, end: 660 }], range })).toBe(660);
  });
  it('bliver i dagdelen, hvis der er plads før', () => {
    expect(findFreeStart({ preferred: 480, duration: 60, busy: [{ start: 480, end: 540 }], range, stayInRange: true })).toBe(540);
    expect(findFreeStart({ preferred: 480, duration: 120, busy: [{ start: 540, end: 660 }], range, stayInRange: true })).toBe(420);
  });
  it('går videre efter dagdelen, hvis den er fuld', () => {
    expect(findFreeStart({ preferred: 480, duration: 120, busy: [{ start: 0, end: 660 }], range, stayInRange: true })).toBe(660);
  });
});
