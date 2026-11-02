import { describe, expect, it } from 'vitest';
import { computeTeacherSummary, prepMinutesPerHour } from '../../shared/calc';
import { formatClock, formatDecimalHours, formatDuration, parseClock } from '../../shared/time';
import { block, setup } from './helpers';

const A = block({ id: 'A', day: 0 }); // mandag 09–11, TH
const B = block({ id: 'B', day: 5, teacherIds: ['th', 'co'] }); // lørdag 09–11, TH + CO

describe('beregningseksempler', () => {
  it('Eksempel A: mandag 09–11 TH', () => {
    const d = setup();
    d.blocks = [A];
    expect(computeTeacherSummary(d, 'th').days[0]).toEqual({ U: 120, F: 30, L: 0, UF: 150, K: 150 });
  });
  it('Eksempel B: lørdag 09–11 TH + CO – begge får hele tiden', () => {
    const d = setup();
    d.blocks = [B];
    for (const t of ['th', 'co']) expect(computeTeacherSummary(d, t).week).toEqual({ U: 120, F: 30, L: 60, UF: 150, K: 210 });
  });
  it('Eksempel C: A + B', () => {
    const d = setup();
    d.blocks = [A, B];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week).toEqual({ U: 240, F: 60, L: 60, UF: 300, K: 360 });
    expect(th.annual.plannedHours).toBe(216);
    expect(th.annual.remainingHours).toBe(1384);
    expect(computeTeacherSummary(d, 'co').week.K).toBe(210);
  });
  it('Eksempel D: forberedelse inkl. lørdagstillæg', () => {
    const d = setup();
    d.settings.prepBasis = 'withSaturday';
    d.blocks = [B];
    expect(computeTeacherSummary(d, 'th').week).toEqual({ U: 120, F: 45, L: 60, UF: 165, K: 225 });
  });
  it('en klasse med to hold tælles én gang pr. lærer', () => {
    const d = setup();
    d.blocks = [block({ groupIds: ['h3', 'h4'], teacherIds: ['th', 'co'] })];
    expect(computeTeacherSummary(d, 'th').week.U).toBe(120);
    expect(computeTeacherSummary(d, 'co').week.U).toBe(120);
  });
  it('manglende satser og årsdata er ikke nul; 0 er gyldigt', () => {
    const d = setup();
    d.settings.prepPercent = null;
    d.settings.teachingWeeks = null;
    d.blocks = [A];
    const th = computeTeacherSummary(d, 'th');
    expect(th.week.F).toBeNull();
    expect(th.week.K).toBeNull();
    expect(th.annual.plannedHours).toBeNull();
    d.settings.prepPercent = 0;
    d.settings.teachingWeeks = 36;
    expect(computeTeacherSummary(d, 'th').week.K).toBe(120);
  });
  it('fuld præcision; afrunding kun ved visning', () => {
    const d = setup();
    d.blocks = [block({ start: 540, end: 590 })];
    const w = computeTeacherSummary(d, 'th').week;
    expect(w.F).toBe(12.5);
    expect(formatDuration(w.F)).toBe('13 min');
    expect(prepMinutesPerHour(25)).toBe(15);
  });
});

describe('morgensamling', () => {
  const withAssembly = () => {
    const d = setup();
    d.settings.assembly = { ...d.settings.assembly, enabled: true, day: 4, start: 490, end: 500, groupIds: ['h3'] };
    return d;
  };
  it('giver ingen lærertimer uden valgt lærer', () => {
    const d = withAssembly();
    expect(computeTeacherSummary(d, 'th').week.U).toBe(0);
  });
  it('indgår én gang hos den valgte lærer og følger skift', () => {
    const d = withAssembly();
    d.settings.assembly.teacherId = 'th';
    expect(computeTeacherSummary(d, 'th').days[4]).toEqual({ U: 10, F: 2.5, L: 0, UF: 12.5, K: 12.5 });
    d.settings.assembly.teacherId = 'co';
    expect(computeTeacherSummary(d, 'th').week.U).toBe(0);
    expect(computeTeacherSummary(d, 'co').week.U).toBe(10);
  });
  it('har sin egen forberedelsesregel uden at ændre klassernes', () => {
    const d = withAssembly();
    d.settings.assembly.teacherId = 'th';
    d.blocks = [block({ day: 4 })];
    d.settings.assembly.prepMode = 'none';
    expect(computeTeacherSummary(d, 'th').days[4].F).toBe(30); // kun klassen: 120 × 25 %
    d.settings.assembly.prepMode = 'custom';
    d.settings.assembly.prepPercent = 100;
    expect(computeTeacherSummary(d, 'th').days[4].F).toBe(40); // 30 + 10 × 100 %
    d.settings.assembly.prepPercent = null;
    expect(computeTeacherSummary(d, 'th').days[4].F).toBeNull();
  });
});

describe('tid', () => {
  it('08.10–09.50 er 100 minutter og formater adskilles', () => {
    expect(parseClock('09.50')! - parseClock('08.10')!).toBe(100);
    expect(formatDuration(90)).toBe('1 t 30 min');
    expect(formatDecimalHours(90)).toBe('1,50 t');
    expect(formatClock(110)).toBe('01.50');
    expect(parseClock('25')).toBeNull();
  });
});
