// Smal skærm: én dag ad gangen, klasser grupperet efter dagdel med salens navn.
import { useMemo } from 'react';
import { DAY_NAMES, DAY_SHORT, PERIOD_NAMES, type Block } from '../../shared/schema';
import { formatDuration, formatRange } from '../../shared/time';
import { blockBackground, groupsLabel, type CellRef, type GridData } from './Grid';
import { Icon, TeacherChip } from './ui';

export function DayTabs({ day, onDay }: { day: number; onDay: (d: number) => void }) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Ugedag">
      {DAY_SHORT.map((d, i) => (
        <button key={d} role="tab" aria-selected={day === i} className={day === i ? 'on' : ''} onClick={() => onDay(i)}>
          {d}
        </button>
      ))}
    </div>
  );
}

export function DayList({
  data,
  day,
  conflictIds,
  onOpen,
  onPlace,
}: {
  data: GridData;
  day: number;
  conflictIds?: Set<string>;
  onOpen?: (b: Block, rect: DOMRect) => void;
  /** Under placering: tryk på en dagdel for at vælge den (første sal). */
  onPlace?: (cell: CellRef) => void;
}) {
  const byPeriod = useMemo(() => {
    const out: Block[][] = [[], [], [], []];
    const order = new Map(data.rooms.map((r, i) => [r.id, i]));
    for (const b of data.blocks) if (b.day === day) out[b.period].push(b);
    out.forEach((l) => l.sort((a, b) => a.start - b.start || order.get(a.roomId)! - order.get(b.roomId)!));
    return out;
  }, [data.blocks, data.rooms, day]);
  const a = data.assembly;
  return (
    <div className="day-list">
      <h2 className="dl-day">{DAY_NAMES[day]}</h2>
      {a.enabled && a.day === day && (
        <p className="assembly assembly-inline">
          Morgensamling {formatRange(a.start, a.end)} · {groupsLabel(a.groupIds, data.groups)} · {a.location}
        </p>
      )}
      {PERIOD_NAMES.map((name, p) => (
        <section key={p} className="dl-part">
          <h3 className="label">
            {name}
            {onPlace && (
              <button className="btn btn-sm" onClick={() => onPlace({ day, period: p, roomId: data.rooms[0].id })}>
                Placér her
              </button>
            )}
          </h3>
          {byPeriod[p].length === 0 && <p className="hint">Ingen undervisning</p>}
          {byPeriod[p].map((b) => {
            const ts = b.teacherIds.map((id) => data.teachers.find((t) => t.id === id));
            const Tag = onOpen ? 'button' : 'div';
            return (
              <Tag
                key={b.id}
                className={`dl-block block${conflictIds?.has(b.id) ? ' block-conflict' : ''}`}
                style={blockBackground(ts)}
                onClick={onOpen ? (e: React.MouseEvent<HTMLElement>) => onOpen(b, e.currentTarget.getBoundingClientRect()) : undefined}
              >
                <div className="dl-time">
                  <strong className="tabular">{formatRange(b.start, b.end)}</strong>
                  <span className="hint">{formatDuration(b.end - b.start)}</span>
                </div>
                <div className="dl-main">
                  <div className="block-title">
                    {b.title}
                    {b.timeMode === 'custom' && <Icon name="lock" size={12} className="lock-icon" title="Egne tider" />}
                  </div>
                  <div className="block-meta">
                    <span>
                      {groupsLabel(b.groupIds, data.groups)} · {data.rooms.find((r) => r.id === b.roomId)?.name}
                    </span>
                    <span className="block-chips">
                      {ts.map((t, i) => (
                        <TeacherChip key={i} teacher={t} small />
                      ))}
                    </span>
                  </div>
                </div>
              </Tag>
            );
          })}
        </section>
      ))}
    </div>
  );
}
