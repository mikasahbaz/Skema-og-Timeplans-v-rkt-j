// Indstillinger: stamdata (lærere, fag, hold, sale), beregningssatser, dagdele og data/backup.
// Hver ændring er én fortrydbar handling via onCommit.
import { useRef, useState, type ReactNode } from 'react';
import { prepMinutesPerHour } from '../../shared/calc';
import { TEACHER_PALETTE } from '../../shared/colors';
import type { AppData, Teacher } from '../../shared/schema';
import { DAYPARTS, formatClock, formatNumber, parseClock } from '../../shared/time';
import { usage } from '../../shared/validate';
import * as ops from './ops';
import { Icon, Modal } from './ui';

export type CommitFn = (label: string, next: AppData) => string[] | null; // returnerer fejl eller null

interface Props {
  data: AppData;
  tab: string;
  onTab: (t: string) => void;
  onCommit: CommitFn;
  onClose: () => void;
  onImportFile: (file: File) => void;
  onLoadDemo: () => void;
  demoMode: boolean;
  undo: { onUndo: () => void; onRedo: () => void; undoLabel?: string; redoLabel?: string };
}

const TABS: [string, string][] = [
  ['teachers', 'Lærere'],
  ['subjects', 'Fag'],
  ['groups', 'Hold'],
  ['rooms', 'Sale'],
  ['calc', 'Beregning'],
  ['dayparts', 'Dagdele'],
  ['data', 'Data og backup'],
];

export function Settings(p: Props) {
  return (
    <Modal
      title="Indstillinger"
      onClose={p.onClose}
      wide
      footer={
        <>
          <span className="muted small foot-note">Ændringer gemmes automatisk og kan fortrydes.</span>
          <button className="btn" onClick={p.undo.onUndo} disabled={!p.undo.undoLabel} title={p.undo.undoLabel ? `Fortryd: ${p.undo.undoLabel}` : undefined}>
            <Icon name="undo" size={14} /> Fortryd
          </button>
          <button className="btn" onClick={p.undo.onRedo} disabled={!p.undo.redoLabel} title={p.undo.redoLabel ? `Annuller fortryd: ${p.undo.redoLabel}` : undefined}>
            <Icon name="redo" size={14} /> Annuller fortryd
          </button>
          <button className="btn btn-primary" onClick={p.onClose}>
            Færdig
          </button>
        </>
      }
    >
      <div className="settings">
        <nav className="settings-tabs" role="tablist" aria-label="Indstillinger">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={p.tab === id} className={p.tab === id ? 'on' : ''} onClick={() => p.onTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body" role="tabpanel">
          {p.tab === 'teachers' && <TeachersTab {...p} />}
          {p.tab === 'subjects' && <NamedTab {...p} kind="subjects" />}
          {p.tab === 'groups' && <NamedTab {...p} kind="groups" />}
          {p.tab === 'rooms' && <RoomsTab {...p} />}
          {p.tab === 'calc' && <CalcTab {...p} />}
          {p.tab === 'dayparts' && <DaypartsTab {...p} />}
          {p.tab === 'data' && <DataTab {...p} />}
        </div>
      </div>
    </Modal>
  );
}

// ---- Felter, der gemmer ved blur/Enter (én handling pr. ændring) ----------------
function CommitText({
  value,
  onCommit,
  label,
  placeholder,
  transform = (s) => s,
  className,
}: {
  value: string;
  onCommit: (v: string) => string[] | null;
  label: string;
  placeholder?: string;
  transform?: (s: string) => string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    setDraft(value);
  }
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {err && <span className="error-text small">{err}</span>}
    </span>
  );
}

/** Tal med dansk komma. Tomt felt = null (mangler), 0 er en gyldig værdi. */
function CommitNumber({
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
  const show = (v: number | null) => (v === null ? '' : formatNumber(v, 4).replace(/\./g, ''));
  const [draft, setDraft] = useState(show(value));
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    setDraft(show(value));
  }
  const commit = () => {
    const raw = draft.trim().replace(/\s/g, '');
    let v: number | null;
    if (raw === '') v = null;
    else {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || !/^-?\d+([.,]\d+)?$/.test(raw)) {
        setErr('Skriv et tal, fx 25 eller 12,5 – eller lad feltet stå tomt');
        return;
      }
      v = n;
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
      {err && <span className="error-text small">{err}</span>}
    </span>
  );
}

