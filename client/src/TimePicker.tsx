// Lille tidsvælger, når en blok flyttes/kopieres til en anden dagdel (eller kopieres til samme celle).
import { useState } from 'react';
import { DAY_NAMES, type Block } from '../../shared/schema';
import { DAYPARTS, daypartOf, daypartRange, formatClock, formatDuration, formatRange, parseClock, type DaypartIndex } from '../../shared/time';
import { Anchored, Icon } from './ui';

export interface TimePickerRequest {
  mode: 'move' | 'copy';
  block: Block;
  day: number;
  roomId: string;
  roomName: string;
  daypart: DaypartIndex;
  suggested: number;
  anchor: DOMRect | null;
}

export function TimePicker({
  req,
  starts,
  onConfirm,
  onCancel,
}: {
  req: TimePickerRequest;
  starts: [number, number, number];
  onConfirm: (start: number) => void;
  onCancel: () => void;
}) {
  const dur = req.block.end - req.block.start;
  const [text, setText] = useState(formatClock(req.suggested));
  const start = parseClock(text);
  const valid = start !== null && start + dur <= 1440;
  const range = daypartRange(req.daypart, starts);
  const outside = valid && daypartOf(start!, starts) !== req.daypart;
  const verb = req.mode === 'copy' ? 'Kopiér' : 'Flyt';

  // Hurtige forslag i målperioden (hvert kvarter fra forslaget, max 4).
  const quick: number[] = [];
  for (let t = req.suggested; quick.length < 4 && t < range.to && t + dur <= 1440; t += 15) quick.push(t);

  return (
    <Anchored anchor={req.anchor} onClose={onCancel} label={`${verb}: vælg tid`} width={340}>
      <form
        className={`timepicker timepicker-${req.mode}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(start!);
        }}
      >
        <div className="editor-head">
          <h2>
            <Icon name={req.mode === 'copy' ? 'copy' : 'move'} size={15} /> {verb} til {DAY_NAMES[req.day].toLowerCase()} · {req.roomName}
          </h2>
        </div>
        <p className="muted small">
          {DAYPARTS[req.daypart]} ({formatRange(range.from, range.to === 1440 ? 1440 : range.to)}). Varigheden på {formatDuration(dur)} bevares.
        </p>
        <div className="field-row field-row-time">
          <label className="field field-time">
            <span>Ny start</span>
            <input value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" data-autofocus aria-invalid={!valid} />
          </label>
          <div className="field duration-out">
            <span>Ny tid</span>
            <strong className="tabular">{valid ? formatRange(start!, start! + dur) : '—'}</strong>
          </div>
        </div>
        {quick.length > 1 && (
          <div className="quick-times">
            {quick.map((t) => (
              <button type="button" key={t} className={`btn btn-sm${start === t ? ' btn-selected' : ''}`} onClick={() => setText(formatClock(t))}>
                {formatClock(t)}
              </button>
            ))}
          </div>
        )}
        <p className="muted small">Før: {formatRange(req.block.start, req.block.end)}</p>
        {!valid && <p className="error-text">Skriv en gyldig starttid, fx 13.30. Blokken skal slutte senest 24.00.</p>}
        {outside && <p className="warn-text">Tiden ligger uden for {DAYPARTS[req.daypart].toLowerCase()} – blokken vises i {DAYPARTS[daypartOf(start!, starts)].toLowerCase()}.</p>}
        <div className="editor-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Annuller
          </button>
          <button type="submit" className={`btn ${req.mode === 'copy' ? 'btn-copy' : 'btn-primary'}`} disabled={!valid}>
            {verb} hertil
          </button>
        </div>
      </form>
    </Anchored>
  );
}
