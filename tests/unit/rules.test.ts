import { describe, expect, it } from 'vitest';
import { placeBlock, updateRule } from '../../client/src/ops';
import { computeTeacherSummary } from '../../shared/calc';
import { demoAppData } from '../../shared/demo';
import { resolveTime } from '../../shared/rules';
import { emptyAppData } from '../../shared/schema';
import { SOURCE, sourceWeek } from '../../shared/source/index';
import { validateAppData } from '../../shared/validate';
import { block, rule, setup } from './helpers';

describe('tidsregler', () => {
  const d = setup();
  d.timeRules = [
    rule({ id: 'mon', day: 0, period: 0, start: 490, end: 595 }),
    rule({ id: 'fri', day: 4, period: 0, start: 505, end: 595 }),
    rule({ id: 'sat', day: 5, period: 0, start: 505, end: 595 }),
    rule({ id: 'tue-a', day: 1, period: 1, start: 610, end: 655, label: 'Fysisk' }),
    rule({ id: 'tue-b', day: 1, period: 1, start: 620, end: 665, label: 'Point' }),
    rule({ id: 'h4mon', groupIds: ['h4'], day: 0, period: 0, start: 490, end: 595 }),
  ];
  it('entydig regel, flere muligheder og ingen regel', () => {
    expect(resolveTime(d, ['h3'], 0, 0)).toMatchObject({ kind: 'single', start: 490, end: 595, ruleId: 'mon' });
    expect(resolveTime(d, ['h3'], 1, 1).kind).toBe('choice');
    expect(resolveTime(d, ['h3'], 2, 3).kind).toBe('none'); // ingen regel, ingen holdtid, ingen standardtid
  });
  it('fælles klasse: kun når hvert hold har samme dokumenterede tid', () => {
    expect(resolveTime(d, ['h3', 'h4'], 0, 0)).toMatchObject({ kind: 'single', start: 490, end: 595, source: 'combined', ruleId: null });
    expect(resolveTime(d, ['h3', 'h4'], 4, 0).kind).toBe('none');
  });
  it('holdets egen tid fra en anden dag bruges, og klassens nuværende tidsrum foretrækkes', () => {
    // Onsdag morgen har Hold 3 ingen regel: mest almindelige morgentid for holdet er 08.25–09.55 (fre + lør)
    expect(resolveTime(d, ['h3'], 2, 0)).toMatchObject({ kind: 'single', start: 505, end: 595, source: 'group', ruleId: null });
    expect(resolveTime(d, ['h3'], 2, 0, { start: 490, end: 595 })).toMatchObject({ start: 490, end: 595, source: 'group' });
  });
  it('dagdelens standardtid bruges, når holdet ingen tid har i dagdelen', () => {
    const std = { ...d, settings: { ...d.settings, standardTimes: d.settings.standardTimes.map((row) => row.map(() => ({ start: 1010, end: 1080 }))) } };
    expect(resolveTime(std, ['h3'], 2, 3)).toMatchObject({ kind: 'single', start: 1010, end: 1080, source: 'standard' });
    const b = block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 });
    expect(placeBlock({ ...std, blocks: [b] }, b, { day: 2, period: 3, roomId: 'room-1' })).toMatchObject({ kind: 'ok', block: { start: 1010, end: 1080, timeMode: 'rule', ruleId: null } });
  });
  it('flytning til anden dag ændrer tid og varighed; fredag har sine morgentider; optælling følger', () => {
    const b = block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 });
    const data = { ...d, blocks: [b] };
    const fri = placeBlock(data, b, { day: 4, period: 0, roomId: 'room-2' });
    expect(fri).toMatchObject({ kind: 'ok', block: { start: 505, end: 595, ruleId: 'fri' } });
    const before = computeTeacherSummary(data, 'th').week.U;
    const after = computeTeacherSummary({ ...data, blocks: [(fri as { block: typeof b }).block] }, 'th').week.U;
    expect(before).toBe(105);
    expect(after).toBe(90);
  });
  it('lørdag bruger lørdagens regel, og tillægget beregnes af den nye varighed', () => {
    const b = block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 });
    const sat = placeBlock({ ...d, blocks: [b] }, b, { day: 5, period: 0, roomId: 'room-1' });
    expect(sat.kind).toBe('ok');
    const placed = (sat as { block: typeof b }).block;
    expect([placed.start, placed.end]).toEqual([505, 595]);
    expect(computeTeacherSummary({ ...d, blocks: [placed] }, 'th').week.L).toBe(45);
  });
  it('kun ny sal bevarer tiden; ingen regel giver ingen opdigtet tid', () => {
    const b = block({ timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 });
    expect(placeBlock({ ...d, blocks: [b] }, b, { day: 0, period: 0, roomId: 'room-5' })).toMatchObject({ kind: 'ok', block: { start: 490, end: 595, roomId: 'room-5' } });
    expect(placeBlock({ ...d, blocks: [b] }, b, { day: 2, period: 3, roomId: 'room-1' }).kind).toBe('none');
  });
  it('egne tider bevares ved alle flytninger; lørdagstillæg følger dagen', () => {
    const b = block({ timeMode: 'custom', start: 550, end: 595 });
    for (const t of [
      { day: 0, period: 0, roomId: 'room-3' },
      { day: 2, period: 0, roomId: 'room-1' },
      { day: 3, period: 3, roomId: 'room-1' },
      { day: 5, period: 1, roomId: 'room-1' },
    ]) {
      const out = placeBlock({ ...d, blocks: [b] }, b, t);
      expect(out).toMatchObject({ kind: 'ok', block: { start: 550, end: 595, day: t.day, period: t.period } });
    }
    const sat = (placeBlock({ ...d, blocks: [b] }, b, { day: 5, period: 3, roomId: 'room-1' }) as { block: typeof b }).block;
    expect(computeTeacherSummary({ ...d, blocks: [sat] }, 'th').week.L).toBe(22.5);
  });
  it('ændret regel genberegner regelklasser og rører ikke egne tider', () => {
    const r1 = block({ id: 'r1', timeMode: 'rule', ruleId: 'mon', start: 490, end: 595 });
    const c1 = block({ id: 'c1', timeMode: 'custom', start: 490, end: 595, roomId: 'room-2', groupIds: ['h4'] });
    const res = updateRule({ ...d, blocks: [r1, c1] }, 'mon', { start: 500 });
    expect(res.changed).toEqual(['r1']);
    expect(res.data.blocks.find((b) => b.id === 'r1')!.start).toBe(500);
    expect(res.data.blocks.find((b) => b.id === 'c1')!.start).toBe(490);
  });
});

