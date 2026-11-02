// Mobil dagsvisning: én dag ad gangen, blokke grupperet efter dagdel med salens navn.
import { useMemo } from 'react';
import { DAY_NAMES, DAY_SHORT, type Block } from '../../shared/schema';
import { DAYPARTS, daypartLabel, daypartOf, formatDuration, formatRange, type DaypartIndex } from '../../shared/time';
import { blockBackground, matchesFilter, type Filter, type GridData } from './Grid';
import { Icon, TeacherChip } from './ui';

export function DayTabs({ day, onDay, counts }: { day: number; onDay: (d: number) => void; counts?: number[] }) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Ugedag">
      {DAY_SHORT.map((d, i) => (
        <button key={d} role="tab" aria-selected={day === i} className={day === i ? 'on' : ''} onClick={() => onDay(i)}>
          {d}
          {counts && <span className="count">{counts[i]}</span>}
        </button>
      ))}
    </div>
  );
}

export function DayList({
  data,
  day,
  filter,
  conflictIds,
  onOpen,
  onAdd,
}: {
  data: GridData;
  day: number;
  filter: Filter;
  conflictIds?: Set<string>;
  onOpen?: (b: Block, rect: DOMRect) => void;
  onAdd?: (daypart: DaypartIndex) => void;
}) {
  const starts = data.settings.daypartStarts;
  const byDp = useMemo(() => {
    const out: Block[][] = [[], [], [], []];
    for (const b of data.blocks) if (b.day === day && matchesFilter(b, filter)) out[daypartOf(b.start, starts)].push(b);
    const order = new Map(data.rooms.map((r, i) => [r.id, i]));
    out.forEach((l) => l.sort((a, b) => a.start - b.start || order.get(a.roomId)! - order.get(b.roomId)!));
    return out;
  }, [data.blocks, data.rooms, day, filter, starts]);

  return (
    <div className="day-list">
      <h2 className="dl-day">{DAY_NAMES[day]}</h2>
      {DAYPARTS.map((name, dp) => (
        <section key={dp} className="dl-part">
          <h3>
            {name} <span className="muted">{daypartLabel(dp as DaypartIndex, starts)}</span>
            {onAdd && (
              <button className="btn btn-sm btn-ghost" onClick={() => onAdd(dp as DaypartIndex)} aria-label={`Ny blok ${name.toLowerCase()}`}>
                <Icon name="plus" size={13} />
              </button>
            )}
          </h3>
          {byDp[dp].length === 0 && <p className="muted small dl-empty">Ingen undervisning</p>}
          {byDp[dp].map((b) => {
            const teachers = b.teacherIds.map((id) => data.teachers.find((t) => t.id === id));
            const Tag = onOpen ? 'button' : 'div';
            return (
              <Tag
                key={b.id}
                className={`dl-block block${conflictIds?.has(b.id) ? ' block-conflict' : ''}`}
                style={blockBackground(teachers)}
                onClick={onOpen ? (e: React.MouseEvent<HTMLElement>) => onOpen(b, e.currentTarget.getBoundingClientRect()) : undefined}
              >
                <div className="dl-time">
                  <strong className="tabular">{formatRange(b.start, b.end)}</strong>
                  <span className="muted small">{formatDuration(b.end - b.start)}</span>
                </div>
                <div className="dl-main">
                  <div className="block-subject">{data.subjects.find((s) => s.id === b.subjectId)?.name}</div>
                  <div className="block-meta">
                    <span>
                      {data.groups.find((g) => g.id === b.groupId)?.name} · {data.rooms.find((r) => r.id === b.roomId)?.name}
                    </span>
                    <span className="block-chips">
                      {teachers.map((t, i) => (
                        <TeacherChip key={i} teacher={t} small />
                      ))}
                    </span>
                  </div>
                  {b.note && <div className="block-note">{b.note}</div>}
                </div>
                {conflictIds?.has(b.id) && <Icon name="alert" size={14} className="dl-warn" />}
              </Tag>
            );
          })}
        </section>
      ))}
    </div>
  );
}
