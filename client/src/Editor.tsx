// Administratorens arbejdsflade: skema + timepanel, og al interaktion omkring blokke.
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { computeAllSummaries } from '../../shared/calc';
import { allConflicts, conflictsForBlock, type Conflict } from '../../shared/conflicts';
import { newId } from '../../shared/ids';
import { DAY_NAMES, type AppData, type Block } from '../../shared/schema';
import { daypartOf, daypartRange, findFreeStart, formatRange, suggestStart, DAYPARTS, type DaypartIndex } from '../../shared/time';
import { validateBlock } from '../../shared/validate';
import { api, type Session } from './api';
import { BlockEditor } from './BlockEditor';
import { ConflictDialog, ConflictOverview } from './Conflicts';
import { DayList, DayTabs } from './DayList';
import { BlockPreview, emptyFilter, filterActive, parseCellId, ScheduleGrid, type CellRef, type DragState, type Filter, type Placement } from './Grid';
import { HoursPanel, type Unit } from './HoursPanel';
import { ImportDialog, type ImportState } from './ImportDialog';
import { LoginForm } from './Login';
import * as ops from './ops';
import { Settings } from './Settings';
import { useEditor, pref, setPref, type EditorStore } from './store';
import { TimePicker, type TimePickerRequest } from './TimePicker';
import { Anchored, escapeLayerOpen, Icon, Modal, Toasts, useEscape, useMediaQuery, useToasts } from './ui';
import { FilterBar } from './FilterBar';

interface ConflictPrompt {
  label: string;
  next: AppData;
  conflicts: Conflict[];
  flashId: string;
  message: string;
  after?: () => void;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  ((el.tagName === 'INPUT' && !['radio', 'checkbox', 'button', 'color'].includes((el as HTMLInputElement).type)) ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable);

export function Editor({ store, session, onLogout }: { store: EditorStore; session: Session; onLogout: () => void }) {
  const data = useEditor(store, (s) => s.data);
  const status = useEditor(store, (s) => s.status);
  const errorMessage = useEditor(store, (s) => s.errorMessage);
  const pastLen = useEditor(store, (s) => s.past.length);
  const futureLen = useEditor(store, (s) => s.future.length);
  const nextUndo = useEditor(store, (s) => s.past[s.past.length - 1]?.label);
  const nextRedo = useEditor(store, (s) => s.future[0]?.label);
  const lastSavedAt = useEditor(store, (s) => s.lastSavedAt);

  const summaries = useMemo(() => computeAllSummaries(data), [data]);
  const conflicts = useMemo(() => allConflicts(data.blocks), [data.blocks]);
  const starts = data.settings.daypartStarts;

  const { toasts, push, dismiss } = useToasts();
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(() => pref('selectedTeacher', null));
  const [unit, setUnit] = useState<Unit>(() => pref('unit', 'hm'));
  const [panelPos, setPanelPos] = useState<'right' | 'bottom'>(() => pref('panelPos', window.innerWidth >= 1360 ? 'right' : 'bottom'));
  const [panelSize, setPanelSize] = useState<number>(() => pref('panelSize', window.innerWidth >= 1360 ? 360 : 330));
  const [panelOpen, setPanelOpen] = useState<boolean>(() => pref('panelOpen', true));
  const [editor, setEditor] = useState<{ block: Block; isNew: boolean; anchor: DOMRect | null } | null>(null);
  const [menu, setMenu] = useState<{ block: Block; rect: DOMRect } | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [timeReq, setTimeReq] = useState<TimePickerRequest | null>(null);
  const [prompt, setPrompt] = useState<ConflictPrompt | null>(null);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [mobileTab, setMobileTab] = useState<'schedule' | 'hours'>('schedule');
  const [mobileDay, setMobileDay] = useState(() => Math.min(5, Math.max(0, (new Date().getDay() + 6) % 7)));
  const isMobile = useMediaQuery('(max-width: 760px)');
  const altRef = useRef(false);

  useEffect(() => setPref('selectedTeacher', selectedTeacher), [selectedTeacher]);
  useEffect(() => setPref('unit', unit), [unit]);
  useEffect(() => setPref('panelPos', panelPos), [panelPos]);
  useEffect(() => setPref('panelSize', panelSize), [panelSize]);
  useEffect(() => setPref('panelOpen', panelOpen), [panelOpen]);
  useEffect(() => {
    if (selectedTeacher && !data.teachers.some((t) => t.id === selectedTeacher)) setSelectedTeacher(null);
  }, [data.teachers, selectedTeacher]);
  useEffect(() => {
    if (!selectedTeacher && data.teachers.length) setSelectedTeacher([...data.teachers].sort((a, b) => a.initials.localeCompare(b.initials, 'da'))[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.teachers.length]);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1400);
  }, []);

