import { describe, expect, it } from 'vitest';
import { allConflicts, conflictsForBlock } from '../../shared/conflicts';
import { demoAppData } from '../../shared/demo';
import { validateAppData, validateBlock } from '../../shared/validate';
import { block, rule, setup } from './helpers';

describe('konflikter', () => {
  it('fanger overlap for den anden lærer, fælles hold og sal – også over dagdele', () => {
    const d = setup();
    d.blocks = [block({ id: 'a', teacherIds: ['co'], roomId: 'room-2', groupIds: ['h4'], start: 600, end: 700, period: 1 })];
    expect(conflictsForBlock(block({ id: 'n', teacherIds: ['th', 'co'] }), d)[0].kinds).toEqual(['teacher']);
    expect(conflictsForBlock(block({ id: 'n', groupIds: ['h3', 'h4'] }), d)[0].kinds).toEqual(['group']);
  });
  it('slut kl. 10 og start kl. 10 er ikke en konflikt; egen klasse ignoreres', () => {
    const d = setup();
    d.blocks = [block({ id: 'a', start: 540, end: 600 })];
    expect(conflictsForBlock(block({ id: 'n', start: 600, end: 660 }), d)).toHaveLength(0);
    expect(conflictsForBlock(d.blocks[0], d)).toHaveLength(0);
  });
  it('morgensamlingen booker ingen sal, men tjekker hold og lærer', () => {
    const d = setup();
    d.settings.assembly = { ...d.settings.assembly, enabled: true, day: 4, start: 490, end: 500, groupIds: ['h3'], teacherId: 'co' };
    expect(conflictsForBlock(block({ id: 'n', day: 4, groupIds: ['h4'], teacherIds: ['th'], start: 490, end: 560 }), d)).toHaveLength(0);
    expect(conflictsForBlock(block({ id: 'n', day: 4, groupIds: ['h3'], start: 490, end: 560 }), d)[0].kinds).toEqual(['group']);
    expect(conflictsForBlock(block({ id: 'n', day: 4, groupIds: ['h4'], teacherIds: ['co'], start: 495, end: 560 }), d)[0].kinds).toEqual(['teacher']);
  });
  it('kildens ugeskema er konfliktfrit og gyldigt', () => {
    const d = demoAppData();
    expect(allConflicts(d).pairs).toEqual([]);
    expect(validateAppData(d).errors).toEqual([]);
  });
});

describe('validering', () => {
  const d = setup();
  d.timeRules = [rule({ id: 'mon' })];
  it('afviser ugyldige tider, dubletter og manglende felter', () => {
    expect(validateBlock(block({}), d)).toEqual([]);
    expect(validateBlock(block({ end: 540 }), d)).toContain('Sluttid skal ligge efter starttid');
    expect(validateBlock(block({ teacherIds: ['th', 'th'] }), d)).toContain('Samme lærer er valgt to gange');
    expect(validateBlock(block({ groupIds: [] }), d)).toContain('Vælg mindst ét hold');
    expect(validateBlock(block({ title: '' }), d)).toContain('Titel mangler');
  });
  it('en regelklasse skal have reglens tid', () => {
    expect(validateBlock(block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 }), d)).toEqual([]);
    expect(validateBlock(block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 600 }), d)).toContain('Klassens tid stemmer ikke med tidstabellen');
    expect(validateBlock(block({ timeMode: 'custom', ruleId: 'mon' }), d)).toContain('En klasse med egne tider kan ikke have en tidsregel');
  });
  it('afviser ugyldige tal og dublerede initialer', () => {
    expect(validateAppData({ ...d, settings: { ...d.settings, prepPercent: -5 } }).ok).toBe(false);
    expect(validateAppData({ ...d, teachers: [...d.teachers, { ...d.teachers[0], id: 'x', initials: 'th' }] }).errors.join()).toMatch(/Initialerne/);
  });
});
