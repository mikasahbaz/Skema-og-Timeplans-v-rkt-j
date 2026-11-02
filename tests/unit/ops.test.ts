import { describe, expect, it } from 'vitest';
import { copyOf, placeBlock, upsertBlock } from '../../client/src/ops';
import { demoAppData } from '../../shared/demo';

describe('kopiering', () => {
  it('kopi har nyt id, bevarer egne tider og kan ændres uafhængigt', () => {
    const d = demoAppData();
    const orig = { ...d.blocks[0], timeMode: 'custom' as const, ruleId: null, start: 500, end: 560 };
    const copy = copyOf(orig);
    expect(copy.id).not.toBe(orig.id);
    copy.teacherIds.push('x');
    expect(orig.teacherIds).toHaveLength(1);
    const placed = placeBlock({ ...d, blocks: [orig] }, copyOf(orig), { day: 5, period: 3, roomId: d.rooms[2].id });
    expect(placed).toMatchObject({ kind: 'ok', block: { start: 500, end: 560, timeMode: 'custom' } });
    expect(upsertBlock(d, copy).blocks).toHaveLength(d.blocks.length + 1);
  });
});
