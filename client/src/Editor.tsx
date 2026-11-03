// Hovedskærmen: skema, kompakt timeoptælling, "Tilføj ny klasse" og tandhjul. Intet andet.
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { computeAllSummaries } from '../../shared/calc';
import { allConflicts, conflictsForBlock, type Conflict } from '../../shared/conflicts';
import { resolveBlock } from '../../shared/rules';
import { newId } from '../../shared/ids';
import { DAY_NAMES, DEFAULT_TITLE, PERIOD_NAMES, type AppData, type Block, type TimeRule } from '../../shared/schema';
import { sourceWeek, withSourceRules } from '../../shared/source/index';
import { formatClock, formatDuration, formatRange, parseClock } from '../../shared/time';
import { validateBlock } from '../../shared/validate';
import { api, type Session } from './api';
import { ClassForm } from './ClassForm';
import { ConflictDialog } from './Conflicts';
import { DayList, DayTabs } from './DayList';
import { BlockPreview, groupsLabel, parseCellId, ScheduleGrid, type CellRef, type GridData, type Placement, type PlaceMode } from './Grid';
import { HoursColumn } from './HoursColumn';
import { ImportDialog, type ImportState } from './ImportDialog';
import { LoginForm } from './Login';
import * as ops from './ops';
import { Settings, type SectionId } from './Settings';
import { pref, setPref, useEditor, type EditorStore } from './store';
import { Anchored, escapeLayerOpen, Icon, Modal, TeacherChip, Toasts, useEscape, useMediaQuery, useToasts } from './ui';

interface ConflictPrompt {
  label: string;
  next: AppData;
  conflicts: Conflict[];
  flashId: string | null;
  message: string;
  after?: () => void;
}

type Panel =
  | { kind: 'block'; block: Block; rect: DOMRect | null; editing: boolean }
  | { kind: 'add'; rect: DOMRect | null; target: CellRef | null }
  | null;

