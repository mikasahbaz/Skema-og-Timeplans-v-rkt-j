// Felter til Indstillinger, der gemmer ved Enter eller når feltet forlades (én fortrydbar handling pr. ændring).
import { useRef, useState, type ReactNode } from 'react';
import { TEACHER_PALETTE } from '../../shared/colors';
import { formatClock, formatNumber, parseClock } from '../../shared/time';
import { Icon } from './ui';

export type Commit = (v: string) => string[] | null;

function useSynced<T>(value: T, toDraft: (v: T) => string) {
  const [draft, setDraft] = useState(toDraft(value));
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    setDraft(toDraft(value));
  }
  return [draft, setDraft] as const;
}

export function CommitText({
  value,
  onCommit,
  label,
  placeholder,
  transform = (s) => s,
  className,
}: {
  value: string;
  onCommit: Commit;
  label: string;
  placeholder?: string;
  transform?: (s: string) => string;
  className?: string;
}) {
  const [draft, setDraft] = useSynced(value, (v) => v);
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const v = transform(draft.trim());
    if (v === value) return setDraft(value);
    const errors = onCommit(v);
    setErr(errors ? errors[0] : null);
  };
  return (
    <span className={`ct ${className ?? ''}`}>
      <input
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        aria-invalid={Boolean(err)}
        onChange={(e) => {
          setDraft(e.target.value);
          setErr(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {err && <span className="error-text">{err}</span>}
    </span>
  );
}

/** Klokkeslæt (minutter). Accepterer fx 9, 9.10, 910, 9:10. */
export function CommitClock({ value, onCommit, label }: { value: number; onCommit: (m: number) => string[] | null; label: string }) {
  const [draft, setDraft] = useSynced(value, formatClock);
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const m = parseClock(draft);
    if (m === null) return setErr('Skriv et klokkeslæt, fx 9.10');
    if (m === value) return setDraft(formatClock(value));
    const errors = onCommit(m);
    setErr(errors ? errors[0] : null);
    if (!errors) setDraft(formatClock(m));
  };
  return (
    <span className="ct ct-clock">
      <input
        aria-label={label}
        inputMode="numeric"
        value={draft}
        aria-invalid={Boolean(err)}
        onChange={(e) => {
          setDraft(e.target.value);
          setErr(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {err && <span className="error-text">{err}</span>}
    </span>
  );
}

/** Tal med dansk komma. Tomt felt = null (mangler); 0 er en gyldig værdi. */
export function CommitNumber({
  value,
  onCommit,
  label,
  suffix,
  placeholder = 'mangler',
}: {
  value: number | null;
  onCommit: (v: number | null) => string[] | null;
  label: string;
  suffix?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useSynced(value, (v) => (v === null ? '' : formatNumber(v, 4).replace(/\./g, '')));
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const raw = draft.trim().replace(/\s/g, '');
    let v: number | null;
    if (raw === '') v = null;
    else {
      if (!/^-?\d+([.,]\d+)?$/.test(raw)) return setErr('Skriv et tal, fx 25 eller 12,5 – eller lad feltet stå tomt');
      v = Number(raw.replace(',', '.'));
    }
    if (v === value) return;
    const errors = onCommit(v);
    setErr(errors ? errors[0] : null);
  };
  return (
    <span className="ct ct-num">
      <span className="num-wrap">
        <input
          aria-label={label}
          inputMode="decimal"
          value={draft}
          placeholder={placeholder}
          aria-invalid={Boolean(err)}
          className={value === null ? 'is-missing' : ''}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {err && <span className="error-text">{err}</span>}
    </span>
  );
}

export function AddRow({ placeholder, button, onAdd }: { placeholder: string; button: string; onAdd: (v: string) => string[] | null }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        const errors = onAdd(v.trim());
        if (errors) setErr(errors[0]);
        else {
          setV('');
          setErr(null);
        }
      }}
    >
      <input value={v} placeholder={placeholder} aria-label={placeholder} onChange={(e) => (setV(e.target.value), setErr(null))} />
      <button className="btn" type="submit" disabled={!v.trim()}>
        <Icon name="plus" size={16} /> {button}
      </button>
      {err && <span className="error-text">{err}</span>}
    </form>
  );
}

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="colorpick">
      <button className="swatch" style={{ background: value }} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <span className="palette" role="listbox" aria-label={label}>
          {TEACHER_PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch swatch-sm${c === value ? ' on' : ''}`}
              style={{ background: c }}
              aria-label={c}
              aria-selected={c === value}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {help && <span className="hint">{help}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

export const cleanErrors = (errors: string[] | null): string[] | null =>
  errors ? errors.map((e) => e.replace(/^[a-zA-Z]+(\.\d+)?(\.[a-zA-Z]+)?: /, '').replace(/^(Klasse|Tidsregel) [^:]+: /, '')) : null;
