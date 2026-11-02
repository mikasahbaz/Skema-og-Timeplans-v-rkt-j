import { describe, expect, it } from 'vitest';
import { allConflicts, conflictsForBlock } from '../../shared/conflicts';
import { demoAppData } from '../../shared/demo';
import { emptyAppData, type Block } from '../../shared/schema';
import { validateAppData, validateBlock } from '../../shared/validate';

const b = (over: Partial<Block>): Block => ({
  id: 'x', subjectId: 's', groupId: 'g1', teacherIds: ['th'], day: 0, roomId: 'r1', start: 540, end: 660, note: '', ...over,
});

describe('konflikter', () => {
  it('fanger overlap for den anden lærer', () => {
    const existing = [b({ id: 'a', teacherIds: ['co'], roomId: 'r2', groupId: 'g2', start: 600, end: 700 })];
    const c = conflictsForBlock(b({ id: 'new', teacherIds: ['th', 'co'] }), existing);
    expect(c).toHaveLength(1);
    expect(c[0].kinds).toEqual(['teacher']);
    expect(c[0].teacherIds).toEqual(['co']);
  });
  it('sal, hold og på tværs af dagdele', () => {
    const existing = [b({ id: 'a', teacherIds: ['co'], start: 590, end: 620 })];
    const c = conflictsForBlock(b({ id: 'new' }), existing);
    expect(c[0].kinds).toEqual(['room', 'group']);
  });
  it('slut kl. 10 efterfulgt af start kl. 10 er ikke en konflikt', () => {
    expect(conflictsForBlock(b({ id: 'n', start: 600, end: 660 }), [b({ id: 'a', start: 540, end: 600 })])).toHaveLength(0);
  });
  it('ignorerer egen blok og andre dage; to lærere på samme blok er ikke en intern konflikt', () => {
    const self = b({ id: 'a', teacherIds: ['th', 'co'] });
    expect(conflictsForBlock(self, [self])).toHaveLength(0);
    expect(conflictsForBlock(b({ id: 'n', day: 1 }), [self])).toHaveLength(0);
  });
  it('allConflicts finder hvert par én gang', () => {
    const r = allConflicts([b({ id: 'a' }), b({ id: 'b', start: 600 }), b({ id: 'c', start: 900, end: 960 })]);
    expect(r.pairs).toHaveLength(1);
    expect([...r.blockIds].sort()).toEqual(['a', 'b']);
  });
  it('demodata er konfliktfri og gyldige', () => {
    const d = demoAppData();
    expect(allConflicts(d.blocks).pairs).toEqual([]);
    expect(validateAppData(d).errors).toEqual([]);
  });
});

describe('validering', () => {
  const ref = { ...emptyAppData(), teachers: [{ id: 'th', initials: 'TH', name: '', color: '#ffffff', annualHours: null, archived: false }], subjects: [{ id: 's', name: 'F', archived: false }], groups: [{ id: 'g1', name: 'H', archived: false }] };
  ref.rooms[0].id = 'r1';
  it('afviser ugyldige tider, dubletter og manglende felter', () => {
    expect(validateBlock(b({}), ref)).toEqual([]);
    expect(validateBlock(b({ start: 600, end: 600 }), ref)).toContain('Sluttid skal ligge efter starttid');
    expect(validateBlock(b({ teacherIds: ['th', 'th'] }), ref)).toContain('Samme lærer er valgt to gange');
    expect(validateBlock(b({ teacherIds: [] }), ref)).toContain('Vælg mindst én lærer');
    expect(validateBlock(b({ subjectId: 'nope' }), ref)).toContain('Vælg et fag');
    expect(validateBlock(b({ end: 1500 }), ref).length).toBeGreaterThan(0);
  });
  it('afviser ugyldige tal og dublerede initialer', () => {
    const d = { ...ref, blocks: [], settings: { ...ref.settings, prepPercent: -5 } };
    expect(validateAppData(d).ok).toBe(false);
    const d2 = { ...ref, blocks: [], teachers: [...ref.teachers, { ...ref.teachers[0], id: 'th2', initials: 'th' }] };
    expect(validateAppData(d2).errors.join()).toMatch(/Initialerne/);
    const d3 = { ...ref, blocks: [], settings: { ...ref.settings, teachingWeeks: 'tre' } };
    expect(validateAppData(d3).ok).toBe(false);
  });
});