function AddRow({ placeholder, button, onAdd }: { placeholder: string; button: string; onAdd: (v: string) => string[] | null }) {
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
      <button className="btn btn-primary" type="submit" disabled={!v.trim()}>
        <Icon name="plus" size={14} /> {button}
      </button>
      {err && <span className="error-text small">{err}</span>}
    </form>
  );
}

const cleanErrors = (errors: string[] | null): string[] | null => (errors ? errors.map((e) => e.replace(/^[a-z]+\.\d+\.[a-zA-Z]+: /, '')) : null);

// ---- Lærere -------------------------------------------------------------------
function TeachersTab({ data, onCommit }: Props) {
  const used = usage(data).teachers;
  const [showArchived, setShowArchived] = useState(false);
  const list = data.teachers.filter((t) => showArchived || !t.archived);
  const upd = (t: Teacher, patch: Partial<Teacher>, label: string) => cleanErrors(onCommit(label, ops.updateTeacher(data, t.id, patch)));
  return (
    <div>
      <p className="muted small">
        Initialerne vises i skemaet. Farven tildeles automatisk og ændres ikke ved genindlæsning. Årsarbejdstimer bruges til
        årsfremskrivningen – et tomt felt betyder "mangler", 0 er en gyldig værdi.
      </p>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Farve</th>
            <th>Initialer</th>
            <th>Navn (valgfrit)</th>
            <th>Årsarbejdstimer</th>
            <th>Blokke</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id} className={t.archived ? 'archived' : ''}>
              <td>
                <ColorPicker value={t.color} onChange={(c) => upd(t, { color: c }, `Ændr farve for ${t.initials}`)} label={`Farve for ${t.initials}`} />
              </td>
              <td>
                <CommitText value={t.initials} label="Initialer" transform={(s) => s.toUpperCase()} className="ct-initials" onCommit={(v) => upd(t, { initials: v }, `Omdøb ${t.initials} til ${v}`)} />
              </td>
              <td>
                <CommitText value={t.name} label="Navn" placeholder="Valgfrit" onCommit={(v) => upd(t, { name: v }, `Ændr navn for ${t.initials}`)} />
              </td>
              <td>
                <CommitNumber value={t.annualHours} label={`Årsarbejdstimer for ${t.initials}`} suffix="t" onCommit={(v) => upd(t, { annualHours: v }, `Årstimer for ${t.initials}`)} />
              </td>
              <td className="num">{used.get(t.id) ?? 0}</td>
              <td className="actions">
                <ArchiveButtons
                  archived={t.archived}
                  inUse={(used.get(t.id) ?? 0) > 0}
                  name={t.initials}
                  onArchive={(a) => upd(t, { archived: a }, `${a ? 'Arkivér' : 'Genaktivér'} ${t.initials}`)}
                  onDelete={() => onCommit(`Slet lærer ${t.initials}`, ops.removeItem(data, 'teachers', t.id))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ArchivedToggle count={data.teachers.filter((t) => t.archived).length} show={showArchived} onToggle={setShowArchived} />
      <AddRow placeholder="Initialer, fx TH" button="Tilføj lærer" onAdd={(v) => cleanErrors(onCommit(`Tilføj lærer ${v.toUpperCase()}`, ops.addTeacher(data, v).data))} />
    </div>
  );
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
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
          <label className="custom-color">
            Anden
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setOpen(false)} />
          </label>
        </span>
      )}
    </span>
  );
}

