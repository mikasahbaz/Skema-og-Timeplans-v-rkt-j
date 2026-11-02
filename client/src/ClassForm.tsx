// Formular til en klasse: hold, lærer(e), titel – og kun ved "Egne tider" start/slut.
// Bruges både af "Tilføj ny klasse" og når en placeret klasse redigeres.
import { useMemo, useState } from 'react';
import { resolveTime } from '../../shared/rules';
import { DAY_NAMES, DEFAULT_TITLE, MAX_GROUPS_PER_BLOCK, MAX_TEACHERS_PER_BLOCK, PERIOD_NAMES, sameGroups, type AppData, type Block } from '../../shared/schema';
import { formatClock, formatDuration, formatRange, parseClock } from '../../shared/time';
import { TeacherChip } from './ui';

interface Props {
  data: AppData;
  initial: Block;
  /** Kendt placering (redigering eller oprettelse fra en celle). */
  placed: boolean;
  submitLabel: string;
  onSubmit: (block: Block) => void;
  onCancel: () => void;
}

export function ClassForm({ data, initial, placed, submitLabel, onSubmit, onCancel }: Props) {
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [teacherIds, setTeacherIds] = useState<string[]>(initial.teacherIds);
  const [title, setTitle] = useState(initial.title || DEFAULT_TITLE);
  const [custom, setCustom] = useState(initial.timeMode === 'custom');
  const [startText, setStartText] = useState(initial.timeMode === 'custom' ? formatClock(initial.start) : '');
  const [endText, setEndText] = useState(initial.timeMode === 'custom' ? formatClock(initial.end) : '');
  const [note, setNote] = useState(initial.note);
  const [showNote, setShowNote] = useState(Boolean(initial.note));
  const [ruleChoice, setRuleChoice] = useState<string | null>(initial.timeMode === 'rule' ? initial.ruleId : null);
  const [tried, setTried] = useState(false);

  const groups = data.groups.filter((g) => !g.archived || groupIds.includes(g.id));
  const teachers = data.teachers.filter((t) => !t.archived || teacherIds.includes(t.id)).sort((a, b) => a.initials.localeCompare(b.initials, 'da'));
  const titles = useMemo(() => [...new Set([DEFAULT_TITLE, ...data.blocks.map((b) => b.title)])].sort((a, b) => a.localeCompare(b, 'da')), [data.blocks]);

  const start = parseClock(startText);
  const end = parseClock(endText);
  const groupsChanged = !sameGroups(groupIds, initial.groupIds);
  const resolution = placed && !custom && groupIds.length ? resolveTime(data.timeRules, groupIds, initial.day, initial.period, groupsChanged ? ruleChoice : (ruleChoice ?? initial.ruleId)) : null;

  const errors: string[] = [];
  if (!groupIds.length) errors.push('Vælg mindst ét hold');
  if (!teacherIds.length) errors.push('Vælg mindst én lærer');
  if (!title.trim()) errors.push('Skriv en titel');
  if (custom) {
    if (start === null) errors.push('Skriv en starttid, fx 9.10');
    if (end === null) errors.push('Skriv en sluttid, fx 9.55');
    if (start !== null && end !== null && end <= start) errors.push('Sluttid skal ligge efter starttid');
  } else if (resolution?.kind === 'choice' && !resolution.options.some((o) => o.id === ruleChoice)) errors.push('Vælg et af tidsrummene');
  else if (resolution?.kind === 'none') errors.push('Der er ingen tidsregel her – vælg "Egne tider"');

  const toggle = (list: string[], id: string, max: number) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]);

  const submit = () => {
    setTried(true);
    if (errors.length) return;
    const base: Block = { ...initial, groupIds, teacherIds, title: title.trim(), note: note.trim() };
    if (custom) return onSubmit({ ...base, timeMode: 'custom', ruleId: null, start: start!, end: end! });
    if (resolution?.kind === 'single') return onSubmit({ ...base, timeMode: 'rule', ruleId: resolution.ruleId, start: resolution.start, end: resolution.end });
    if (resolution?.kind === 'choice') {
      const r = resolution.options.find((o) => o.id === ruleChoice)!;
      return onSubmit({ ...base, timeMode: 'rule', ruleId: r.id, start: r.start, end: r.end });
    }
    // Ikke placeret endnu: tiden findes, når klassen placeres.
    onSubmit({ ...base, timeMode: 'rule', ruleId: null });
  };

  return (
    <form
      className="class-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="field">
        <legend>Hold</legend>
        <div className="chip-picker">
          {groups.map((g) => {
            const on = groupIds.includes(g.id);
            return (
              <button
                type="button"
                key={g.id}
                className={`pick${on ? ' pick-on' : ''}`}
                aria-pressed={on}
                disabled={!on && groupIds.length >= MAX_GROUPS_PER_BLOCK}
                onClick={() => {
                  setGroupIds(toggle(groupIds, g.id, MAX_GROUPS_PER_BLOCK));
                  setRuleChoice(null);
                }}
              >
                {g.name}
              </button>
            );
          })}
        </div>
        {groupIds.length > 1 && <span className="hint">Fælles klasse for {groupIds.length} hold – tælles én gang pr. lærer.</span>}
      </fieldset>

      <fieldset className="field">
        <legend>Lærer{teacherIds.length === 2 ? 'e' : ''}</legend>
        <div className="chip-picker">
          {teachers.map((t) => {
            const on = teacherIds.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                className={`pick pick-teacher${on ? ' pick-on' : ''}`}
                aria-pressed={on}
                disabled={!on && teacherIds.length >= MAX_TEACHERS_PER_BLOCK}
                onClick={() => setTeacherIds(toggle(teacherIds, t.id, MAX_TEACHERS_PER_BLOCK))}
                title={t.name || undefined}
              >
                <TeacherChip teacher={t} />
              </button>
            );
          })}
          {!teachers.length && <span className="hint">Opret lærere under Indstillinger.</span>}
        </div>
      </fieldset>

      <label className="field">
        <span>Titel</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} list="title-suggestions" maxLength={60} />
        <datalist id="title-suggestions">
          {titles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>

      <div className="time-box">
        <label className="check">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
          <span>Egne tider</span>
        </label>
        {custom ? (
          <>
            <div className="field-row">
              <label className="field field-time">
                <span>Start</span>
                <input inputMode="numeric" value={startText} placeholder="9.10" onChange={(e) => setStartText(e.target.value)} onBlur={() => start !== null && setStartText(formatClock(start))} />
              </label>
              <label className="field field-time">
                <span>Slut</span>
                <input inputMode="numeric" value={endText} placeholder="9.55" onChange={(e) => setEndText(e.target.value)} onBlur={() => end !== null && setEndText(formatClock(end))} />
              </label>
              <div className="field">
                <span>Varighed</span>
                <strong className="tabular duration">{start !== null && end !== null && end > start ? formatDuration(end - start) : '—'}</strong>
              </div>
            </div>
            <span className="hint">Klassen beholder præcis dette tidsrum, også når den flyttes.</span>
          </>
        ) : !placed ? (
          <span className="hint">Tiden kommer fra tidstabellen, når du placerer klassen.</span>
        ) : resolution?.kind === 'single' ? (
          <span className="resolved">
            <strong className="tabular">{formatRange(resolution.start, resolution.end)}</strong> · {resolution.derived ? 'fælles tid for holdene' : 'fra tidstabellen'}
            {resolution.label && !resolution.derived ? ` (${resolution.label})` : ''}
          </span>
        ) : resolution?.kind === 'choice' ? (
          <div className="choice-list" role="radiogroup" aria-label="Vælg tidsrum">
            {resolution.options.map((o) => (
              <label key={o.id} className={`choice${ruleChoice === o.id ? ' choice-on' : ''}`}>
                <input type="radio" name="rule" checked={ruleChoice === o.id} onChange={() => setRuleChoice(o.id)} />
                <strong className="tabular">{formatRange(o.start, o.end)}</strong>
                {o.label && <span>{o.label}</span>}
              </label>
            ))}
          </div>
        ) : resolution?.kind === 'none' ? (
          <span className="hint hint-warn">
            Ingen tidsregel for dette hold {DAY_NAMES[initial.day].toLowerCase()} {PERIOD_NAMES[initial.period].toLowerCase()}.
          </span>
        ) : null}
      </div>

      {showNote ? (
        <label className="field">
          <span>Note</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowNote(true)}>
          Tilføj note
        </button>
      )}

      {tried && errors.length > 0 && (
        <ul className="errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Annuller
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