  const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? '?';
  const where = (b: Pick<Block, 'day' | 'roomId' | 'start' | 'end'>) => `${DAY_NAMES[b.day]} · ${roomName(b.roomId)} · ${formatRange(b.start, b.end)}`;

  // ---- Fortryd ---------------------------------------------------------------
  const undo = useCallback(() => {
    const label = store.undo();
    if (label) push({ text: `Fortrudt: ${label}`, action: { label: 'Annuller fortryd', run: () => store.redo() } }, 4000);
  }, [store, push]);
  const redo = useCallback(() => {
    const label = store.redo();
    if (label) push({ text: `Gentaget: ${label}` }, 3000);
  }, [store, push]);

  /** Gennemfør en handling (ét historiktrin). Returnerer fejl, hvis valideringen afviser den. */
  const commit = useCallback(
    (label: string, next: AppData, opts: { flashId?: string; message?: string; quiet?: boolean } = {}): string[] | null => {
      const r = store.commit(label, next);
      if (!r.ok) {
        push({ text: `Ikke gennemført: ${r.errors[0]}`, kind: 'error' }, 6000);
        return r.errors;
      }
      if (opts.flashId) flash(opts.flashId);
      if (!opts.quiet) push({ text: opts.message ?? label, kind: 'success', action: { label: 'Fortryd', run: undo } });
      return null;
    },
    [store, push, flash, undo],
  );

  /** Ændring af én blok: validér, kontrollér konflikter, og spørg ved konflikt. */
  const proposeBlock = (label: string, next: AppData, changed: Block, message: string, after?: () => void) => {
    const errs = validateBlock(changed, next);
    if (errs.length) {
      push({ text: `Ikke gennemført: ${errs[0]}`, kind: 'error' }, 6000);
      return;
    }
    const cs = conflictsForBlock(changed, next.blocks);
    if (cs.length) {
      setPrompt({ label, next, conflicts: cs, flashId: changed.id, message, after });
      return;
    }
    if (!commit(label, next, { flashId: changed.id, message })) after?.();
  };

  // ---- Opret / rediger ---------------------------------------------------------
  const newBlockAt = (cell: CellRef, anchor: DOMRect | null) => {
    const ends = data.blocks.filter((b) => b.day === cell.day && b.roomId === cell.roomId && daypartOf(b.start, starts) === cell.daypart).map((b) => b.end);
    const start = findFreeStart({
      preferred: suggestStart(cell.daypart, starts, 60, ends),
      duration: 60,
      busy: data.blocks.filter((b) => b.day === cell.day && b.roomId === cell.roomId),
      range: daypartRange(cell.daypart, starts),
      stayInRange: true,
    });
    const only = <T extends { id: string; archived: boolean }>(list: T[]) => {
      const active = list.filter((x) => !x.archived);
      return active.length === 1 ? active[0].id : '';
    };
    const block: Block = {
      id: newId('b'),
      day: cell.day,
      roomId: cell.roomId,
      start,
      end: Math.min(1440, start + 60),
      subjectId: only(data.subjects),
      groupId: only(data.groups),
      teacherIds: only(data.teachers) ? [only(data.teachers)] : [],
      note: '',
    };
    setEditor({ block, isNew: true, anchor });
  };

