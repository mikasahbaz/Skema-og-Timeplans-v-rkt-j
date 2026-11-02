// Skemaets gitter: 6 dage × 4 dagdele × 8 sale. Bruges af både redigering og læsevisning.
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { memo, useMemo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { deepen } from '../../shared/colors';
import { DAY_NAMES, type AppData, type Block, type Teacher } from '../../shared/schema';
import { DAYPARTS, daypartLabel, daypartOf, formatDuration, formatRange, type DaypartIndex } from '../../shared/time';
import { Icon, TeacherChip } from './ui';

export type GridTeacher = Pick<Teacher, 'id' | 'initials' | 'color' | 'archived' | 'name'>;
export type GridData = Pick<AppData, 'rooms' | 'blocks' | 'subjects' | 'groups'> & {
  teachers: GridTeacher[];
  settings: Pick<AppData['settings'], 'daypartStarts'>;
};

export interface Filter {
  teacherId: string | null;
  groupId: string | null;
  subjectId: string | null;
}
export const emptyFilter: Filter = { teacherId: null, groupId: null, subjectId: null };
export const filterActive = (f: Filter) => Boolean(f.teacherId || f.groupId || f.subjectId);
export const matchesFilter = (b: Block, f: Filter) =>
  (!f.teacherId || b.teacherIds.includes(f.teacherId)) && (!f.groupId || b.groupId === f.groupId) && (!f.subjectId || b.subjectId === f.subjectId);

export interface CellRef {
  day: number;
  daypart: DaypartIndex;
  roomId: string;
}
export const cellId = (c: CellRef) => `cell|${c.day}|${c.daypart}|${c.roomId}`;
export function parseCellId(id: string): CellRef | null {
  const [p, d, dp, ...room] = id.split('|');
  if (p !== 'cell') return null;
  return { day: Number(d), daypart: Number(dp) as DaypartIndex, roomId: room.join('|') };
}

export interface Placement {
  mode: 'move' | 'copy';
  blockId: string;
}

export interface DragState {
  block: Block;
  copy: boolean;
}

interface GridProps {
  data: GridData;
  filter: Filter;
  editable: boolean;
  conflictIds?: Set<string>;
  placement?: Placement | null;
  drag?: DragState | null;
  flashId?: string | null;
  onCellClick?: (cell: CellRef, rect: DOMRect) => void;
  onBlockOpen?: (block: Block, rect: DOMRect) => void;
  onBlockMenu?: (block: Block, rect: DOMRect) => void;
  onBlockKey?: (block: Block, e: KeyboardEvent<HTMLElement>) => void;
  /** Vis kun én dag (mobil). */
  onlyDay?: number;
}

export function ScheduleGrid(props: GridProps) {
  const { data, filter } = props;
  const starts = data.settings.daypartStarts;
  const cells = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of data.blocks) {
      if (!matchesFilter(b, filter)) continue;
      const key = `${b.day}|${daypartOf(b.start, starts)}|${b.roomId}`;
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    return map;
  }, [data.blocks, filter, starts]);

  const lookups = useMemo(
    () => ({
      teachers: new Map(data.teachers.map((t) => [t.id, t])),
      subjects: new Map(data.subjects.map((s) => [s.id, s])),
      groups: new Map(data.groups.map((g) => [g.id, g])),
      rooms: new Map(data.rooms.map((r) => [r.id, r])),
    }),
    [data.teachers, data.subjects, data.groups, data.rooms],
  );

  const days = props.onlyDay !== undefined ? [props.onlyDay] : [0, 1, 2, 3, 4, 5];
  const placing = props.placement;

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Piletaster flytter fokus mellem celler (bruges især ved Flyt/Kopiér via tastatur).
    const target = e.target as HTMLElement;
    const pos = target.dataset.pos;
    if (!pos || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const [r, c] = pos.split(':').map(Number);
    const nr = r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
    const nc = c + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    const next = document.querySelector<HTMLElement>(`[data-pos="${nr}:${nc}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className={`grid-inner${placing ? ` placing placing-${placing.mode}` : ''}`} onKeyDown={onGridKey}>
      <div className="grid-row grid-head" role="row">
        <div className="corner">Dagdel</div>
        {data.rooms.map((r) => (
          <div key={r.id} className="room-head" role="columnheader">
            {r.name}
          </div>
        ))}
      </div>
      {days.map((day) => (
        <section key={day} className="day" aria-label={DAY_NAMES[day]}>
          <h3 className={`day-head${day === 5 ? ' day-sat' : ''}`}>
            <span className="day-name">{DAY_NAMES[day]}</span>
            {day === 5 && <span className="day-tag">lørdagstillæg</span>}
          </h3>
          {DAYPARTS.map((dpName, dp) => (
            <div key={dp} className="grid-row" role="row">
              <div className="dp-head" role="rowheader">
                <span className="dp-name">{dpName}</span>
                <span className="dp-range">{daypartLabel(dp as DaypartIndex, starts)}</span>
              </div>
              {data.rooms.map((room, ri) => (
                <Cell
                  key={room.id}
                  cell={{ day, daypart: dp as DaypartIndex, roomId: room.id }}
                  pos={`${day * 4 + dp}:${ri}`}
                  roomName={room.name}
                  dpName={dpName}
                  blocks={cells.get(`${day}|${dp}|${room.id}`) ?? []}
                  lookups={lookups}
                  grid={props}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

type Lookups = {
  teachers: Map<string, GridTeacher>;
  subjects: Map<string, { name: string; archived: boolean }>;
  groups: Map<string, { name: string; archived: boolean }>;
  rooms: Map<string, { name: string }>;
};

const Cell = memo(function Cell({
  cell,
  pos,
  roomName,
  dpName,
  blocks,
  lookups,
  grid,
}: {
  cell: CellRef;
  pos: string;
  roomName: string;
  dpName: string;
  blocks: Block[];
  lookups: Lookups;
  grid: GridProps;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(cell), disabled: !grid.editable });
  const placing = grid.placement;
  const drag = grid.drag;
  const starts = grid.data.settings.daypartStarts;
  const label = `${DAY_NAMES[cell.day]} ${dpName.toLowerCase()}, ${roomName}`;

  const source = drag?.block ?? (placing ? grid.data.blocks.find((b) => b.id === placing.blockId) : undefined);
  const isSourceCell =
    source && source.day === cell.day && source.roomId === cell.roomId && daypartOf(source.start, starts) === cell.daypart;
  let previewText = '';
  if (source && (isOver || placing)) {
    const copy = drag ? drag.copy : placing?.mode === 'copy';
    const sameDp = daypartOf(source.start, starts) === cell.daypart;
    if (isSourceCell && !copy) previewText = 'Nuværende placering';
    else if (sameDp && !(isSourceCell && copy)) previewText = `${copy ? 'Kopiér' : 'Flyt'} hertil · ${formatRange(source.start, source.end)}`;
    else previewText = `${copy ? 'Kopiér' : 'Flyt'} hertil · vælg tid`;
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!grid.editable || !grid.onCellClick) return;
    if ((e.target as HTMLElement).closest('.block')) return;
    grid.onCellClick(cell, (e.currentTarget as HTMLElement).getBoundingClientRect());
  };

  const cls = ['cell', blocks.length ? '' : 'cell-empty', isOver ? 'cell-over' : '', drag?.copy && isOver ? 'cell-over-copy' : '', isSourceCell ? 'cell-source' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} className={cls} role="gridcell" aria-label={label} onClick={onClick} data-cell={cellId(cell)}>
      {blocks.map((b) => (
        <BlockCard
          key={b.id}
          block={b}
          lookups={lookups}
          grid={grid}
          conflict={grid.conflictIds?.has(b.id) ?? false}
          flash={grid.flashId === b.id}
          dimmed={Boolean(placing && placing.blockId === b.id)}
        />
      ))}
      {isOver && previewText && <div className={`drop-preview${drag?.copy ? ' drop-preview-copy' : ''}`}>{previewText}</div>}
      {grid.editable && !placing && !drag && (
        <button
          className="cell-add"
          tabIndex={-1}
          aria-label={`Ny blok: ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            grid.onCellClick?.(cell, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect());
          }}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
      {placing && grid.editable && (
        <button
          className={`place-target${isSourceCell && placing.mode === 'move' ? ' place-target-source' : ''}`}
          data-pos={pos}
          aria-label={`${placing.mode === 'copy' ? 'Kopiér' : 'Flyt'} til ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            grid.onCellClick?.(cell, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect());
          }}
        >
          <span>{previewText}</span>
        </button>
      )}
    </div>
  );
});

export function blockBackground(teachers: (GridTeacher | undefined)[]): CSSProperties {
  const colors = teachers.map((t) => t?.color ?? '#e9e9ee');
  if (colors.length < 2) {
    return { background: colors[0], borderColor: deepen(colors[0], 0.22) };
  }
  // To lærere: to tydelige farvefelter side om side – ingen blandingsfarve.
  return {
    background: `linear-gradient(90deg, ${colors[0]} 0 50%, #ffffff 50% calc(50% + 2px), ${colors[1]} calc(50% + 2px) 100%)`,
    borderColor: deepen(colors[0], 0.22),
  };
}

function BlockCard({
  block,
  lookups,
  grid,
  conflict,
  flash,
  dimmed,
}: {
  block: Block;
  lookups: Lookups;
  grid: GridProps;
  conflict: boolean;
  flash: boolean;
  dimmed: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: block.id, disabled: !grid.editable || Boolean(grid.placement) });
  const teachers = block.teacherIds.map((id) => lookups.teachers.get(id));
  const subject = lookups.subjects.get(block.subjectId);
  const group = lookups.groups.get(block.groupId);
  const starts = grid.data.settings.daypartStarts;
  const crosses = daypartOf(block.end - 1, starts) !== daypartOf(block.start, starts);

  const open = (el: HTMLElement) => grid.onBlockOpen?.(block, el.getBoundingClientRect());
  const cls = [
    'block',
    teachers.length > 1 ? 'block-duo' : '',
    conflict ? 'block-conflict' : '',
    flash ? 'block-flash' : '',
    isDragging ? 'block-dragging' : '',
    dimmed ? 'block-dimmed' : '',
    grid.editable ? 'block-editable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const desc = `${subject?.name ?? 'Fag?'}, ${group?.name ?? 'Hold?'}, ${teachers.map((t) => t?.initials ?? '?').join(' og ')}, kl. ${formatRange(block.start, block.end)}${conflict ? ', har konflikt' : ''}`;

  return (
    <div
      ref={setNodeRef}
      className={cls}
      style={blockBackground(teachers)}
      data-block-id={block.id}
      {...(grid.editable ? attributes : {})}
      {...(grid.editable ? listeners : {})}
      role={grid.editable ? 'button' : 'article'}
      tabIndex={grid.editable && !grid.placement ? 0 : -1}
      aria-label={desc}
      aria-roledescription={grid.editable ? 'blok, kan trækkes' : undefined}
      onClick={(e) => {
        if (!grid.editable || grid.placement) return;
        e.stopPropagation();
        open(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (!grid.editable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e.currentTarget);
          return;
        }
        grid.onBlockKey?.(block, e);
      }}
    >
      <div className="block-top">
        <span className="block-time">{formatRange(block.start, block.end)}</span>
        <span className="block-dur">{formatDuration(block.end - block.start)}</span>
        {conflict && (
          <span className="block-warn" title="Konflikt">
            <Icon name="alert" size={13} />
            <span className="sr-only">Konflikt</span>
          </span>
        )}
        {grid.editable && !grid.placement && (
          <button
            className="block-menu-btn"
            aria-label={`Handlinger for ${subject?.name ?? 'blok'}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              grid.onBlockMenu?.(block, e.currentTarget.getBoundingClientRect());
            }}
          >
            <Icon name="dots" size={16} />
          </button>
        )}
      </div>
      <div className="block-subject">{subject?.name ?? 'Ukendt fag'}</div>
      <div className="block-meta">
        <span className="block-group">{group?.name ?? 'Ukendt hold'}</span>
        <span className="block-chips">
          {teachers.map((t, i) => (
            <TeacherChip key={block.teacherIds[i]} teacher={t} small />
          ))}
        </span>
      </div>
      {crosses && <div className="block-cross">fortsætter over dagdelsskel</div>}
      {block.note && <div className="block-note">{block.note}</div>}
    </div>
  );
}

/** Kompakt visning af en blok uden interaktion (træk-skygge og lister). */
export function BlockPreview({ block, data, badge }: { block: Block; data: GridData; badge?: string }) {
  const teachers = block.teacherIds.map((id) => data.teachers.find((t) => t.id === id));
  return (
    <div className="block block-overlay" style={blockBackground(teachers)}>
      {badge && <span className={`overlay-badge overlay-badge-${badge === 'Kopiér' ? 'copy' : 'move'}`}>{badge}</span>}
      <div className="block-top">
        <span className="block-time">{formatRange(block.start, block.end)}</span>
        <span className="block-dur">{formatDuration(block.end - block.start)}</span>
      </div>
      <div className="block-subject">{data.subjects.find((s) => s.id === block.subjectId)?.name}</div>
      <div className="block-meta">
        <span className="block-group">{data.groups.find((g) => g.id === block.groupId)?.name}</span>
        <span className="block-chips">
          {teachers.map((t, i) => (
            <TeacherChip key={i} teacher={t} small />
          ))}
        </span>
      </div>
    </div>
  );
}