interface Pending {
  kind: 'choice' | 'none';
  mode: PlaceMode;
  base: Block;
  options: TimeRule[];
  rect: DOMRect | null;
  source: Block;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  ((el.tagName === 'INPUT' && !['radio', 'checkbox', 'button', 'color'].includes((el as HTMLInputElement).type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

const VERB: Record<PlaceMode, string> = { move: 'Flyt klasse', copy: 'Kopiér klasse', create: 'Opret klasse' };

export function Editor({ store, session, onLogout }: { store: EditorStore; session: Session; onLogout: () => void }) {
  const data = useEditor(store, (s) => s.data);
  const status = useEditor(store, (s) => s.status);
  const errorMessage = useEditor(store, (s) => s.errorMessage);
  const nextUndo = useEditor(store, (s) => s.past[s.past.length - 1]?.label);
  const nextRedo = useEditor(store, (s) => s.future[0]?.label);
  const baseVersion = useEditor(store, (s) => s.baseVersion);

  const summaries = useMemo(() => computeAllSummaries(data), [data]);
  const conflicts = useMemo(() => allConflicts(data), [data]);
  const grid = useMemo(() => ({ ...data, assembly: data.settings.assembly }), [data]);

  const { toasts, push, dismiss } = useToasts();
  const [openTeacher, setOpenTeacher] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [prompt, setPrompt] = useState<ConflictPrompt | null>(null);
  const [settings, setSettings] = useState<{ section: SectionId | null; teacherId: string | null } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [drag, setDrag] = useState<{ block: Block; copy: boolean; draft: boolean } | null>(null);
  const [overCell, setOverCell] = useState<CellRef | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [mobileTab, setMobileTab] = useState<'schedule' | 'hours'>('schedule');
  const [mobileDay, setMobileDay] = useState(() => Math.min(5, Math.max(0, (new Date().getDay() + 6) % 7)));
  const [hoursWidth, setHoursWidth] = useState<number>(() => pref('hoursWidth', 264));
  const isMobile = useMediaQuery('(max-width: 760px)');
  const altRef = useRef(false);
  useEffect(() => setPref('hoursWidth', hoursWidth), [hoursWidth]);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400);
  }, []);

  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? '?';
  const where = (b: Block) => `${DAY_NAMES[b.day]} ${PERIOD_NAMES[b.period].toLowerCase()} · ${roomName(b.roomId)} · ${formatRange(b.start, b.end)}`;

  // ---- Fortryd ----------------------------------------------------------------
  const undo = useCallback(() => {
    const label = store.undo();
    if (label) push({ text: `Fortrudt: ${label}`, group: 'history', action: { label: 'Gentag', run: () => store.redo() } }, 4000);
  }, [store, push]);
  const redo = useCallback(() => {
    const label = store.redo();
    if (label) push({ text: `Gentaget: ${label}`, group: 'history' }, 3000);
  }, [store, push]);

  const commit = useCallback(
    (label: string, next: AppData, opts: { flashId?: string | null; message?: string; quiet?: boolean } = {}): string[] | null => {
      const r = store.commit(label, next);
      if (!r.ok) {
        push({ text: `Ikke gennemført: ${r.errors[0].replace(/^(Klasse|Tidsregel) [^:]+: /, '')}`, kind: 'error' }, 6000);
        return r.errors;
      }
      if (opts.flashId) flash(opts.flashId);
      if (!opts.quiet) push({ text: opts.message ?? label, kind: 'success', group: 'history', action: { label: 'Fortryd', run: undo } });
      return null;
    },
    [store, push, flash, undo],
  );

  /** Ændring af én klasse: validér, kontrollér konflikter, og spørg ved konflikt. */
  const proposeBlock = (label: string, next: AppData, changed: Block, message: string, after?: () => void) => {
    const errs = validateBlock(changed, next);
    if (errs.length) {
      push({ text: `Ikke gennemført: ${errs[0]}`, kind: 'error' }, 6000);
      return;
    }
    const cs = conflictsForBlock(changed, next);
    if (cs.length) return setPrompt({ label, next, conflicts: cs, flashId: changed.id, message, after });
    if (!commit(label, next, { flashId: changed.id, message })) after?.();
  };

  // ---- Placering (opret, flyt, kopiér) ------------------------------------------
  const clearPlacing = () => {
    setPlacement(null);
    setPending(null);
  };

  const finalize = (mode: PlaceMode, source: Block, placed: Block) => {
    const timeNote = mode === 'move' && (placed.start !== source.start || placed.end !== source.end) ? ` (før ${formatRange(source.start, source.end)})` : '';
    const msg = mode === 'create' ? `Oprettet: ${where(placed)}` : mode === 'copy' ? `Kopi: ${where(placed)}` : `Flyttet: ${where(placed)}${timeNote}`;
    proposeBlock(VERB[mode], ops.upsertBlock(data, placed), placed, msg, () => {
      clearPlacing();
      setPanel(null);
    });
  };

  const attemptPlace = (mode: PlaceMode, source: Block, target: CellRef, rect: DOMRect | null) => {
    const isSame = source.day === target.day && source.period === target.period && source.roomId === target.roomId;
    if (mode === 'move' && isSame) return clearPlacing();
    const block = mode === 'copy' ? ops.copyOf(source) : source;
    const out = ops.placeBlock(data, block, target);
    if (out.kind === 'ok') return finalize(mode, source, out.block);
    setPending({ kind: out.kind, mode, base: out.base, options: out.kind === 'choice' ? out.options : [], rect, source });
  };

  /** Forventet tid i en målcelle – vises under træk og ved placering. */
  const previewFor = (block: Block, cell: CellRef) => {
    if (block.day === cell.day && block.period === cell.period && block.roomId === cell.roomId && data.blocks.some((b) => b.id === block.id)) return '';
    const out = ops.placeBlock(data, block, cell);
    if (out.kind === 'ok') return `${formatRange(out.block.start, out.block.end)}${block.timeMode === 'custom' ? ' · egne tider' : ''}`;
    if (out.kind === 'choice') return `${out.options.length} tidsrum – vælg`;
    return 'Angiv tid';
  };

  const startPlacement = (mode: 'move' | 'copy', block: Block) => {
    setPanel(null);
    setPlacement({ mode, block });
    setTimeout(() => document.querySelector<HTMLElement>(`[data-cell="cell|${block.day}|${block.period}|${block.roomId}"] .place-target`)?.focus(), 30);
  };
  useEscape(clearPlacing, Boolean(placement) && !pending);

  const onCellTap = (cell: CellRef, rect: DOMRect) => {
    if (placement) return attemptPlace(placement.mode, placement.block, cell, rect);
    setPanel({ kind: 'add', rect, target: cell });
  };

  const newDraft = (target: CellRef | null): Block => ({
    id: newId('b'),
    title: DEFAULT_TITLE,
    groupIds: [],
    teacherIds: [],
    day: target?.day ?? 0,
    period: target?.period ?? 0,
    roomId: target?.roomId ?? data.rooms[0].id,
    start: 0,
    end: 1,
    timeMode: 'rule',
    ruleId: null,
    note: '',
  });

  const deleteBlock = (b: Block) => {
    commit('Slet klasse', ops.deleteBlock(data, b.id), { message: `Slettet: ${b.title} · ${where(b)}` });
    setPanel(null);
  };

  // ---- Træk og slip ---------------------------------------------------------------
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));
  useEffect(() => {
    const set = (v: boolean) => (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      altRef.current = v;
      setDrag((d) => (d && !d.draft ? { ...d, copy: v } : d));
    };
    const down = set(true);
    const up = set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const onDragStart = (e: DragStartEvent) => {
    setPanel(null);
    if (e.active.id === 'draft' && placement?.mode === 'create') return setDrag({ block: placement.block, copy: false, draft: true });
    const block = data.blocks.find((b) => b.id === e.active.id);
    if (block) setDrag({ block, copy: Boolean((e.activatorEvent as MouseEvent)?.altKey) || altRef.current, draft: false });
  };
  const onDragOver = (e: DragOverEvent) => setOverCell(e.over ? parseCellId(String(e.over.id)) : null);
  const onDragEnd = (e: DragEndEvent) => {
    const d = drag;
    setDrag(null);
    setOverCell(null);
    if (!d || !e.over) return;
    const cell = parseCellId(String(e.over.id));
    if (!cell) return;
    const r = e.over.rect;
    attemptPlace(d.draft ? 'create' : d.copy ? 'copy' : 'move', d.block, cell, new DOMRect(r.left, r.top, r.width, r.height));
  };

  // ---- Tastatur -----------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !isTyping(e.target) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod || e.altKey || isTyping(e.target) || escapeLayerOpen()) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setPanel({ kind: 'add', rect: null, target: null });
      } else if (e.key === '?') setShowHelp(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const onBlockKey = (b: Block, e: ReactKeyboardEvent<HTMLElement>) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'm') startPlacement('move', b);
    else if (k === 'k' || k === 'c') startPlacement('copy', b);
    else if (k === 'delete' || k === 'backspace') deleteBlock(b);
    else return;
    e.preventDefault();
  };

  // ---- Lagring, opdatering fra andre sessioner --------------------------------------
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (store.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [store]);
  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      try {
        const v = await api.version();
        const s = store.getState();
        if (v.version > s.baseVersion && !store.dirty && s.status === 'saved') {
          const fresh = await api.data();
          if (!store.dirty) {
            store.replaceFromServer(fresh.data, fresh.version);
            push({ text: 'Skemaet blev opdateret fra en anden session.' }, 6000);
          }
        }
      } catch {
        /* lagringsstatus viser fejl ved gem */
      }
    };
    const t = setInterval(poll, 15000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [store, push]);

  const reloadFromServer = async (message: string) => {
    const fresh = await api.data();
    store.replaceFromServer(fresh.data, fresh.version);
    push({ text: message }, 6000);
  };

  // ---- Indstillinger: tidsregler, kilde, backup ----------------------------------------
  const onRules = (label: string, result: ReturnType<typeof ops.updateRules>): string[] | null => {
    const before = conflicts.pairs.length;
    const after = allConflicts(result.data);
    const n = result.changed.length;
    const msg = `${label}${n ? ` – ${n} ${n === 1 ? 'klasse' : 'klasser'} fik ny tid` : ''}${result.toCustom.length ? ` · ${result.toCustom.length} uden entydig regel beholder tiden som egne tider` : ''}`;
    if (after.pairs.length > before) {
      const ids = new Set(result.changed);
      const fresh = after.pairs.filter((c) => ids.has(c.blockId) || ids.has(c.otherId));
      setPrompt({ label, next: result.data, conflicts: fresh.length ? fresh : after.pairs, flashId: null, message: msg });
      return null;
    }
    return commit(label, result.data, { message: msg });
  };
  const loadSourceWeek = () => {
    const w = sourceWeek(data);
    commit('Indlæs ugeskema fra kilden', w.data, { message: `Ugeskemaet er indlæst: ${w.data.blocks.length} klasser. ${w.unplaced.length} klasser i K-salen kunne ikke placeres.` });
  };
  const reloadSourceRules = () => {
    const s = withSourceRules(data);
    onRules('Genindlæs tidsregler fra kilden', ops.updateRules({ ...data, groups: s.groups }, s.timeRules));
  };
  const onImportFile = async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return push({ text: 'Filen er ikke en gyldig backupfil.', kind: 'error' });
    }
    try {
      setImportState({ fileName: file.name, json, preview: await api.importPreview(json) });
    } catch (e) {
      push({ text: `Kunne ikke kontrollere filen: ${(e as Error).message}`, kind: 'error' });
    }
  };
  const confirmImport = async () => {
    if (!importState) return;
    await store.flush();
    if (store.dirty) return push({ text: 'Der er ændringer, som ikke er gemt endnu. Løs lagringsproblemet før import.', kind: 'error' });
    try {
      await api.importReplace(store.getState().baseVersion, importState.json);
      setImportState(null);
      setSettings(null);
      await reloadFromServer('Backup importeret. Alle data er erstattet.');
    } catch (e) {
      push({ text: `Import mislykkedes: ${(e as Error).message}`, kind: 'error' });
    }
  };
  const restoreRevision = async (version: number) => {
    try {
      const rev = await api.revision(version);
      commit(`Gendan version ${version}`, rev.data, { message: `Version ${version} er gendannet` });
    } catch (e) {
      push({ text: `Kunne ikke gendanne: ${(e as Error).message}`, kind: 'error' });
    }
  };
  const loadDemo = async () => {
    await store.flush();
    try {
      await api.loadDemo(store.getState().baseVersion);
      setSettings(null);
      await reloadFromServer('Eksempeldata indlæst.');
    } catch (e) {
      push({ text: (e as Error).message, kind: 'error' });
    }
  };
  const showBlock = (b: Block) => {
    setSettings(null);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${b.id}"]`);
      el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      el?.focus();
      flash(b.id);
    }, 60);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = hoursWidth;
    const move = (ev: PointerEvent) => setHoursWidth(Math.round(Math.max(220, Math.min(420, w0 - (ev.clientX - x0)))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hours = (
    <HoursColumn
      data={data}
      summaries={summaries}
      openId={openTeacher}
      onOpen={setOpenTeacher}
      conflictCount={conflicts.pairs.length}
      onShowConflicts={() => setSettings({ section: 'tools', teacherId: null })}
      onDetails={(id) => setSettings({ section: 'work', teacherId: id })}
    />
  );
  const draft = placement?.mode === 'create' ? placement.block : null;
  const panelBlock = panel?.kind === 'block' ? data.blocks.find((b) => b.id === panel.block.id) ?? null : null;

  return (
    <div className={`app${session.demo ? ' is-demo' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">Balletskolen</span>
          <h1 className="brand-title">Ugeskema</h1>
          {session.demo && <span className="tag">{session.standalone ? 'Prøveversion' : 'Demo'}</span>}
        </div>
        <div className="topbar-right">
          <SaveState status={status} onRetry={() => void store.flush()} />
          <button className="btn btn-primary" onClick={() => setPanel({ kind: 'add', rect: null, target: null })}>
            <Icon name="plus" size={18} /> Tilføj ny klasse
          </button>
          <button className="icon-btn icon-btn-lg gear" onClick={() => setSettings({ section: null, teacherId: null })} aria-label="Indstillinger og øvrige funktioner">
            <Icon name="gear" size={22} />
          </button>
        </div>
      </header>

      {(status === 'conflict' || status === 'error') && (
        <div className="banner banner-error" role="alert">
          <span>
            <strong>{status === 'conflict' ? 'Ikke gemt.' : 'Kunne ikke gemme.'}</strong> {errorMessage}
          </span>
          <div className="banner-actions">
            {status === 'conflict' ? (
              <>
                <button className="btn btn-sm" onClick={() => void reloadFromServer('Nyeste version hentet. Dine ikke-gemte ændringer er kasseret.')}>
                  Hent nyeste
                </button>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const v = await api.version();
                    await store.overwriteServer(v.version);
                  }}
                >
                  Gem mine alligevel
                </button>
              </>
            ) : (
              <button className="btn btn-sm" onClick={() => void store.flush()}>
                Prøv igen
              </button>
            )}
            {errorMessage?.includes('logget ind') && (
              <button className="btn btn-sm btn-primary" onClick={() => setNeedLogin(true)}>
                Log ind igen
              </button>
            )}
          </div>
        </div>
      )}
      {session.standalone && <div className="banner banner-note">Prøveversion: ændringer gemmes kun i denne browser.</div>}

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDrag(null), setOverCell(null))} autoScroll={{ acceleration: 3, threshold: { x: 0.08, y: 0.1 } }}>
        {isMobile ? (
          <div className="mobile-body">
            {mobileTab === 'schedule' ? (
              <>
                <DayTabs day={mobileDay} onDay={setMobileDay} />
                <DayList data={grid} day={mobileDay} conflictIds={conflicts.blockIds} onOpen={(b, rect) => setPanel({ kind: 'block', block: b, rect, editing: false })} onPlace={placement ? (cell) => onCellTap(cell, new DOMRect()) : undefined} />
              </>
            ) : (
              <aside className="hours-pane hours-mobile">{hours}</aside>
            )}
            <nav className="mobile-nav">
              <button className={mobileTab === 'schedule' ? 'on' : ''} onClick={() => setMobileTab('schedule')}>
                Skema
              </button>
              <button className={mobileTab === 'hours' ? 'on' : ''} onClick={() => setMobileTab('hours')}>
                Timer
              </button>
            </nav>
          </div>
        ) : (
          <div className="workspace" style={{ ['--hours-w' as string]: `${hoursWidth}px` }}>
            <div className="board-scroll">
              <ScheduleGrid
                data={grid}
                editable
                conflictIds={conflicts.blockIds}
                placement={placement}
                previewFor={previewFor}
                dragging={drag?.block ?? null}
                flashId={flashId}
                selectedId={panel?.kind === 'block' ? panel.block.id : null}
                onCellTap={onCellTap}
                onBlockTap={(b, rect) => setPanel({ kind: 'block', block: b, rect, editing: false })}
                onBlockKey={onBlockKey}
                onAssemblyTap={() => setSettings({ section: 'rules', teacherId: null })}
              />
            </div>
            <div className="resizer" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Justér timekolonnens bredde" />
            <aside className="hours-pane" aria-label="Timeoptælling">
              {hours}
            </aside>
          </div>
        )}

        {placement && !pending && (
          <div className={`place-bar place-bar-${placement.mode}`} role="status">
            {draft && <DraftCard block={draft} data={grid} />}
            <span className="place-text">
              {placement.mode === 'create'
                ? 'Træk klassen til en celle, eller tryk på cellen.'
                : `${placement.mode === 'copy' ? 'Kopiér' : 'Flyt'} ${placement.block.title} · ${groupsLabel(placement.block.groupIds, data.groups)} – tryk på en celle.`}
            </span>
            <button className="btn btn-quiet" onClick={clearPlacing}>
              Annuller
            </button>
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {drag && (
            <BlockPreview
              block={drag.block}
              data={grid}
              badge={drag.copy ? 'Kopi' : undefined}
              time={(overCell && previewFor(drag.block, overCell)) || (drag.draft ? 'Ny klasse' : undefined)}
            />
          )}
        </DragOverlay>
      </DndContext>

      {panel?.kind === 'block' && panelBlock && (
        <Anchored anchor={panel.rect} onClose={() => setPanel(null)} label={panel.editing ? 'Redigér klasse' : 'Klasse'} width={400}>
          {panel.editing ? (
            <div className="panel">
              <h2 className="panel-title">Redigér klasse</h2>
              <ClassForm
                data={data}
                initial={panelBlock}
                placed
                submitLabel="Gem"
                onCancel={() => setPanel({ ...panel, editing: false })}
                onSubmit={(b) => {
                  if (JSON.stringify(b) === JSON.stringify(panelBlock)) return setPanel(null);
                  proposeBlock('Redigér klasse', ops.upsertBlock(data, b), b, `Gemt: ${b.title} · ${where(b)}`, () => setPanel(null));
                }}
              />
            </div>
          ) : (
            <BlockInfo
              block={panelBlock}
              data={data}
              onEdit={() => setPanel({ ...panel, editing: true })}
              onMove={() => startPlacement('move', panelBlock)}
              onCopy={() => startPlacement('copy', panelBlock)}
              onDelete={() => deleteBlock(panelBlock)}
            />
          )}
        </Anchored>
      )}

      {panel?.kind === 'add' && (
        <Anchored anchor={panel.rect} onClose={() => setPanel(null)} label="Tilføj ny klasse" width={420}>
          <div className="panel">
            <h2 className="panel-title">Tilføj ny klasse</h2>
            {panel.target && (
              <p className="hint">
                {DAY_NAMES[panel.target.day]} {PERIOD_NAMES[panel.target.period].toLowerCase()} · {roomName(panel.target.roomId)}
              </p>
            )}
            <ClassForm
              data={data}
              initial={newDraft(panel.target)}
              placed={false}
              submitLabel={panel.target ? 'Opret' : 'Opret og placér'}
              onCancel={() => setPanel(null)}
              onSubmit={(b) => {
                const target = panel.target;
                setPanel(null);
                if (target) attemptPlace('create', b, target, panel.rect);
                else setPlacement({ mode: 'create', block: b });
              }}
            />
          </div>
        </Anchored>
      )}

      {pending && (
        <Anchored anchor={pending.rect} onClose={() => setPending(null)} label={pending.kind === 'choice' ? 'Vælg tidsrum' : 'Ingen tid for dagdelen'} width={360}>
          <PendingPanel
            pending={pending}
            data={data}
            onPick={(rule) => finalize(pending.mode, pending.source, ops.withRule(pending.base, rule))}
            onCustom={(start, end) => finalize(pending.mode, pending.source, { ...pending.base, timeMode: 'custom', ruleId: null, start, end })}
            onCancel={() => setPending(null)}
          />
        </Anchored>
      )}

      {prompt && (
        <ConflictDialog
          conflicts={prompt.conflicts}
          data={prompt.next}
          actionLabel={prompt.label}
          onCancel={() => setPrompt(null)}
          onKeep={() => {
            const p = prompt;
            setPrompt(null);
            if (!commit(p.label, p.next, { flashId: p.flashId, message: `${p.message} – med konflikt` })) p.after?.();
          }}
        />
      )}

      {settings && (
        <Settings
          data={data}
          section={settings.section}
          onSection={(section) => setSettings({ section, teacherId: null })}
          detailTeacherId={settings.teacherId}
          onClose={() => setSettings(null)}
          onCommit={(label, next) => commit(label, next, { quiet: true })}
          onRules={onRules}
          onLoadSourceWeek={loadSourceWeek}
          onReloadSourceRules={reloadSourceRules}
          undo={{ onUndo: undo, onRedo: redo, undoLabel: nextUndo, redoLabel: nextRedo }}
          onShowBlock={showBlock}
          onImportFile={(f) => void onImportFile(f)}
          onLoadDemo={() => void loadDemo()}
          onRestoreRevision={(v) => void restoreRevision(v)}
          onLogout={onLogout}
          onShowHelp={() => setShowHelp(true)}
          currentVersion={baseVersion}
          demoMode={session.demo}
        />
      )}

      {importState && <ImportDialog state={importState} onCancel={() => setImportState(null)} onConfirm={() => void confirmImport()} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {needLogin && (
        <Modal title="Log ind igen" onClose={() => setNeedLogin(false)}>
          <LoginForm
            onSuccess={() => {
              setNeedLogin(false);
              void store.flush();
            }}
          />
        </Modal>
      )}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function SaveState({ status, onRetry }: { status: string; onRetry: () => void }) {
  if (status === 'saved') return <span className="save save-ok">Gemt</span>;
  if (status === 'pending' || status === 'saving') return <span className="save">Gemmer…</span>;
  return (
    <button className="save save-err" onClick={onRetry}>
      <Icon name="cloudOff" size={16} /> {status === 'conflict' ? 'Ikke gemt' : 'Kunne ikke gemme'}
    </button>
  );
}

function DraftCard({ block, data }: { block: Block; data: GridData }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'draft' });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`draft${isDragging ? ' draft-dragging' : ''}`} aria-label={`Ny klasse ${block.title}, træk til en celle`}>
      <BlockPreview block={block} data={data} time={block.timeMode === 'custom' ? undefined : 'Ny klasse'} />
    </div>
  );
}

function BlockInfo({ block, data, onEdit, onMove, onCopy, onDelete }: { block: Block; data: AppData; onEdit: () => void; onMove: () => void; onCopy: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teachers = block.teacherIds.map((id) => data.teachers.find((t) => t.id === id));
  const rule = block.ruleId ? data.timeRules.find((r) => r.id === block.ruleId) : null;
  const res = block.timeMode === 'rule' ? resolveBlock(data, block) : null;
  return (
    <div className="panel">
      <h2 className="panel-title">{block.title}</h2>
      <dl className="info">
        <div>
          <dt>Tid</dt>
          <dd>
            <strong className="tabular">{formatRange(block.start, block.end)}</strong> · {formatDuration(block.end - block.start)}
          </dd>
        </div>
        <div>
          <dt>Placering</dt>
          <dd>
            {DAY_NAMES[block.day]} {PERIOD_NAMES[block.period].toLowerCase()} · {data.rooms.find((r) => r.id === block.roomId)?.name}
          </dd>
        </div>
        <div>
          <dt>Hold</dt>
          <dd>{groupsLabel(block.groupIds, data.groups)}</dd>
        </div>
        <div>
          <dt>Lærer{teachers.length > 1 ? 'e' : ''}</dt>
          <dd className="chips">
            {teachers.map((t, i) => (
              <span key={i} className="chip-with-name">
                <TeacherChip teacher={t} />
                {t?.name}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Tidsmodel</dt>
          <dd>
            {block.timeMode === 'custom' ? (
              <>
                <Icon name="lock" size={14} /> Anden slags · egne tider, som følger klassen ved flytning
              </>
            ) : rule ? (
              `Automatisk: holdets tid i skemaet${rule.label ? ` (${rule.label})` : ''} · ${rule.source || 'manuel'}`
            ) : res?.kind === 'single' ? (
              `Automatisk: ${res.label.charAt(0).toLowerCase()}${res.label.slice(1)}`
            ) : (
              'Automatisk'
            )}
          </dd>
        </div>
        {block.note && (
          <div>
            <dt>Note</dt>
            <dd>{block.note}</dd>
          </div>
        )}
      </dl>
      {confirmDelete ? (
        <div className="confirm">
          <p>Slet klassen? Det kan fortrydes.</p>
          <div className="form-actions">
            <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
              Annuller
            </button>
            <button className="btn btn-danger" onClick={onDelete} data-autofocus>
              Slet
            </button>
          </div>
        </div>
      ) : (
        <div className="action-row">
          <button className="btn" onClick={onEdit} data-autofocus>
            <Icon name="edit" size={16} /> Redigér
          </button>
          <button className="btn" onClick={onMove}>
            <Icon name="move" size={16} /> Flyt
          </button>
          <button className="btn" onClick={onCopy}>
            <Icon name="copy" size={16} /> Kopiér
          </button>
          <button className="btn btn-quiet btn-danger-text" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Slet
          </button>
        </div>
      )}
    </div>
  );
}

function PendingPanel({ pending, data, onPick, onCustom, onCancel }: { pending: Pending; data: AppData; onPick: (r: TimeRule) => void; onCustom: (s: number, e: number) => void; onCancel: () => void }) {
  const [custom, setCustom] = useState(false);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const s = parseClock(startText);
  const e = parseClock(endText);
  const b = pending.base;
  const where = `${groupsLabel(b.groupIds, data.groups)} ${DAY_NAMES[b.day].toLowerCase()} ${PERIOD_NAMES[b.period].toLowerCase()}`;
  return (
    <div className="panel">
      {pending.kind === 'choice' ? (
        <>
          <h2 className="panel-title">Vælg tidsrum</h2>
          <p className="hint">Tidstabellen har flere tidsrum for {where}.</p>
          <div className="choice-list">
            {pending.options.map((o) => (
              <button key={o.id} className="choice choice-btn" onClick={() => onPick(o)}>
                <strong className="tabular">{formatRange(o.start, o.end)}</strong>
                {o.label && <span>{o.label}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="panel-title">Ingen tid for dagdelen</h2>
          <p>Der er hverken en tid for {where} eller en standardtid for dagdelen. Angiv tiden selv, eller sæt en standardtid under tandhjulet.</p>
          {custom ? (
            <>
              <div className="field-row">
                <label className="field field-time">
                  <span>Start</span>
                  <input autoFocus inputMode="numeric" value={startText} placeholder={pending.source.timeMode === 'custom' ? formatClock(pending.source.start) : '9.10'} onChange={(ev) => setStartText(ev.target.value)} />
                </label>
                <label className="field field-time">
                  <span>Slut</span>
                  <input inputMode="numeric" value={endText} placeholder="9.55" onChange={(ev) => setEndText(ev.target.value)} />
                </label>
              </div>
              {s !== null && e !== null && e <= s && <p className="error-text">Sluttid skal ligge efter starttid.</p>}
            </>
          ) : (
            <p className="hint">Du kan give klassen egne tider eller vælge en anden celle.</p>
          )}
        </>
      )}
      <div className="form-actions">
        <button className="btn btn-quiet" onClick={onCancel}>
          Annuller
        </button>
        {pending.kind === 'none' &&
          (custom ? (
            <button className="btn btn-primary" disabled={s === null || e === null || e <= s} onClick={() => onCustom(s!, e!)}>
              Placér med egne tider
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setCustom(true)}>
              Brug egne tider
            </button>
          ))}
      </div>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['N', 'Tilføj ny klasse'],
    ['Ctrl/⌘ + Z', 'Fortryd'],
    ['Ctrl/⌘ + Shift + Z · Ctrl + Y', 'Gentag'],
    ['Tab', 'Gå mellem klasser'],
    ['Enter', 'Åbn den valgte klasse'],
    ['M / K', 'Flyt / kopiér den valgte klasse'],
    ['Delete', 'Slet den valgte klasse'],
    ['Piletaster + Enter', 'Vælg celle ved placering'],
    ['Alt under træk', 'Kopiér i stedet for at flytte'],
    ['Esc', 'Annuller eller luk'],
  ];
  return (
    <Modal title="Tastaturgenveje" onClose={onClose}>
      <table className="table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">På en iPad: hold fingeren på en klasse et øjeblik, og træk den derefter.</p>
    </Modal>
  );
}
