import { describe, expect, it } from 'vitest';
import { copyOf, splitBlock, upsertBlock } from '../../client/src/ops';
import { computeTeacherSummary } from '../../shared/calc';
import { demoAppData } from '../../shared/demo';

describe('blokoperationer', () => {
  it('kopi har nyt id og kan ændres uafhængigt af originalen', () => {
    const d = demoAppData();
    const orig = d.blocks[0];
    const copy = copyOf(orig, { day: 2 });
    expect(copy.id).not.toBe(orig.id);
    copy.teacherIds.push('t-co');
    expect(orig.teacherIds).toEqual(['t-th']);
    const next = upsertBlock(d, copy);
    expect(next.blocks).toHaveLength(d.blocks.length + 1);
    expect(next.blocks.find((b) => b.id === orig.id)).toEqual(orig);
  });

  it('del blok giver to sammenhængende blokke med samme samlede tid', () => {
    const d = demoAppData();
    const b = d.blocks.find((x) => x.teacherIds.length === 2)!;
    const before = computeTeacherSummary(d, b.teacherIds[0]).week.U;
    const r = splitBlock(d, b.id, b.start + 30)!;
    const parts = r.data.blocks.filter((x) => x.id === b.id || x.id === r.second.id);
    expect(parts.map((x) => [x.start, x.end])).toEqual([
      [b.start, b.start + 30],
      [b.start + 30, b.end],
    ]);
    expect(computeTeacherSummary(r.data, b.teacherIds[0]).week.U).toBe(before);
    expect(splitBlock(d, b.id, b.start)).toBeNull();
  });
});
