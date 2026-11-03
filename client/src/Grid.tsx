// Skematavlen: 6 dage × 4 dagdele (som i skemadokumentet) × 8 sale. Bruges af redigering og læsevisning.
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import { deepen } from '../../shared/colors';
import { DAY_NAMES, PERIOD_NAMES, type AppData, type Block, type Teacher } from '../../shared/schema';
import { formatRange } from '../../shared/time';
import { Icon, TeacherChip } from './ui';

export type GridTeacher = Pick<Teacher, 'id' | 'initials' | 'color' | 'archived' | 'name'>;
export interface GridAssembly {
  enabled: boolean;
  day: number;
  start: number;
  end: number;
  groupIds: string[];
  location: string;
  teacherId: string | null;
}
export type GridData = Pick<AppData, 'rooms' | 'blocks' | 'groups'> & { teachers: GridTeacher[]; assembly: GridAssembly };

export interface CellRef {
  day: number;
  period: number;
  roomId: string;
}
export const cellId = (c: CellRef) => `cell|${c.day}|${c.period}|${c.roomId}`;
export function parseCellId(id: string): CellRef | null {
  const [p, d, pe, ...room] = id.split('|');
  if (p !== 'cell') return null;
  return { day: Number(d), period: Number(pe), roomId: room.join('|') };
}

export type PlaceMode = 'move' | 'copy' | 'create';
export interface Placement {
  mode: PlaceMode;
  block: Block;
}

/** "Hold 6" + "Hold 7" → "Hold 6 + 7"; "Hold 3"…"Hold 9" → "Hold 3–9". */
export function groupsLabel(ids: readonly string[], groups: GridData['groups']): string {
  const names = ids.map((id) => groups.find((g) => g.id === id)?.name ?? '?');
  const nums = names.map((n) => n.match(/^Hold (\d+)$/)?.[1]).map((x) => (x ? Number(x) : NaN));
  if (names.length > 1 && nums.every((n) => !Number.isNaN(n))) {
    const sorted = [...nums].sort((a, b) => a - b);
    const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
    if (consecutive && sorted.length > 2) return `Hold ${sorted[0]}–${sorted[sorted.length - 1]}`;
    return `Hold ${sorted.join(' + ')}`;
  }
  return names.join(' + ');
}

export function blockBackground(teachers: (GridTeacher | undefined)[]): CSSProperties {
  const colors = teachers.map((t) => t?.color ?? '#ecebe8');
  if (colors.length < 2) return { background: colors[0], borderColor: deepen(colors[0], 0.18) };
  // To lærere: to farvefelter side om side – ingen blandingsfarve.
  return {
    background: `linear-gradient(90deg, ${colors[0]} 0 50%, #ffffff 50% calc(50% + 2px), ${colors[1]} calc(50% + 2px) 100%)`,
    borderColor: deepen(colors[0], 0.18),
  };
}

interface GridProps {
  data: GridData;
  editable: boolean;
  conflictIds?: Set<string>;
  placement?: Placement | null;
  /** Forventet tid i målcellen under træk eller placering (fx "10.10–10.55" eller "Ingen tidsregel"). */
  previewFor?: (block: Block, cell: CellRef) => string;
  dragging?: Block | null;
  flashId?: string | null;
  selectedId?: string | null;
  onCellTap?: (cell: CellRef, rect: DOMRect) => void;
  onBlockTap?: (block: Block, rect: DOMRect) => void;
  onBlockKey?: (block: Block, e: KeyboardEvent<HTMLElement>) => void;
  onAssemblyTap?: () => void;
  onlyDay?: number;
}