describe('kilden (KDS-arket)', () => {
  const d = demoAppData();
  const g = (name: string) => d.groups.find((x) => x.name === name)!.id;
  const times = (name: string[], day: number, period: number) => {
    const r = resolveTime(d, name.map(g), day, period);
    return r.kind === 'single' ? [r.start, r.end] : r.kind;
  };
  it('udtrækker de dokumenterede tider pr. ugedag', () => {
    expect(SOURCE.sheet.trim()).toBe('KDS');
    expect(times(['Hold 3'], 0, 0)).toEqual([490, 590]); // KDS!H4 8.10-9.50
    expect(times(['Hold 6'], 0, 0)).toEqual([490, 595]); // KDS!B4 8.10-9.55
    expect(times(['Hold 6'], 4, 0)).toEqual([505, 595]); // fredag 8.25-9.55
    expect(times(['Hold 8'], 5, 0)).toEqual([505, 595]); // lørdag KDS!D34
    expect(times(['Hold 2'], 1, 0)).toEqual([495, 590]); // KDS!H10 8.15-9.50
    expect(times(['Hold 2'], 3, 0)).toEqual([495, 585]); // KDS!H22 8.15-9.45
    expect(times(['Hold 6'], 0, 3)).toEqual([970, 1055]); // KDS!N7 16.10-17.35
    expect(times(['Hold 8', 'Hold 9'], 5, 1)).toEqual([610, 705]); // KDS!D35 fælles 10.10-11.45
    expect(times(['Kompagni B'], 5, 2)).toEqual([735, 900]); // KDS!D36 12.15-15.00
  });
  it('opfinder ikke tider: eksemplet Hold 9 kl. 09.10–09.55 findes ikke; tomme celler giver holdets egen tid', () => {
    expect(times(['Hold 6'], 1, 1)).toEqual([610, 655]); // Hold 6 formiddag (fredag KDS!B29)
    expect(times(['Hold 2'], 1, 2)).toEqual([710, 785]); // Hold 2's middagstid på en ny dag
    expect(times(['Hold 2'], 1, 3)).toEqual([1010, 1080]); // standardtid tirsdag eftermiddag
    expect(d.timeRules.some((r) => r.start === 550 && r.end === 595)).toBe(false);
    expect(d.groups.some((x) => x.name === 'Hold 1')).toBe(false);
  });
  it('samme tid i flere celler bliver én regel med begge kilder', () => {
    const one2one = d.timeRules.filter((r) => r.groupIds.join() === g('One2One') && r.day === 0 && r.period === 1);
    expect(one2one).toHaveLength(1);
    expect(one2one[0].source).toBe('KDS!N5, KDS!P5');
  });
  it('standardtider pr. dag og dagdel udledes af dokumentet', () => {
    const st = d.settings.standardTimes;
    expect(st[0][0]).toEqual({ start: 490, end: 595 }); // man morgen 8.10–9.55
    expect(st[4][0]).toEqual({ start: 505, end: 595 }); // fre morgen 8.25–9.55
    expect(st[5][0]).toEqual({ start: 505, end: 595 }); // lør morgen
    expect(st[1][1]).toEqual({ start: 610, end: 655 }); // tir formiddag 10.10–10.55
    expect(st[1][2]).toEqual({ start: 710, end: 785 }); // tir middag (ingen den dag → ugens mest almindelige)
    expect(st[0][3]).toEqual({ start: 1010, end: 1080 }); // man eftermiddag 16.50–18.00
  });
  it('morgensamlingen: fredag 8.10–8.20, Hold 3–9, Malersalen, ingen lærer forvalgt', () => {
    const a = d.settings.assembly;
    expect([a.day, a.start, a.end, a.location, a.teacherId]).toEqual([4, 490, 500, 'Malersalen', null]);
    expect(a.groupIds).toHaveLength(7);
  });
  it('ugeskemaet fra kilden er gyldigt; K-salen kan ikke placeres', () => {
    const w = sourceWeek(emptyAppData());
    expect(validateAppData(w.data).ok).toBe(true);
    expect(w.unplaced.map((e) => e.source.replace(/\s/g, ''))).toEqual(['KDS!P5', 'KDS!P6', 'KDS!P29']);
  });
});
