// Kompakt redigering af en blok: fag, hold, lærere, dag, sal, tid og note.
import { useMemo, useState } from 'react';
import { conflictsForBlock } from '../../shared/conflicts';
import { DAY_NAMES, MAX_TEACHERS_PER_BLOCK, type AppData, type Block } from '../../shared/schema';
import { formatClock, formatDuration, parseClock } from '../../shared/time';
import { validateBlock } from '../../shared/validate';
import { ConflictList } from './Conflicts';
import { Anchored, Icon, TeacherChip } from './ui';

interface Props {
  data: AppData;
  initial: Block;
  isNew: boolean;
  anchor: DOMRect | null;
  onSave: (block: Block) => void;
  onClose: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCopy: () => void;
  onSplit: (at: number) => void;
  onOpenSettings: () => void;
}

export function BlockEditor({ data, initial, isNew, anchor, onSave, onClose, onDelete, onMove, onCopy, onSplit, onOpenSettings }: Props) {
  const [draft, setDraft] = useState<Block>(initial);
  const [startText, setStartText] = useState(formatClock(initial.start));
  const [endText, setEndText] = useState(formatClock(initial.end));
  const [tried, setTried] = useState(false);
  const [splitText, setSplitText] = useState<string | null>(null);

  const start = parseClock(startText);
  const end = parseClock(endText);
  const candidate: Block = { ...draft, start: start ?? -1, end: end ?? -1, note: draft.note.trim() };

  const errors = useMemo(() => {
    const list: string[] = [];
    if (start === null) list.push('Starttid er ugyldig – skriv fx 9.30');
    if (end === null) list.push('Sluttid er ugyldig – skriv fx 11.00');
    if (start !== null && end !== null) list.push(...validateBlock(candidate, data));
    else list.push(...validateBlock({ ...candidate, start: 0, end: 1 }, data));
    return [...new Set(list)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startText, endText, draft, data]);

  const conflicts = useMemo(
    () => (start !== null && end !== null && end > start ? conflictsForBlock(candidate, data.blocks) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startText, endText, draft, data.blocks],
  );

  const activeTeachers = data.teachers.filter((t) => !t.archived || draft.teacherIds.includes(t.id));
  const subjects = data.subjects.filter((s) => !s.archived || s.id === draft.subjectId);
  const groups = data.groups.filter((g) => !g.archived || g.id === draft.groupId);
  const missingMaster = !data.subjects.some((s) => !s.archived) || !data.groups.some((g) => !g.archived) || !data.teachers.some((t) => !t.archived);

  const toggleTeacher = (id: string) => {
    setDraft((d) => {
      if (d.teacherIds.includes(id)) return { ...d, teacherIds: d.teacherIds.filter((t) => t !== id) };
      if (d.teacherIds.length >= MAX_TEACHERS_PER_BLOCK) return d;
      return { ...d, teacherIds: [...d.teacherIds, id] };
    });
  };

  const submit = () => {
    setTried(true);
    if (errors.length) return;
    onSave(candidate);
  };

  const dur = start !== null && end !== null && end > start ? end - start : null;

  return (
    <Anchored anchor={anchor} onClose={onClose} label={isNew ? 'Ny blok' : 'Rediger blok'} width={420}>
      <form
        className="editor"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="editor-head">
          <h2>{isNew ? 'Ny blok' : 'Rediger blok'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Luk">
            <Icon name="x" />
          </button>
        </div>

        {missingMaster && (
          <div className="notice notice-warn">
            Der mangler fag, hold eller lærere.{' '}
            <button type="button" className="link" onClick={onOpenSettings}>
              Opret dem under Indstillinger
            </button>
          </div>
        )}

        <div className="field-row">
          <label className="field">
            <span>Fag</span>
            <select value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })} data-autofocus>
              <option value="">Vælg fag…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.archived ? ' (arkiveret)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Hold</span>
            <select value={draft.groupId} onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}>
              <option value="">Vælg hold…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.archived ? ' (arkiveret)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="field">
          <legend>
            Lærere <span className="muted">(1–2 · {draft.teacherIds.length} valgt)</span>
          </legend>
          <div className="teacher-picker">
            {activeTeachers.map((t) => {
              const on = draft.teacherIds.includes(t.id);
              const disabled = !on && draft.teacherIds.length >= MAX_TEACHERS_PER_BLOCK;
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`tp${on ? ' tp-on' : ''}`}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggleTeacher(t.id)}
                  title={t.name || undefined}
                >
                  <TeacherChip teacher={t} />
                  {on && <Icon name="check" size={13} />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="field-row">
          <label className="field">
            <span>Dag</span>
            <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sal</span>
            <select value={draft.roomId} onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row field-row-time">
          <label className="field field-time">
            <span>Start</span>
            <input
              inputMode="numeric"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={() => start !== null && setStartText(formatClock(start))}
              aria-invalid={start === null}
            />
          </label>
          <label className="field field-time">
            <span>Slut</span>
            <input
              inputMode="numeric"
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
              onBlur={() => end !== null && setEndText(formatClock(end))}
              aria-invalid={end === null}
            />
          </label>
          <div className="field duration-out" aria-live="polite">
            <span>Varighed</span>
            <strong>{dur === null ? '—' : formatDuration(dur)}</strong>
          </div>
        </div>

        <label className="field">
          <span>Note</span>
          <input value={draft.note} maxLength={300} placeholder="Valgfri, fx repertoire eller niveau" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </label>

        {tried && errors.length > 0 && (
          <ul className="errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {conflicts.length > 0 && (
          <div className="notice notice-conflict">
            <strong>
              <Icon name="alert" size={14} /> Konflikt
            </strong>
            <ConflictList conflicts={conflicts} data={data} />
            <span className="muted">Du bliver spurgt, før en konflikt gemmes.</span>
          </div>
        )}

        {splitText !== null && !isNew && (
          <div className="split-row">
            <label className="field field-time">
              <span>Del ved kl.</span>
              <input value={splitText} onChange={(e) => setSplitText(e.target.value)} autoFocus />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const at = parseClock(splitText);
                if (at !== null && at > initial.start && at < initial.end) onSplit(at);
              }}
              disabled={(() => {
                const at = parseClock(splitText);
                return at === null || at <= initial.start || at >= initial.end;
              })()}
            >
              Del blokken
            </button>
            <span className="muted small">Giver to sammenhængende blokke, fx når en ekstra lærer kun er med en del af tiden.</span>
          </div>
        )}

        <div className="editor-foot">
          {!isNew && (
            <div className="editor-tools">
              <button type="button" className="btn btn-ghost" onClick={onMove} title="Flyt (M)">
                <Icon name="move" size={14} /> Flyt
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCopy} title="Kopiér (K)">
                <Icon name="copy" size={14} /> Kopiér
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSplitText(splitText === null ? formatClock(Math.round((initial.start + initial.end) / 2 / 5) * 5) : null)}
              >
                <Icon name="scissors" size={14} /> Del
              </button>
              <button type="button" className="btn btn-ghost btn-danger" onClick={onDelete} title="Slet (Delete)">
                <Icon name="trash" size={14} /> Slet
              </button>
            </div>
          )}
          <div className="editor-actions">
            <button type="button" className="btn" onClick={onClose}>
              Annuller
            </button>
            <button type="submit" className="btn btn-primary">
              {isNew ? 'Opret' : 'Gem'}
            </button>
          </div>
        </div>
      </form>
    </Anchored>
  );
}
