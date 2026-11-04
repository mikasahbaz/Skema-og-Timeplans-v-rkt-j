import { describe, expect, it } from 'vitest';
import { computeTeacherSummary, prepMinutesPerHour, prepPercentFromMinutes } from '../../shared/calc';
import { demoAppData } from '../../shared/demo';
import { formatClock, formatDecimalHours, formatDuration, parseClock } from '../../shared/time';
import { block, setup } from './helpers';

const A = block({ id: 'A', day: 0 }); // mandag 09–11, TH
const B = block({ id: 'B', day: 5, teacherIds: ['th', 'co'] }); // lørdag 09–11, TH + CO

describe('beregningseksempler (lørdag hver uge, præcis)', () => {
  it('Eksempel A: mandag 09–11 TH', () => {
    const d = setup();
    d.blocks = [A];
    expect(computeTeacherSummary(d, 'th').week).toEqual({ weekdayU: 120, weekdayF: 30, saturday: 0, saturdayF: 0, K: 150 });
  });
  it('Eksempel B: lørdag 09–11 TH + CO – begge får hele tiden', () => {
    const d = setup();
    d.blocks = [B];
    for (const t of ['th', 'co']) {
      const s = computeTeacherSummary(d, t);
      expect(s.saturday).toEqual({ U: 120, counted: 180, F: 30 });
      expect(s.week.K).toBe(210);
    }
  });
  it('Eksempel C: A + B, sæson og timebank', () => {
    const d = setup();
    d.teachers[0].contractHours = 26;
    d.settings.orientationHours = 1;
    d.blocks = [A, B];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week.K).toBe(360);
    expect(th.annual.plannedHours).toBe(216);
    expect(th.timebank.week).toBe(1500 - 360);
    expect(th.timebank.season).toBe((1500 - 360) * 36);
    expect(computeTeacherSummary(d, 'co').week.K).toBe(210);
  });
  it('Eksempel D: forberedelse af lørdagstid inkl. tillæg', () => {
    const d = setup();
    d.settings.prepBasis = 'withSaturday';
    d.blocks = [B];
    expect(computeTeacherSummary(d, 'th').week.K).toBe(225);
  });
  it('en klasse med to hold tælles én gang pr. lærer', () => {
    const d = setup();
    d.blocks = [block({ groupIds: ['h3', 'h4'], teacherIds: ['th', 'co'] })];
    expect(computeTeacherSummary(d, 'th').week.weekdayU).toBe(120);
    expect(computeTeacherSummary(d, 'co').week.weekdayU).toBe(120);
  });
  it('lørdage fordeles på undervisningsugerne', () => {
    const d = setup();
    d.settings.saturdaysPerSeason = 18;
    d.blocks = [B];
    const s = computeTeacherSummary(d, 'th');
    expect(s.seasonSaturday.counted).toBe(180 * 18);
    expect(s.week.saturday).toBe((180 * 18) / 36);
    d.teachers[0].saturdays = 9; // lærerens eget antal lørdage
    expect(computeTeacherSummary(d, 'th').week.saturday).toBe((180 * 9) / 36);
  });
  it('uden forberedelse på en klasse', () => {
    const d = setup();
    d.blocks = [A, block({ id: 'n', day: 1, noPrep: true })];
    expect(computeTeacherSummary(d, 'th').week.weekdayF).toBe(30);
  });
  it('manglende oplysninger er ikke nul; 0 er gyldigt', () => {
    const d = setup();
    d.settings.prepPercent = null;
    d.blocks = [A, B];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week.weekdayF).toBeNull();
    expect(th.week.K).toBeNull();
    expect(th.timebank.week).toBeNull();
    expect(th.missing).toContain('contractHours');
    d.settings.prepPercent = 0;
    d.settings.saturdaysPerSeason = null;
    expect(computeTeacherSummary(d, 'th').week.saturday).toBeNull();
    expect(computeTeacherSummary(d, 'th').missing).toContain('saturdaysPerSeason');
    d.blocks = [A];
    expect(computeTeacherSummary(d, 'th').week.K).toBe(120);
  });
  it('25 min pr. time = 41,67 %, og 25 % = 15 min pr. time', () => {
    expect(prepMinutesPerHour(25)).toBe(15);
    expect(prepMinutesPerHour(prepPercentFromMinutes(25))).toBeCloseTo(25, 10);
  });
});