  const onCellClick = (cell: CellRef, rect: DOMRect) => {
    if (placement) {
      const block = data.blocks.find((b) => b.id === placement.blockId);
      if (block) placeAt(placement.mode, block, cell, rect);
      return;
    }
    newBlockAt(cell, rect);
  };

  const saveFromEditor = (block: Block) => {
    const isNew = editor?.isNew;
    const before = data.blocks.find((b) => b.id === block.id);
    if (!isNew && before && JSON.stringify(before) === JSON.stringify(block)) {
      setEditor(null); // ingen ændring → intet historiktrin
      return;
    }
    proposeBlock(isNew ? 'Opret blok' : 'Rediger blok', ops.upsertBlock(data, block), block, isNew ? `Oprettet: ${where(block)}` : `Gemt: ${where(block)}`, () =>
      setEditor(null),
    );
  };

  const deleteBlock = (block: Block) => {
    commit('Slet blok', ops.deleteBlock(data, block.id), { message: `Slettet: ${where(block)}` });
    setEditor(null);
    setMenu(null);
  };

  // ---- Flyt / kopiér --------------------------------------------------------------
  const startPlacement = (mode: 'move' | 'copy', block: Block) => {
    setEditor(null);
    setMenu(null);
    setPlacement({ mode, blockId: block.id });
    setTimeout(() => {
      const el =
        document.querySelector<HTMLElement>(`[data-cell="cell|${block.day}|${daypartOf(block.start, starts)}|${block.roomId}"] .place-target`) ??
        document.querySelector<HTMLElement>('.place-target');
      el?.focus();
    }, 30);
  };
  useEscape(() => setPlacement(null), Boolean(placement));

  const finishPlace = (mode: 'move' | 'copy', block: Block, day: number, roomId: string, start: number) => {
    const dur = block.end - block.start;
    const timeNote = start !== block.start ? ` (før ${formatRange(block.start, block.end)})` : '';
    if (mode === 'move') {
      const changed: Block = { ...block, day, roomId, start, end: start + dur };
      proposeBlock('Flyt blok', ops.upsertBlock(data, changed), changed, `Flyttet til ${where(changed)}${timeNote}`, () => setTimeReq(null));
    } else {
      const copy = ops.copyOf(block, { day, roomId, start, end: start + dur });
      proposeBlock('Kopiér blok', ops.upsertBlock(data, copy), copy, `Kopi oprettet: ${where(copy)}`, () => setTimeReq(null));
    }
  };

  const placeAt = (mode: 'move' | 'copy', block: Block, cell: CellRef, rect: DOMRect | null) => {
    setPlacement(null);
    const srcDp = daypartOf(block.start, starts);
    const sameCell = block.day === cell.day && block.roomId === cell.roomId && srcDp === cell.daypart;
    if (mode === 'move' && sameCell) return;
    if (srcDp === cell.daypart && !sameCell) {
      finishPlace(mode, block, cell.day, cell.roomId, block.start);
      return;
    }
    const dur = block.end - block.start;
    const others = data.blocks.filter((b) => b.day === cell.day && !(mode === 'move' && b.id === block.id));
    const ends = others.filter((b) => b.roomId === cell.roomId && daypartOf(b.start, starts) === cell.daypart).map((b) => b.end);
    // Optaget: samme sal, samme hold eller en af blokkens lærere – så forslaget er konfliktfrit, hvis muligt.
    const busy = others.filter((b) => b.roomId === cell.roomId || b.groupId === block.groupId || b.teacherIds.some((t) => block.teacherIds.includes(t)));
    const suggested = sameCell
      ? findFreeStart({ preferred: block.end, duration: dur, busy, range: daypartRange(cell.daypart, starts) })
      : findFreeStart({ preferred: suggestStart(cell.daypart, starts, dur, ends), duration: dur, busy, range: daypartRange(cell.daypart, starts), stayInRange: true });
    setTimeReq({
      mode,
      block,
      day: cell.day,
      roomId: cell.roomId,
      roomName: roomName(cell.roomId),
      daypart: cell.daypart,
      suggested,
      anchor: rect,
    });
  };

