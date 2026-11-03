import { describe, expect, it } from 'vitest';
import { migrateAny } from '../../shared/migrate';
import type { AppData } from '../../shared/schema';
import { validateAppData } from '../../shared/validate';

const v1 = {
  schemaVersion: 1,
  teachers: [{ id: 't1', initials: 'TH', name: 'Tove', color: '#f9c6c9', annualHours: 1600, archived: false }],
  subjects: [{ id: 's1', name: 'Klassisk ballet', archived: false }],
  groups: [{ id: 'g6', name: 'Hold 6', archived: false }],
  rooms: [...Array.from({ length: 7 }, (_, i) => ({ id: `room-${i + 1}`, name: `Sal ${i + 1}` })), { id: 'room-gym', name: 'Motionsrum' }],
  blocks: [
    { id: 'match', subjectId: 's1', groupId: 'g6', teacherIds: ['t1'], day: 0, roomId: 'room-1', start: 490, end: 595, note: '' },
    { id: 'own', subjectId: 's1', groupId: 'g6', teacherIds: ['t1'], day: 0, roomId: 'room-2', start: 780, end: 840, note: 'note' },
  ],
  settings: { prepPercent: 25, saturdayPercent: 50, prepBasis: 'actual', teachingWeeks: 36, daypartStarts: [600, 780, 1080] },
};

describe('migrering fra version 1', () => {
  const { data, report } = migrateAny(v1);
  const d = data as AppData;
  it('bevarer lærere, farver, satser og klasser', () => {
    expect(validateAppData(d).errors).toEqual([]);
    expect(d.teachers).toEqual(v1.teachers);
    expect(d.blocks).toHaveLength(2);
    expect(d.settings.prepPercent).toBe(25);
    expect(d.groups.find((g) => g.id === 'g6')!.name).toBe('Hold 6'); // eksisterende hold matches på navn
  });
  it('knytter kun præcise match til en tidsregel; resten får egne tider', () => {
    const m = d.blocks.find((b) => b.id === 'match')!;
    const o = d.blocks.find((b) => b.id === 'own')!;
    expect([m.timeMode, m.title, m.period]).toEqual(['rule', 'Klassisk ballet', 0]);
    expect([o.timeMode, o.start, o.end, o.note]).toEqual(['custom', 780, 840, 'note']);
    expect(report).toEqual({ from: 1, matched: 1, custom: 1 });
  });
  it('lader et dokument i den aktuelle version være', () => {
    expect(migrateAny(d).report).toBeNull();
  });
  it('version 2 får standardtider uden at ændre klasserne', () => {
    const { standardTimes: _, ...settings } = d.settings;
    const v2 = { ...d, schemaVersion: 2, settings };
    const r = migrateAny(v2);
    const m = r.data as AppData;
    expect(validateAppData(m).errors).toEqual([]);
    expect(m.blocks).toEqual(d.blocks);
    expect(m.settings.standardTimes[0][0]).toEqual({ start: 490, end: 595 });
    expect(r.report?.from).toBe(2);
  });
});