export function ScheduleGrid(props: GridProps) {
  const { data } = props;
  const cells = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of data.blocks) {
      const key = `${b.day}|${b.period}|${b.roomId}`;
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    return map;
  }, [data.blocks]);
  const teachers = useMemo(() => new Map(data.teachers.map((t) => [t.id, t])), [data.teachers]);
  const days = props.onlyDay !== undefined ? [props.onlyDay] : [0, 1, 2, 3, 4, 5];

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const pos = (e.target as HTMLElement).dataset.pos;
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
    <div className={`board${props.placement ? ` placing placing-${props.placement.mode}` : ''}`} onKeyDown={onGridKey}>
      <div className="board-row board-head" role="row">
        <div className="corner" />
        {data.rooms.map((r) => (
          <div key={r.id} className="room-head" role="columnheader">
            {r.name}
          </div>
        ))}
      </div>
      {days.map((day) => (
        <section key={day} className="day" aria-label={DAY_NAMES[day]}>
          <div className="day-head">
            <h3 className="day-name">{DAY_NAMES[day]}</h3>
            {data.assembly.enabled && data.assembly.day === day && (
              <AssemblyChip data={data} teacher={data.assembly.teacherId ? teachers.get(data.assembly.teacherId) : undefined} onTap={props.onAssemblyTap} conflict={props.conflictIds?.has('morgensamling')} />
            )}
          </div>
          {PERIOD_NAMES.map((name, period) => (
            <div key={period} className="board-row" role="row">
              <div className="period-head" role="rowheader">
                {name}
              </div>
              {data.rooms.map((room, ri) => (
                <Cell
                  key={room.id}
                  cell={{ day, period, roomId: room.id }}
                  pos={`${day * 4 + period}:${ri}`}
                  label={`${DAY_NAMES[day]} ${name.toLowerCase()}, ${room.name}`}
                  blocks={cells.get(`${day}|${period}|${room.id}`) ?? []}
                  teachers={teachers}
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

function AssemblyChip({ data, teacher, onTap, conflict }: { data: GridData; teacher: GridTeacher | undefined; onTap?: () => void; conflict?: boolean }) {
  const a = data.assembly;
  const text = (
    <>
      <span className="asm-title">Morgensamling</span>
      <span className="tabular">{formatRange(a.start, a.end)}</span>
      {a.groupIds.length > 0 && <span>{groupsLabel(a.groupIds, data.groups)}</span>}
      {a.location && <span>{a.location}</span>}
      {teacher ? <TeacherChip teacher={teacher} small /> : <span className="asm-none">ingen lærer valgt</span>}
      {conflict && <Icon name="alert" size={14} className="warn-icon" />}
    </>
  );
  return onTap ? (
    <button className="assembly" onClick={onTap} aria-label="Morgensamling – åbn indstillinger">
      {text}
    </button>
  ) : (
    <div className="assembly">{text}</div>
  );
}

function Cell({
  cell,
  pos,
  label,
  blocks,
  teachers,
  grid,
}: {
  cell: CellRef;
  pos: string;
  label: string;
  blocks: Block[];
  teachers: Map<string, GridTeacher>;
  grid: GridProps;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(cell), disabled: !grid.editable });
  const placing = grid.placement;
  const moving = grid.dragging ?? placing?.block ?? null;
  const isSource =
    moving && placing?.mode !== 'create' && moving.day === cell.day && moving.period === cell.period && moving.roomId === cell.roomId && grid.data.blocks.some((b) => b.id === moving.id);
  const preview = moving && (isOver || placing) && grid.previewFor ? grid.previewFor(moving, cell) : '';

  const cls = ['cell', blocks.length ? '' : 'cell-empty', isOver ? 'cell-over' : '', isSource ? 'cell-source' : ''].filter(Boolean).join(' ');
  return (
    <div
      ref={setNodeRef}
      className={cls}
      role="gridcell"
      aria-label={label}
      data-cell={cellId(cell)}
      onClick={(e) => {
        if (!grid.editable || placing || (e.target as HTMLElement).closest('.block')) return;
        grid.onCellTap?.(cell, e.currentTarget.getBoundingClientRect());
      }}
    >
      {blocks.map((b) => (
        <BlockCard key={b.id} block={b} teachers={teachers} grid={grid} conflict={grid.conflictIds?.has(b.id) ?? false} />
      ))}
      {isOver && preview && <div className="drop-preview">{preview}</div>}
      {placing && grid.editable && (
        <button
          className="place-target"
          data-pos={pos}
          aria-label={`Placér i ${label}${preview ? `: ${preview}` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            grid.onCellTap?.(cell, e.currentTarget.parentElement!.getBoundingClientRect());
          }}
        >
          <span>{isSource && placing.mode === 'move' ? 'Nuværende plads' : preview}</span>
        </button>
      )}
    </div>
  );
}

function BlockCard({ block, teachers, grid, conflict }: { block: Block; teachers: Map<string, GridTeacher>; grid: GridProps; conflict: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: block.id, disabled: !grid.editable || Boolean(grid.placement) });
  const ts = block.teacherIds.map((id) => teachers.get(id));
  const groups = groupsLabel(block.groupIds, grid.data.groups);
  const custom = block.timeMode === 'custom';
  const cls = [
    'block',
    ts.length > 1 ? 'block-duo' : '',
    conflict ? 'block-conflict' : '',
    grid.flashId === block.id ? 'block-flash' : '',
    isDragging ? 'block-dragging' : '',
    grid.selectedId === block.id ? 'block-selected' : '',
    grid.placement && grid.placement.block.id === block.id ? 'block-placing' : '',
    grid.editable ? 'block-editable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const desc = `${block.title}, ${groups}, ${ts.map((t) => t?.initials ?? '?').join(' og ')}, kl. ${formatRange(block.start, block.end)}${custom ? ', egne tider' : ''}${conflict ? ', har konflikt' : ''}`;
  return (
    <div
      ref={setNodeRef}
      className={cls}
      style={blockBackground(ts)}
      data-block-id={block.id}
      {...(grid.editable ? attributes : {})}
      {...(grid.editable ? listeners : {})}
      role={grid.editable ? 'button' : 'article'}
      tabIndex={grid.editable && !grid.placement ? 0 : -1}
      aria-label={desc}
      aria-roledescription={grid.editable ? 'klasse, kan trækkes' : undefined}
      onClick={(e) => {
        if (!grid.editable || grid.placement) return;
        e.stopPropagation();
        grid.onBlockTap?.(block, e.currentTarget.getBoundingClientRect());
      }}
      onKeyDown={(e) => {
        if (!grid.editable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          grid.onBlockTap?.(block, e.currentTarget.getBoundingClientRect());
          return;
        }
        grid.onBlockKey?.(block, e);
      }}
    >
      <div className="block-time">
        <span className="tabular">{formatRange(block.start, block.end)}</span>
        {custom && <Icon name="lock" size={12} className="lock-icon" title="Anden slags · egne tider" />}
        {conflict && <Icon name="alert" size={13} className="warn-icon" title="Konflikt" />}
      </div>
      <div className="block-title">{block.title}</div>
      <div className="block-meta">
        <span className="block-groups">{groups}</span>
        <span className="block-chips">
          {ts.map((t, i) => (
            <TeacherChip key={block.teacherIds[i]} teacher={t} small />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Kort uden interaktion (træk-skygge og kladde). */
export function BlockPreview({ block, data, badge, time }: { block: Block; data: GridData; badge?: string; time?: string }) {
  const ts = block.teacherIds.map((id) => data.teachers.find((t) => t.id === id));
  return (
    <div className="block block-lifted" style={blockBackground(ts)}>
      {badge && <span className="lift-badge">{badge}</span>}
      <div className="block-time">
        <span className="tabular">{time ?? formatRange(block.start, block.end)}</span>
        {block.timeMode === 'custom' && <Icon name="lock" size={12} className="lock-icon" />}
      </div>
      <div className="block-title">{block.title}</div>
      <div className="block-meta">
        <span className="block-groups">{groupsLabel(block.groupIds, data.groups)}</span>
        <span className="block-chips">
          {ts.map((t, i) => (
            <TeacherChip key={i} teacher={t} small />
          ))}
        </span>
      </div>
    </div>
  );
}