  // ---- Træk og slip -----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altRef.current = true;
        setDrag((d) => (d ? { ...d, copy: true } : d));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altRef.current = false;
        setDrag((d) => (d ? { ...d, copy: false } : d));
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const block = data.blocks.find((b) => b.id === e.active.id);
    const ev = e.activatorEvent as MouseEvent;
    if (block) setDrag({ block, copy: Boolean(ev?.altKey) || altRef.current });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const d = drag;
    setDrag(null);
    if (!d || !e.over) return;
    const cell = parseCellId(String(e.over.id));
    if (!cell) return;
    const r = e.over.rect;
    placeAt(d.copy ? 'copy' : 'move', d.block, cell, new DOMRect(r.left, r.top, r.width, r.height));
  };

  // ---- Tastaturgenveje ----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !isTyping(e.target)) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey || isTyping(e.target) || escapeLayerOpen()) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        newBlockAt({ day: isMobile ? mobileDay : 0, daypart: 0, roomId: data.rooms[0].id }, null);
      } else if (e.key === '?') {
        setShowHelp(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onBlockKey = (block: Block, e: ReactKeyboardEvent<HTMLElement>) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'm') startPlacement('move', block);
    else if (k === 'k' || k === 'c') startPlacement('copy', block);
    else if (k === 'delete' || k === 'backspace') deleteBlock(block);
    else if (k === 'e') setEditor({ block, isNew: false, anchor: e.currentTarget.getBoundingClientRect() });
    else return;
    e.preventDefault();
  };

  // ---- Lagring: advarsel ved lukning og opdatering fra andre sessioner ---------------
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
            push({ text: 'Skemaet blev opdateret fra en anden session. Fortryd-historikken er nulstillet.' }, 6000);
          }
        }
      } catch {
        /* polling-fejl vises ikke; lagringsstatus viser fejl ved gem */
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

  const downloadLocal = () => {
    const blob = new Blob([JSON.stringify({ format: 'ballet-ugeskema-backup', formatVersion: 1, exportedAt: new Date().toISOString(), data: store.getState().data }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ugeskema-ikke-gemt-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- Import og demodata -------------------------------------------------------------
  const onImportFile = async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      push({ text: 'Filen er ikke gyldig JSON.', kind: 'error' });
      return;
    }
    try {
      const preview = await api.importPreview(json);
      setImportState({ fileName: file.name, json, preview });
    } catch (e) {
      push({ text: `Kunne ikke kontrollere filen: ${(e as Error).message}`, kind: 'error' });
    }
  };
  const confirmImport = async () => {
    if (!importState) return;
    await store.flush();
    if (store.dirty) {
      push({ text: 'Der er ændringer, som ikke er gemt endnu. Løs lagringsproblemet før import.', kind: 'error' });
      return;
    }
    try {
      await api.importReplace(store.getState().baseVersion, importState.json);
      setImportState(null);
      setSettingsTab(null);
      await reloadFromServer('Backup importeret. Alle data er erstattet, og fortryd-historikken er nulstillet.');
    } catch (e) {
      push({ text: `Import mislykkedes: ${(e as Error).message}`, kind: 'error' });
    }
  };
  const loadDemo = async () => {
    await store.flush();
    try {
      await api.loadDemo(store.getState().baseVersion);
      setSettingsTab(null);
      await reloadFromServer('Eksempeldata indlæst.');
    } catch (e) {
      push({ text: (e as Error).message, kind: 'error' });
    }
  };

  // ---- Panel-størrelse ---------------------------------------------------------------
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = panelPos === 'right' ? e.clientX : e.clientY;
    const startSize = panelSize;
    const move = (ev: PointerEvent) => {
      const delta = (panelPos === 'right' ? ev.clientX : ev.clientY) - startPos;
      const max = panelPos === 'right' ? window.innerWidth * 0.6 : window.innerHeight * 0.7;
      setPanelSize(Math.round(Math.max(260, Math.min(max, startSize - delta))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const placingBlock = placement ? data.blocks.find((b) => b.id === placement.blockId) : null;
  const subjectName = (b: Block) => data.subjects.find((s) => s.id === b.subjectId)?.name ?? '';
  const groupName = (b: Block) => data.groups.find((g) => g.id === b.groupId)?.name ?? '';

  const panel = (
    <HoursPanel
      data={data}
      summaries={summaries}
      selectedId={selectedTeacher}
      onSelect={setSelectedTeacher}
      conflictCount={conflicts.pairs.length}
      unit={unit}
      onUnit={setUnit}
      onOpenSettings={(tab) => setSettingsTab(tab ?? 'teachers')}
      onShowConflicts={() => setShowConflicts(true)}
      filteredTeacherId={filter.teacherId}
      onFilterTeacher={(id) => setFilter((f) => ({ ...f, teacherId: f.teacherId === id ? null : id }))}
    />
  );

  return (
    <div className={`app app-admin${session.demo ? ' is-demo' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span className="brand-name">Ugeskema</span>
          {session.demo && <span className="demo-badge">DEMOTILSTAND</span>}
        </div>
        <div className="tb-group">
          <button className="btn btn-primary" onClick={() => newBlockAt({ day: isMobile ? mobileDay : 0, daypart: 0, roomId: data.rooms[0].id }, null)} title="Ny blok (N)">
            <Icon name="plus" size={15} /> <span className="hide-sm">Ny blok</span>
          </button>
          <button className="btn btn-icon" onClick={undo} disabled={!pastLen} title={nextUndo ? `Fortryd: ${nextUndo} (Ctrl/⌘+Z)` : 'Fortryd'} aria-label="Fortryd">
            <Icon name="undo" />
          </button>
          <button className="btn btn-icon" onClick={redo} disabled={!futureLen} title={nextRedo ? `Annuller fortryd: ${nextRedo} (Ctrl/⌘+Shift+Z)` : 'Annuller fortryd'} aria-label="Annuller fortryd">
            <Icon name="redo" />
          </button>
        </div>
        <FilterBar data={data} filter={filter} onFilter={setFilter} />
        <div className="tb-spacer" />
        {conflicts.pairs.length > 0 && (
          <button className="btn btn-conflict" onClick={() => setShowConflicts(true)}>
            <Icon name="alert" size={15} /> {conflicts.pairs.length} <span className="hide-sm">{conflicts.pairs.length === 1 ? 'konflikt' : 'konflikter'}</span>
          </button>
        )}
        <SaveIndicator status={status} lastSavedAt={lastSavedAt} onRetry={() => void store.flush()} />
        <div className="tb-group">
          {!isMobile && (
            <>
              <button className="btn btn-icon" onClick={() => setPanelOpen(!panelOpen)} aria-pressed={panelOpen} title={panelOpen ? 'Skjul timeoverblik' : 'Vis timeoverblik'} aria-label="Vis/skjul timeoverblik">
                <Icon name={panelPos === 'right' ? 'panelRight' : 'panelBottom'} />
              </button>
              {panelOpen && (
                <button className="btn btn-icon" onClick={() => setPanelPos(panelPos === 'right' ? 'bottom' : 'right')} title={panelPos === 'right' ? 'Placér overblik nederst' : 'Placér overblik til højre'} aria-label="Skift placering af timeoverblik">
                  <Icon name={panelPos === 'right' ? 'panelBottom' : 'panelRight'} />
                </button>
              )}
            </>
          )}
          <button className="btn btn-icon hide-sm" onClick={() => setShowHelp(true)} title="Tastaturgenveje (?)" aria-label="Tastaturgenveje">
            <Icon name="keyboard" />
          </button>
          <button className="btn btn-icon" onClick={() => setSettingsTab('teachers')} title="Indstillinger" aria-label="Indstillinger">
            <Icon name="gear" />
          </button>
          <a className="btn btn-icon hide-sm" href="/" target="_blank" rel="noreferrer" title="Åbn læsevisning" aria-label="Åbn læsevisning">
            <Icon name="eye" />
          </a>
          <button className="btn btn-icon" onClick={onLogout} title="Log ud" aria-label="Log ud">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      {status === 'conflict' && (
        <div className="banner banner-error" role="alert">
          <strong>Ikke gemt:</strong> {errorMessage} Dine seneste ændringer er bevaret her og i browseren.
          <div className="banner-actions">
            <button className="btn btn-sm" onClick={() => void reloadFromServer('Nyeste version hentet. Dine ikke-gemte ændringer er kasseret.')}>
              Hent nyeste (kassér mine)
            </button>
            <button
              className="btn btn-sm btn-warn"
              onClick={async () => {
                const v = await api.version();
                await store.overwriteServer(v.version);
              }}
            >
              Gem mine alligevel (overskriv)
            </button>
            <button className="btn btn-sm" onClick={downloadLocal}>
              <Icon name="download" size={13} /> Download mine
            </button>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="banner banner-error" role="alert">
          <strong>Kunne ikke gemme.</strong> {errorMessage}
          <div className="banner-actions">
            <button className="btn btn-sm" onClick={() => void store.flush()}>
              Prøv igen
            </button>
            {errorMessage?.includes('logget ind') && (
              <button className="btn btn-sm btn-primary" onClick={() => setNeedLogin(true)}>
                Log ind igen
              </button>
            )}
            <button className="btn btn-sm" onClick={downloadLocal}>
              <Icon name="download" size={13} /> Download ændringer
            </button>
          </div>
        </div>
      )}
      {placingBlock && placement && (
        <div className={`banner banner-${placement.mode}`} role="status">
          <Icon name={placement.mode === 'copy' ? 'copy' : 'move'} />
          <span>
            <strong>{placement.mode === 'copy' ? 'Kopiér' : 'Flyt'}</strong> {subjectName(placingBlock)} · {groupName(placingBlock)} ({formatRange(placingBlock.start, placingBlock.end)}) —
            vælg målcelle med klik, eller piletaster + Enter.
          </span>
          <button className="btn btn-sm" onClick={() => setPlacement(null)}>
            Annuller (Esc)
          </button>
        </div>
      )}
      {filterActive(filter) && !placement && (
        <div className="banner banner-filter">
          <Icon name="filter" size={14} /> Filter aktivt – skemaet viser kun matchende blokke. Timeoverblikket omfatter stadig hele grundugen.
          <button className="btn btn-sm" onClick={() => setFilter(emptyFilter)}>
            Ryd filter
          </button>
        </div>
      )}

      {isMobile ? (
        <div className="mobile-body">
          {mobileTab === 'schedule' ? (
            <>
              <DayTabs day={mobileDay} onDay={setMobileDay} counts={[0, 1, 2, 3, 4, 5].map((d) => data.blocks.filter((b) => b.day === d).length)} />
              <DayList
                data={data}
                day={mobileDay}
                filter={filter}
                conflictIds={conflicts.blockIds}
                onOpen={(b, rect) => (placement ? undefined : setEditor({ block: b, isNew: false, anchor: rect }))}
                onAdd={(dp: DaypartIndex) => newBlockAt({ day: mobileDay, daypart: dp, roomId: data.rooms[0].id }, null)}
              />
            </>
          ) : (
            <aside className="panel panel-mobile">{panel}</aside>
          )}
          <nav className="mobile-nav">
            <button className={mobileTab === 'schedule' ? 'on' : ''} onClick={() => setMobileTab('schedule')}>
              <Icon name="grid" /> Skema
            </button>
            <button className={mobileTab === 'hours' ? 'on' : ''} onClick={() => setMobileTab('hours')}>
              <Icon name="clock" /> Timer
            </button>
          </nav>
        </div>
      ) : (
        <div
          className={`workspace panel-${panelPos}${panelOpen ? '' : ' panel-closed'}`}
          style={{ ['--panel-size' as string]: `${panelSize}px` }}
        >
          <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={{ acceleration: 3, threshold: { x: 0.08, y: 0.1 } }} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
            <div className="grid-scroll" tabIndex={-1}>
              {data.blocks.length === 0 && (
                <EmptyHint data={data} onSettings={() => setSettingsTab('teachers')} onDemo={() => setSettingsTab('data')} />
              )}
              <ScheduleGrid
                data={data}
                filter={filter}
                editable
                conflictIds={conflicts.blockIds}
                placement={placement}
                drag={drag}
                flashId={flashId}
                onCellClick={onCellClick}
                onBlockOpen={(b, rect) => setEditor({ block: b, isNew: false, anchor: rect })}
                onBlockMenu={(b, rect) => setMenu({ block: b, rect })}
                onBlockKey={onBlockKey}
              />
            </div>
            <DragOverlay dropAnimation={null}>{drag && <BlockPreview block={drag.block} data={data} badge={drag.copy ? 'Kopiér' : 'Flyt'} />}</DragOverlay>
          </DndContext>
          {panelOpen && (
            <>
              <div className="resizer" onPointerDown={startResize} role="separator" aria-orientation={panelPos === 'right' ? 'vertical' : 'horizontal'} aria-label="Juster panelets størrelse" />
              <aside className="panel" aria-label="Timeoverblik">
                {panel}
              </aside>
            </>
          )}
        </div>
      )}

      {menu && (
        <Anchored anchor={menu.rect} onClose={() => setMenu(null)} label="Handlinger for blok" width={220}>
          <div className="menu" role="menu">
            <button role="menuitem" onClick={() => (setEditor({ block: menu.block, isNew: false, anchor: menu.rect }), setMenu(null))}>
              Rediger <kbd>Enter</kbd>
            </button>
            <button role="menuitem" onClick={() => startPlacement('move', menu.block)}>
              <Icon name="move" size={14} /> Flyt… <kbd>M</kbd>
            </button>
            <button role="menuitem" onClick={() => startPlacement('copy', menu.block)}>
              <Icon name="copy" size={14} /> Kopiér… <kbd>K</kbd>
            </button>
            <button role="menuitem" className="danger" onClick={() => deleteBlock(menu.block)}>
              <Icon name="trash" size={14} /> Slet <kbd>Del</kbd>
            </button>
          </div>
        </Anchored>
      )}

      {editor && (
        <BlockEditor
          key={editor.block.id}
          data={data}
          initial={editor.block}
          isNew={editor.isNew}
          anchor={editor.anchor}
          onSave={saveFromEditor}
          onClose={() => setEditor(null)}
          onDelete={() => deleteBlock(editor.block)}
          onMove={() => (isMobile ? push({ text: 'Skift dag, sal og tid direkte i redigeringen for at flytte blokken.' }) : startPlacement('move', editor.block))}
          onCopy={() => {
            if (!isMobile) return startPlacement('copy', editor.block);
            const b = editor.block;
            setEditor(null);
            placeAt('copy', b, { day: b.day, daypart: daypartOf(b.start, starts), roomId: b.roomId }, null);
          }}
          onSplit={(at) => {
            const r = ops.splitBlock(data, editor.block.id, at);
            if (r && !commit('Del blok', r.data, { flashId: r.second.id, message: 'Blokken er delt i to sammenhængende blokke' })) setEditor(null);
          }}
          onOpenSettings={() => (setEditor(null), setSettingsTab('teachers'))}
        />
      )}

      {timeReq && <TimePicker req={timeReq} starts={starts} onCancel={() => setTimeReq(null)} onConfirm={(start) => finishPlace(timeReq.mode, timeReq.block, timeReq.day, timeReq.roomId, start)} />}

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

      {settingsTab && (
        <Settings
          data={data}
          tab={settingsTab}
          onTab={setSettingsTab}
          onClose={() => setSettingsTab(null)}
          onCommit={(label, next) => commit(label, next, { quiet: true })}
          onImportFile={(f) => void onImportFile(f)}
          onLoadDemo={() => void loadDemo()}
          demoMode={session.demo}
          undo={{ onUndo: undo, onRedo: redo, undoLabel: nextUndo, redoLabel: nextRedo }}
        />
      )}

      {importState && <ImportDialog state={importState} onCancel={() => setImportState(null)} onConfirm={() => void confirmImport()} />}

      {showConflicts && (
        <ConflictOverview
          data={data}
          onClose={() => setShowConflicts(false)}
          onShow={(b) => {
            setShowConflicts(false);
            setFilter(emptyFilter);
            setTimeout(() => {
              const el = document.querySelector<HTMLElement>(`[data-block-id="${b.id}"]`);
              el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
              el?.focus();
              flash(b.id);
            }, 50);
          }}
        />
      )}

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

function SaveIndicator({ status, lastSavedAt, onRetry }: { status: string; lastSavedAt: number | null; onRetry: () => void }) {
  const time = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : null;
  if (status === 'saved')
    return (
      <span className="save save-ok" role="status" title={time ? `Senest gemt kl. ${time}` : 'Alle ændringer er gemt på serveren'}>
        <Icon name="check" size={14} /> Gemt
      </span>
    );
  if (status === 'pending' || status === 'saving')
    return (
      <span className="save save-busy" role="status">
        <Icon name="loader" size={14} className="spin" /> Gemmer…
      </span>
    );
  return (
    <button className="save save-err" onClick={onRetry} role="status">
      <Icon name="cloudOff" size={14} /> {status === 'conflict' ? 'Ikke gemt' : 'Kunne ikke gemme'}
    </button>
  );
}

function EmptyHint({ data, onSettings, onDemo }: { data: AppData; onSettings: () => void; onDemo: () => void }) {
  const missing = !data.teachers.length || !data.subjects.length || !data.groups.length;
  return (
    <div className="empty-hint">
      <strong>Skemaet er tomt.</strong>{' '}
      {missing ? (
        <>
          Start med at oprette lærere, fag og hold under{' '}
          <button className="link" onClick={onSettings}>
            Indstillinger
          </button>
          . Klik derefter i en celle for at oprette en blok.
        </>
      ) : (
        <>Klik i en celle eller på "Ny blok" for at oprette den første undervisning.</>
      )}{' '}
      {!data.blocks.length && !data.teachers.length && (
        <>
          Du kan også{' '}
          <button className="link" onClick={onDemo}>
            indlæse eksempeldata
          </button>
          .
        </>
      )}
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['N', 'Ny blok'],
    ['Ctrl/⌘ + Z', 'Fortryd'],
    ['Ctrl/⌘ + Shift + Z  ·  Ctrl + Y', 'Annuller fortryd'],
    ['Tab', 'Gå mellem blokke'],
    ['Enter', 'Rediger valgt blok'],
    ['M', 'Flyt valgt blok (vælg målcelle)'],
    ['K', 'Kopiér valgt blok (vælg målcelle)'],
    ['Delete', 'Slet valgt blok (kan fortrydes)'],
    ['Piletaster + Enter', 'Vælg målcelle ved flyt/kopiér'],
    ['Alt under træk', 'Kopiér i stedet for at flytte'],
    ['Esc', 'Annuller / luk'],
  ];
  return (
    <Modal title="Tastaturgenveje" onClose={onClose}>
      <table className="help-table">
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
      <p className="muted small">
        Træk en blok med mus, eller hold fingeren på den et øjeblik på en touchskærm. Samme dagdel bevarer klokkeslættet; en anden dagdel åbner en
        tidsvælger. Alt kan også gøres via ⋯-knappen på blokken.
      </p>
      <p className="muted small">Dagdele: {DAYPARTS.join(', ')}.</p>
    </Modal>
  );
}