describe('timeopgørelsen for FM, sæson 26/27 (Fernando_Mora_timer_26_27.docx)', () => {
  const d = demoAppData();
  const fm = d.teachers.find((t) => t.initials === 'FM')!;
  const s = computeTeacherSummary(d, fm.id);
  it('undervisning og forberedelse mandag–fredag: 10 t 25 min og 4 t 20 min', () => {
    expect(formatDuration(s.week.weekdayU)).toBe('10 t 25 min');
    expect(formatDuration(s.week.weekdayF)).toBe('4 t 20 min');
  });
  it('lørdage: 3 t 51 min pr. lørdag, 69 t 18 min pr. sæson, 1 t 41 min pr. uge', () => {
    expect(formatDuration(s.saturday.counted)).toBe('3 t 51 min');
    expect(formatDuration(s.seasonSaturday.counted)).toBe('69 t 18 min');
    expect(formatDuration(s.week.saturday)).toBe('1 t 41 min');
  });
  it('forberedelse lørdage: 28 t 48 min pr. sæson, 42 min pr. uge', () => {
    expect(formatDuration(s.seasonSaturday.F)).toBe('28 t 48 min');
    expect(formatDuration(s.week.saturdayF)).toBe('42 min');
  });
  it('timebank: 7 t 52 min pr. uge og 322 t 32 min pr. sæson', () => {
    expect(s.contract).toEqual({ hours: 26, orientation: 1, available: 1500 });
    expect(formatDuration(s.timebank.week)).toBe('7 t 52 min');
    expect(formatDuration(s.timebank.season)).toBe('322 t 32 min');
  });
  it('præcis beregning giver få minutters forskel', () => {
    const exact = computeTeacherSummary({ ...d, settings: { ...d.settings, rounding: 'exact' } }, fm.id);
    expect(formatDuration(exact.timebank.week)).toBe('7 t 51 min');
  });
});

describe('morgensamling', () => {
  const withAssembly = () => {
    const d = setup();
    d.settings.assembly = { ...d.settings.assembly, enabled: true, day: 4, start: 490, end: 500, groupIds: ['h3'] };
    return d;
  };
  it('giver ingen lærertimer uden valgt lærer og indgår én gang hos den valgte', () => {
    const d = withAssembly();
    expect(computeTeacherSummary(d, 'th').week.weekdayU).toBe(0);
    d.settings.assembly.teacherId = 'th';
    expect(computeTeacherSummary(d, 'th').week).toMatchObject({ weekdayU: 10, weekdayF: 2.5, K: 12.5 });
    d.settings.assembly.teacherId = 'co';
    expect(computeTeacherSummary(d, 'th').week.weekdayU).toBe(0);
    expect(computeTeacherSummary(d, 'co').week.weekdayU).toBe(10);
  });
  it('har sin egen forberedelsesregel', () => {
    const d = withAssembly();
    d.settings.assembly.teacherId = 'th';
    d.blocks = [block({ day: 4 })];
    d.settings.assembly.prepMode = 'none';
    expect(computeTeacherSummary(d, 'th').week.weekdayF).toBe(30);
    d.settings.assembly.prepMode = 'custom';
    d.settings.assembly.prepPercent = 100;
    expect(computeTeacherSummary(d, 'th').week.weekdayF).toBe(40);
    d.settings.assembly.prepPercent = null;
    expect(computeTeacherSummary(d, 'th').week.weekdayF).toBeNull();
  });
});

describe('tid', () => {
  it('08.10–09.50 er 100 minutter, og formaterne adskilles', () => {
    expect(parseClock('09.50')! - parseClock('08.10')!).toBe(100);
    expect(formatDuration(90)).toBe('1 t 30 min');
    expect(formatDecimalHours(90)).toBe('1,50 t');
    expect(formatClock(110)).toBe('01.50');
  });
});