function ArchiveButtons({
  archived,
  inUse,
  name,
  onArchive,
  onDelete,
}: {
  archived: boolean;
  inUse: boolean;
  name: string;
  onArchive: (a: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button className="btn btn-sm btn-ghost" onClick={() => onArchive(!archived)} title={archived ? 'Gør aktiv igen' : 'Skjul fra nye blokke – eksisterende blokke bevares'}>
        <Icon name="archive" size={13} /> {archived ? 'Genaktivér' : 'Arkivér'}
      </button>
      {!inUse && (
        <button className="btn btn-sm btn-ghost btn-danger" onClick={onDelete} aria-label={`Slet ${name}`} title="Kan slettes, fordi den ikke bruges">
          <Icon name="trash" size={13} />
        </button>
      )}
    </>
  );
}

function ArchivedToggle({ count, show, onToggle }: { count: number; show: boolean; onToggle: (v: boolean) => void }) {
  if (!count) return null;
  return (
    <label className="check small">
      <input type="checkbox" checked={show} onChange={(e) => onToggle(e.target.checked)} /> Vis arkiverede ({count})
    </label>
  );
}

// ---- Fag og hold ----------------------------------------------------------------
function NamedTab({ data, onCommit, kind }: Props & { kind: 'subjects' | 'groups' }) {
  const u = usage(data)[kind];
  const [showArchived, setShowArchived] = useState(false);
  const label = kind === 'subjects' ? 'fag' : 'hold';
  const items = data[kind].filter((x) => showArchived || !x.archived);
  return (
    <div>
      <p className="muted small">
        {kind === 'subjects'
          ? 'Fag er genbrugelige typer undervisning. Lærere vælges på den enkelte blok, ikke på faget.'
          : 'Hold er elevgrupper.'}{' '}
        Elementer i brug kan arkiveres; de forsvinder så fra nye blokke, men eksisterende undervisning bevares.
      </p>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Navn</th>
            <th>Blokke</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id} className={x.archived ? 'archived' : ''}>
              <td>
                <CommitText value={x.name} label={`Navn på ${label}`} onCommit={(v) => cleanErrors(onCommit(`Omdøb ${label}`, ops.updateNamed(data, kind, x.id, { name: v })))} />
              </td>
              <td className="num">{u.get(x.id) ?? 0}</td>
              <td className="actions">
                <ArchiveButtons
                  archived={x.archived}
                  inUse={(u.get(x.id) ?? 0) > 0}
                  name={x.name}
                  onArchive={(a) => onCommit(`${a ? 'Arkivér' : 'Genaktivér'} ${x.name}`, ops.updateNamed(data, kind, x.id, { archived: a }))}
                  onDelete={() => onCommit(`Slet ${label} ${x.name}`, ops.removeItem(data, kind, x.id))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ArchivedToggle count={data[kind].filter((x) => x.archived).length} show={showArchived} onToggle={setShowArchived} />
      <AddRow
        placeholder={kind === 'subjects' ? 'Nyt fag, fx Klassisk ballet' : 'Nyt hold, fx Hold 3'}
        button={`Tilføj ${label}`}
        onAdd={(v) => cleanErrors(onCommit(`Tilføj ${label} ${v}`, ops.addNamed(data, kind, v, kind === 'subjects' ? 's' : 'g').data))}
      />
    </div>
  );
}

// ---- Sale -----------------------------------------------------------------------
function RoomsTab({ data, onCommit }: Props) {
  return (
    <div>
      <p className="muted small">Skemaet har altid otte kolonner. Navne og rækkefølge kan ændres; blokke følger salen.</p>
      <table className="settings-table">
        <tbody>
          {data.rooms.map((r, i) => (
            <tr key={r.id}>
              <td className="num">{i + 1}</td>
              <td>
                <CommitText value={r.name} label={`Navn på kolonne ${i + 1}`} onCommit={(v) => cleanErrors(onCommit(`Omdøb ${r.name}`, ops.updateRoom(data, r.id, { name: v })))} />
              </td>
              <td className="actions">
                <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => onCommit(`Flyt ${r.name} til venstre`, ops.moveRoom(data, r.id, -1))} aria-label={`Flyt ${r.name} til venstre`}>
                  <Icon name="up" size={13} />
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={i === data.rooms.length - 1}
                  onClick={() => onCommit(`Flyt ${r.name} til højre`, ops.moveRoom(data, r.id, 1))}
                  aria-label={`Flyt ${r.name} til højre`}
                >
                  <Icon name="down" size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Beregning -------------------------------------------------------------------
function CalcTab({ data, onCommit }: Props) {
  const s = data.settings;
  const set = (patch: Partial<AppData['settings']>, label: string) => cleanErrors(onCommit(label, ops.updateSettings(data, patch)));
  return (
    <div className="calc-settings">
      <p className="muted small">
        Disse satser er skolens egne beregningsregler. Tomme felter vises som manglende oplysninger og regnes ikke som 0. Alle ændringer
        genberegner straks og kan fortrydes.
      </p>
      <Row label="Forberedelse (p)" help={s.prepPercent === null ? 'Mangler' : `= ${formatNumber(prepMinutesPerHour(s.prepPercent))} min forberedelse pr. 60 min undervisning`}>
        <CommitNumber value={s.prepPercent} label="Forberedelsesprocent" suffix="%" onCommit={(v) => set({ prepPercent: v }, 'Ændr forberedelsesprocent')} />
      </Row>
      <Row label="Lørdagstillæg (s)" help="Procent af den faktiske undervisningstid om lørdagen">
        <CommitNumber value={s.saturdayPercent} label="Lørdagstillæg i procent" suffix="%" onCommit={(v) => set({ saturdayPercent: v }, 'Ændr lørdagstillæg')} />
      </Row>
      <Row label="Forberedelsesgrundlag" help="De to regler giver forskellige resultater for lørdagsundervisning.">
        <div className="radio-list">
          <label className="check">
            <input type="radio" name="basis" checked={s.prepBasis === 'actual'} onChange={() => set({ prepBasis: 'actual' }, 'Forberedelse af faktisk undervisning')} />
            <span>
              <strong>Faktisk undervisningstid</strong> (standard) — F = U × p
            </span>
          </label>
          <label className="check">
            <input type="radio" name="basis" checked={s.prepBasis === 'withSaturday'} onChange={() => set({ prepBasis: 'withSaturday' }, 'Forberedelse inkl. lørdagstillæg')} />
            <span>
              <strong>Undervisning inkl. lørdagstillæg</strong> — F = (U + L) × p
            </span>
          </label>
        </div>
      </Row>
      <Row label="Undervisningsuger (W)" help="Antal uger i skoleåret, hvor grundugen gentages">
        <CommitNumber value={s.teachingWeeks} label="Antal undervisningsuger" suffix="uger" onCommit={(v) => set({ teachingWeeks: v }, 'Ændr antal undervisningsuger')} />
      </Row>
      <div className="formula">
        <div>Pr. lærer og dag:</div>
        <code>U = faktisk undervisningstid</code>
        <code>L = U × s/100 om lørdagen, ellers 0</code>
        <code>F = {s.prepBasis === 'actual' ? 'U' : '(U + L)'} × p/100</code>
        <code>K = U + F + L · Planlagt år = K(uge) × W · Rest = A − planlagt</code>
      </div>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <strong>{label}</strong>
        {help && <span className="muted small">{help}</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---- Dagdele -----------------------------------------------------------------------
function DaypartsTab({ data, onCommit }: Props) {
  const starts = data.settings.daypartStarts;
  return (
    <div>
      <p className="muted small">
        Skel er kun en visningsindstilling. En blok vises i den dagdel, hvor den starter; undervisningens tider ændres aldrig af skellene.
      </p>
      {[1, 2, 3].map((dp) => (
        <Row key={dp} label={`${DAYPARTS[dp]} starter kl.`}>
          <CommitText
            value={formatClock(starts[dp - 1])}
            label={`${DAYPARTS[dp]} starter`}
            className="ct-time"
            onCommit={(v) => {
              const m = parseClock(v);
              if (m === null || m >= 1440) return ['Skriv et klokkeslæt, fx 10.00'];
              const next = [...starts] as [number, number, number];
              next[dp - 1] = m;
              return cleanErrors(onCommit(`Ændr skel for ${DAYPARTS[dp].toLowerCase()}`, ops.updateSettings(data, { daypartStarts: next })));
            }}
          />
        </Row>
      ))}
      <p className="muted small">Morgen er alt før {formatClock(starts[0])}.</p>
    </div>
  );
}

// ---- Data og backup ------------------------------------------------------------------
function DataTab({ data, onImportFile, onLoadDemo, demoMode }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const empty = !data.blocks.length && !data.teachers.length && !data.subjects.length && !data.groups.length;
  return (
    <div className="data-tab">
      <section>
        <h3>Eksport</h3>
        <p className="muted small">Henter alle appdata (skema, stamdata, farver, salenavne og indstillinger) som én JSON-fil.</p>
        <a className="btn" href="/api/export" download>
          <Icon name="download" size={14} /> Download backup
        </a>
      </section>
      <section>
        <h3>Import</h3>
        <p className="muted small">Filen kontrolleres først. Du ser, hvad der erstattes, før noget ændres.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> Vælg backupfil…
        </button>
      </section>
      <section>
        <h3>Eksempeldata</h3>
        {demoMode ? (
          <p className="small">Appen kører i demotilstand med en separat database. Du kan altid nulstille til eksempeldata.</p>
        ) : (
          <p className="muted small">Kan kun indlæses i et helt tomt skema, så rigtige data aldrig overskrives.</p>
        )}
        <button className="btn" disabled={!demoMode && !empty} onClick={onLoadDemo}>
          {demoMode ? 'Nulstil til eksempeldata' : 'Indlæs eksempeldata'}
        </button>
      </section>
    </div>
  );
}

