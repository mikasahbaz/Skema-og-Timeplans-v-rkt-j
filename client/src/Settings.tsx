// Panelet bag tandhjulet: fire afsnit, ét åbent ad gangen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MISSING_LABELS, computeTeacherSummary, prepMinutesPerHour, type TeacherSummary } from '../../shared/calc';
import { allConflicts, describeConflict, slotTitle, ASSEMBLY_ID } from '../../shared/conflicts';
import { DAY_NAMES, DAY_SHORT, type AppData, type Block } from '../../shared/schema';
import { formatDecimalHours, formatDuration, formatHours, formatNumber, formatRange } from '../../shared/time';
import { usage } from '../../shared/validate';
import { api, STANDALONE, type RevisionInfo } from './api';
import { AddRow, ColorPicker, CommitNumber, CommitText, Row, Segmented, cleanErrors } from './fields';
import { groupsLabel } from './Grid';
import * as ops from './ops';
import { RulesSection, type RulesProps } from './SettingsRules';
import { Icon, TeacherChip, useEscape } from './ui';

export type SectionId = 'people' | 'rules' | 'work' | 'tools';

export interface SettingsProps extends RulesProps {
  section: SectionId | null;
  onSection: (s: SectionId | null) => void;
  detailTeacherId: string | null;
  onClose: () => void;
  undo: { onUndo: () => void; onRedo: () => void; undoLabel?: string; redoLabel?: string };
  onShowBlock: (b: Block) => void;
  onImportFile: (f: File) => void;
  onLoadDemo: () => void;
  onRestoreRevision: (v: number) => void;
  onLogout: () => void;
  onShowHelp: () => void;
  currentVersion: number;
  demoMode: boolean;
}

const SECTIONS: { id: SectionId; title: string; desc: string }[] = [
  { id: 'people', title: 'Lærere og hold', desc: 'Lærere, farver, hold og salenes navne' },
  { id: 'rules', title: 'Tidsregler og morgensamling', desc: 'Tider fra skemadokumentet og fredagens morgensamling' },
  { id: 'work', title: 'Arbejdstid, forberedelse og lørdagstillæg', desc: 'Satser, årsarbejdstid og detaljeret opgørelse' },
  { id: 'tools', title: 'Øvrige værktøjer', desc: 'Fortryd, konflikter, backup og læsevisning' },
];

export function Settings(p: SettingsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(p.onClose);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.section-toggle')?.focus();
  }, []);
  return (
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="sheet-head">
          <h2 id="settings-title">Indstillinger</h2>
          <button className="icon-btn icon-btn-lg" onClick={p.onClose} aria-label="Luk indstillinger">
            <Icon name="x" size={22} />
          </button>
        </header>
        <div className="sheet-body">
          {SECTIONS.map((s) => {
            const open = p.section === s.id;
            return (
              <section key={s.id} className={`section${open ? ' open' : ''}`}>
                <button className="section-toggle" aria-expanded={open} onClick={() => p.onSection(open ? null : s.id)}>
                  <span>
                    <span className="section-title">{s.title}</span>
                    <span className="section-desc">{s.desc}</span>
                  </span>
                  <Icon name="chevronDown" size={20} className="chev" />
                </button>
                {open && (
                  <>
                    {s.id === 'people' && <PeopleSection {...p} />}
                    {s.id === 'rules' && <RulesSection {...p} />}
                    {s.id === 'work' && <WorkSection {...p} />}
                    {s.id === 'tools' && <ToolsSection {...p} />}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- 1. Lærere og hold ---------------------------------------------------------------------
function PeopleSection({ data, onCommit }: SettingsProps) {
  const [tab, setTab] = useState<'teachers' | 'groups' | 'rooms'>('teachers');
  const used = usage(data);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <div className="section-body">
      <Segmented
        label="Lærere og hold"
        value={tab}
        onChange={setTab}
        options={[
          ['teachers', 'Lærere'],
          ['groups', 'Hold'],
          ['rooms', 'Sale'],
        ]}
      />
      {tab === 'teachers' && (
        <>
          <p className="hint">Initialerne og farven vises på klasserne. Farven ligger fast, også efter genindlæsning.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Farve</th>
                <th>Initialer</th>
                <th>Navn</th>
                <th>Klasser</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.teachers
                .filter((t) => showArchived || !t.archived)
                .map((t) => (
                  <tr key={t.id} className={t.archived ? 'archived' : ''}>
                    <td>
                      <ColorPicker value={t.color} label={`Farve for ${t.initials}`} onChange={(c) => onCommit(`Ændr farve for ${t.initials}`, ops.updateTeacher(data, t.id, { color: c }))} />
                    </td>
                    <td>
                      <CommitText
                        value={t.initials}
                        label="Initialer"
                        className="ct-initials"
                        transform={(s) => s.toUpperCase()}
                        onCommit={(v) => cleanErrors(onCommit(`Omdøb ${t.initials} til ${v}`, ops.updateTeacher(data, t.id, { initials: v })))}
                      />
                    </td>
                    <td>
                      <CommitText value={t.name} label="Navn" placeholder="Valgfrit" onCommit={(v) => cleanErrors(onCommit(`Navn for ${t.initials}`, ops.updateTeacher(data, t.id, { name: v })))} />
                    </td>
                    <td className="num">{used.teachers.get(t.id) ?? 0}</td>
                    <td className="actions">
                      <Archive
                        archived={t.archived}
                        inUse={(used.teachers.get(t.id) ?? 0) > 0}
                        name={t.initials}
                        onArchive={(a) => onCommit(`${a ? 'Arkivér' : 'Genaktivér'} ${t.initials}`, ops.updateTeacher(data, t.id, { archived: a }))}
                        onDelete={() => onCommit(`Slet ${t.initials}`, ops.removeTeacher(data, t.id))}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <ArchivedToggle count={data.teachers.filter((t) => t.archived).length} show={showArchived} onToggle={setShowArchived} />
          <AddRow placeholder="Initialer, fx TH" button="Tilføj lærer" onAdd={(v) => cleanErrors(onCommit(`Tilføj lærer ${v.toUpperCase()}`, ops.addTeacher(data, v).data))} />
        </>
      )}
      {tab === 'groups' && (
        <>
          <p className="hint">Hold og undergrupper fra skemadokumentet. Hold i brug kan arkiveres, så de ikke tilbydes til nye klasser.</p>
          <table className="table">
            <thead>
              <tr>
                <th>Hold</th>
                <th>I brug</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.groups
                .filter((g) => showArchived || !g.archived)
                .map((g) => (
                  <tr key={g.id} className={g.archived ? 'archived' : ''}>
                    <td>
                      <CommitText value={g.name} label="Holdets navn" onCommit={(v) => cleanErrors(onCommit(`Omdøb ${g.name}`, ops.updateGroup(data, g.id, { name: v })))} />
                    </td>
                    <td className="num">{used.groups.get(g.id) ?? 0}</td>
                    <td className="actions">
                      <Archive
                        archived={g.archived}
                        inUse={(used.groups.get(g.id) ?? 0) > 0}
                        name={g.name}
                        onArchive={(a) => onCommit(`${a ? 'Arkivér' : 'Genaktivér'} ${g.name}`, ops.updateGroup(data, g.id, { archived: a }))}
                        onDelete={() => onCommit(`Slet ${g.name}`, ops.removeGroup(data, g.id))}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <ArchivedToggle count={data.groups.filter((g) => g.archived).length} show={showArchived} onToggle={setShowArchived} />
          <AddRow placeholder="Nyt hold, fx Hold 10" button="Tilføj hold" onAdd={(v) => cleanErrors(onCommit(`Tilføj ${v}`, ops.addGroup(data, v).data))} />
        </>
      )}
      {tab === 'rooms' && (
        <>
          <p className="hint">Skemaet har otte kolonner. Skemadokumentet har ni rum (7 balletsale, K-salen og Motionsrum) – K-salen har ingen kolonne.</p>
          <table className="table">
            <tbody>
              {data.rooms.map((r, i) => (
                <tr key={r.id}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <CommitText value={r.name} label={`Navn på kolonne ${i + 1}`} onCommit={(v) => cleanErrors(onCommit(`Omdøb ${r.name}`, ops.updateRoom(data, r.id, { name: v })))} />
                  </td>
                  <td className="actions">
                    <button className="icon-btn" disabled={i === 0} onClick={() => onCommit(`Flyt ${r.name} til venstre`, ops.moveRoom(data, r.id, -1))} aria-label={`Flyt ${r.name} til venstre`}>
                      <Icon name="up" size={18} />
                    </button>
                    <button className="icon-btn" disabled={i === data.rooms.length - 1} onClick={() => onCommit(`Flyt ${r.name} til højre`, ops.moveRoom(data, r.id, 1))} aria-label={`Flyt ${r.name} til højre`}>
                      <Icon name="down" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Archive({ archived, inUse, name, onArchive, onDelete }: { archived: boolean; inUse: boolean; name: string; onArchive: (a: boolean) => void; onDelete: () => void }) {
  return (
    <>
      <button className="btn btn-quiet btn-sm" onClick={() => onArchive(!archived)}>
        {archived ? 'Genaktivér' : 'Arkivér'}
      </button>
      {!inUse && (
        <button className="icon-btn" onClick={onDelete} aria-label={`Slet ${name}`} title="Kan slettes, fordi den ikke bruges">
          <Icon name="trash" size={16} />
        </button>
      )}
    </>
  );
}

function ArchivedToggle({ count, show, onToggle }: { count: number; show: boolean; onToggle: (v: boolean) => void }) {
  if (!count) return null;
  return (
    <label className="check">
      <input type="checkbox" checked={show} onChange={(e) => onToggle(e.target.checked)} /> Vis arkiverede ({count})
    </label>
  );
}

// ---- 3. Arbejdstid, forberedelse og lørdagstillæg ---------------------------------------------
function WorkSection(p: SettingsProps) {
  const { data, onCommit } = p;
  const [tab, setTab] = useState<'rates' | 'annual' | 'detail'>(p.detailTeacherId ? 'detail' : 'rates');
  const [teacherId, setTeacherId] = useState<string>(p.detailTeacherId ?? [...data.teachers].sort((a, b) => a.initials.localeCompare(b.initials, 'da'))[0]?.id ?? '');
  const s = data.settings;
  const set = (patch: Partial<typeof s>, label: string) => cleanErrors(onCommit(label, ops.updateSettings(data, patch)));
  return (
    <div className="section-body">
      <Segmented
        label="Arbejdstid"
        value={tab}
        onChange={setTab}
        options={[
          ['rates', 'Satser'],
          ['annual', 'Årsarbejdstid'],
          ['detail', 'Opgørelse pr. lærer'],
        ]}
      />
      {tab === 'rates' && (
        <>
          <p className="hint">Skolens egne beregningsregler. Et tomt felt betyder, at oplysningen mangler – det regnes ikke som 0.</p>
          <Row label="Forberedelse" help={s.prepPercent === null ? 'Mangler' : `= ${formatNumber(prepMinutesPerHour(s.prepPercent))} min pr. 60 min undervisning`}>
            <CommitNumber value={s.prepPercent} label="Forberedelse i procent" suffix="%" onCommit={(v) => set({ prepPercent: v }, 'Ændr forberedelse')} />
          </Row>
          <Row label="Lørdagstillæg" help="Procent af den faktiske undervisningstid om lørdagen">
            <CommitNumber value={s.saturdayPercent} label="Lørdagstillæg i procent" suffix="%" onCommit={(v) => set({ saturdayPercent: v }, 'Ændr lørdagstillæg')} />
          </Row>
          <Row label="Forberedelse beregnes af" help="De to regler giver forskellige tal for lørdagsundervisning.">
            <div className="radio-list">
              <label className="check">
                <input type="radio" name="basis" checked={s.prepBasis === 'actual'} onChange={() => set({ prepBasis: 'actual' }, 'Forberedelse af faktisk undervisning')} />
                <span>Faktisk undervisningstid (standard)</span>
              </label>
              <label className="check">
                <input type="radio" name="basis" checked={s.prepBasis === 'withSaturday'} onChange={() => set({ prepBasis: 'withSaturday' }, 'Forberedelse inkl. lørdagstillæg')} />
                <span>Undervisning inkl. lørdagstillæg</span>
              </label>
            </div>
          </Row>
          <Row label="Undervisningsuger" help="Antal uger i skoleåret, hvor grundugen gentages">
            <CommitNumber value={s.teachingWeeks} label="Antal undervisningsuger" suffix="uger" onCommit={(v) => set({ teachingWeeks: v }, 'Ændr undervisningsuger')} />
          </Row>
          <Row label="Morgensamling" help="Indstilles under Tidsregler og morgensamling">
            <span>
              {s.assembly.prepMode === 'same' ? 'Samme forberedelse som klasser' : s.assembly.prepMode === 'none' ? 'Ingen forberedelse' : `Egen sats: ${s.assembly.prepPercent ?? 'mangler'} %`}
            </span>
          </Row>
          <div className="formula">
            <div className="label">Sådan regnes der pr. lærer og dag</div>
            <code>Undervisning U = klassernes faktiske varighed (to lærere får begge hele tiden)</code>
            <code>Lørdagstillæg L = U × {s.saturdayPercent ?? 's'} % om lørdagen, ellers 0</code>
            <code>Forberedelse F = {s.prepBasis === 'actual' ? 'U' : '(U + L)'} × {s.prepPercent ?? 'p'} %</code>
            <code>I alt K = U + F + L · Planlagt år = K × uger · Rest = årsarbejdstid − planlagt</code>
          </div>
        </>
      )}
      {tab === 'annual' && <AnnualTable {...p} />}
      {tab === 'detail' && (
        <>
          <label className="field field-inline">
            <span>Lærer</span>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              {[...data.teachers]
                .sort((a, b) => a.initials.localeCompare(b.initials, 'da'))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.initials}
                    {t.name ? ` – ${t.name}` : ''}
                  </option>
                ))}
            </select>
          </label>
          {teacherId && data.teachers.some((t) => t.id === teacherId) && <TeacherDetail data={data} sum={computeTeacherSummary(data, teacherId)} />}
        </>
      )}
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function AnnualTable({ data, onCommit }: SettingsProps) {
  return (
    <>
      <p className="hint">
        Planlagt årstid = ugens samlede tid × {data.settings.teachingWeeks ?? 'antal uger'}. Beregningen forudsætter samme grunduge i alle
        undervisningsuger; møder, forestillinger og øvrige opgaver er ikke indregnet.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Lærer</th>
            <th>Årsarbejdstimer</th>
            <th>Planlagt</th>
            <th>Rest</th>
          </tr>
        </thead>
        <tbody>
          {[...data.teachers]
            .filter((t) => !t.archived)
            .sort((a, b) => a.initials.localeCompare(b.initials, 'da'))
            .map((t) => {
              const a = computeTeacherSummary(data, t.id).annual;
              return (
                <tr key={t.id}>
                  <th scope="row">
                    <TeacherChip teacher={t} />
                  </th>
                  <td>
                    <CommitNumber value={t.annualHours} label={`Årsarbejdstimer for ${t.initials}`} suffix="t" onCommit={(v) => cleanErrors(onCommit(`Årstimer for ${t.initials}`, ops.updateTeacher(data, t.id, { annualHours: v })))} />
                  </td>
                  <td className="num tabular">{a.plannedHours === null ? <span className="missing">mangler</span> : formatHours(round2(a.plannedHours))}</td>
                  <td className={`num tabular${a.remainingHours !== null && a.remainingHours < 0 ? ' neg' : ''}`}>
                    {a.remainingHours === null ? <span className="missing">mangler</span> : a.remainingHours < 0 ? `${formatHours(round2(-a.remainingHours))} for meget` : formatHours(round2(a.remainingHours))}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </>
  );
}

function TeacherDetail({ data, sum }: { data: AppData; sum: TeacherSummary }) {
  const [unit, setUnit] = useState<'hm' | 'dec'>('hm');
  const fmt = (m: number | null) => (unit === 'dec' ? formatDecimalHours(m) : formatDuration(m));
  const a = sum.annual;
  const missing = sum.missing.filter((m) => m !== 'saturdayPercent' || sum.week.L === null);
  return (
    <div className="detail">
      <div className="detail-top">
        <Segmented
          label="Tidsformat"
          value={unit}
          onChange={setUnit}
          options={[
            ['hm', 't og min'],
            ['dec', 'decimal'],
          ]}
        />
      </div>
      <div className="stat-grid">
        <Stat label="Undervisning (U)" v={fmt(sum.week.U)} />
        <Stat label="Forberedelse (F)" v={fmt(sum.week.F)} />
        <Stat label="Undervisning + forberedelse" v={fmt(sum.week.UF)} />
        <Stat label="Lørdagstillæg (L)" v={fmt(sum.week.L)} />
        <Stat label="I alt pr. uge (K)" v={fmt(sum.week.K)} strong />
      </div>
      <div className="stat-grid">
        <Stat label="Årsarbejdstimer" v={a.expectedHours === null ? 'mangler' : formatHours(a.expectedHours)} />
        <Stat label="Planlagt fra grundugen" v={a.plannedHours === null ? 'mangler' : formatHours(round2(a.plannedHours))} />
        <Stat
          label={a.remainingHours !== null && a.remainingHours < 0 ? 'Overplanlagt' : 'Resterende årstimer'}
          v={a.remainingHours === null ? 'mangler' : formatHours(round2(Math.abs(a.remainingHours)))}
          strong
          neg={a.remainingHours !== null && a.remainingHours < 0}
        />
      </div>
      {missing.length > 0 && <p className="hint hint-warn">Mangler: {missing.map((m) => MISSING_LABELS[m]).join(', ')}.</p>}
      {sum.assembly && <p className="hint">Morgensamlingen ({sum.assembly.minutes} min) indgår om fredagen.</p>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Dag</th>
              <th>U</th>
              <th>F</th>
              <th>L</th>
              <th>K</th>
            </tr>
          </thead>
          <tbody>
            {sum.days.map((d, i) => (
              <tr key={i} className={d.U === 0 ? 'zero' : ''}>
                <th scope="row">{DAY_SHORT[i]}</th>
                <td className="num tabular">{fmt(d.U)}</td>
                <td className="num tabular">{fmt(d.F)}</td>
                <td className="num tabular">{fmt(d.L)}</td>
                <td className="num tabular strong">{fmt(d.K)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="two-col">
        <div>
          <h4 className="label">Pr. titel</h4>
          <ul className="kv">
            {sum.byTitle.map((r) => (
              <li key={r.id}>
                <span>{r.id}</span>
                <span className="tabular">{fmt(r.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="label">Pr. hold</h4>
          <ul className="kv">
            {sum.byGroup.map((r) => (
              <li key={r.id}>
                <span>{groupsLabel(r.id.split('+'), data.groups)}</span>
                <span className="tabular">{fmt(r.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h4 className="label">Klasser</h4>
      <ul className="kv">
        {sum.blocksByDay.flatMap((list, d) =>
          list.map((b) => (
            <li key={b.id}>
              <span>
                {DAY_SHORT[d]} <span className="tabular">{formatRange(b.start, b.end)}</span> · {b.title} · {groupsLabel(b.groupIds, data.groups)}
                {b.timeMode === 'custom' && ' · egne tider'}
              </span>
              <span className="tabular">{fmt(b.end - b.start)}</span>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

function Stat({ label, v, strong, neg }: { label: string; v: string; strong?: boolean; neg?: boolean }) {
  return (
    <div className={`stat${strong ? ' stat-strong' : ''}${neg ? ' neg' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value tabular">{v}</span>
    </div>
  );
}

// ---- 4. Øvrige værktøjer ---------------------------------------------------------------------
function ToolsSection(p: SettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { pairs } = allConflicts(p.data);
  const empty = !p.data.blocks.length && !p.data.teachers.length;
  return (
    <div className="section-body">
      <Tool title="Fortryd og gentag" help="Også med Ctrl/⌘+Z og Ctrl/⌘+Shift+Z.">
        <div className="inline">
          <button className="btn" onClick={p.undo.onUndo} disabled={!p.undo.undoLabel}>
            <Icon name="undo" size={16} /> Fortryd{p.undo.undoLabel ? `: ${p.undo.undoLabel}` : ''}
          </button>
          <button className="btn" onClick={p.undo.onRedo} disabled={!p.undo.redoLabel}>
            <Icon name="redo" size={16} /> Gentag{p.undo.redoLabel ? `: ${p.undo.redoLabel}` : ''}
          </button>
        </div>
      </Tool>
      <Tool title={`Konflikter (${pairs.length})`} help="Overlap i samme sal, for samme lærer eller samme hold. Konfliktklasser tæller med i timerne.">
        {pairs.length === 0 ? (
          <p className="hint">Ingen konflikter.</p>
        ) : (
          <ul className="conflicts">
            {pairs.map((c) => {
              const { resources } = describeConflict(c, p.data);
              const ids = [c.blockId, c.otherId];
              return (
                <li key={ids.join()}>
                  <span className="label">
                    {DAY_NAMES[(p.data.blocks.find((b) => b.id === c.blockId) ?? p.data.blocks.find((b) => b.id === c.otherId))?.day ?? p.data.settings.assembly.day]} · fælles:{' '}
                    {resources.join(', ')}
                  </span>
                  {ids.map((id) => {
                    const b = p.data.blocks.find((x) => x.id === id);
                    return b ? (
                      <button key={id} className="conflict-item" onClick={() => p.onShowBlock(b)}>
                        <span className="tabular">{formatRange(b.start, b.end)}</span> {slotTitle(id, p.data)} · {p.data.rooms.find((r) => r.id === b.roomId)?.name}
                      </button>
                    ) : (
                      <span key={id} className="conflict-item">
                        {id === ASSEMBLY_ID ? `${formatRange(p.data.settings.assembly.start, p.data.settings.assembly.end)} Morgensamlingen` : slotTitle(id, p.data)}
                      </span>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        )}
      </Tool>
      <Tool title="Læsevisning" help="Skemaet uden timer og indstillinger – til dansere og undervisere.">
        <a className="btn" href={STANDALONE ? '#vis' : '/'} target={STANDALONE ? undefined : '_blank'} rel="noreferrer">
          <Icon name="eye" size={16} /> Åbn læsevisning
        </a>
      </Tool>
      <Tool title="Backup" help="Alle data som én fil. En import kontrolleres først og viser, hvad der erstattes.">
        <div className="inline">
          {STANDALONE ? (
            <span className="hint">Download virker ikke i prøveversionen.</span>
          ) : (
            <a className="btn" href="/api/export" download>
              <Icon name="download" size={16} /> Download backup
            </a>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onImportFile(f);
              e.target.value = '';
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Importér backup…
          </button>
        </div>
      </Tool>
      <Tool title="Tidligere versioner" help="Hver gemning er en version. En gendannelse kan fortrydes.">
        <Revisions onRestore={p.onRestoreRevision} currentVersion={p.currentVersion} />
      </Tool>
      {(p.demoMode || empty) && (
        <Tool title="Eksempeldata" help={p.demoMode ? 'Demotilstand: nulstil til skemadokumentets uge med eksempelsatser.' : 'Kun i et tomt skema, så rigtige data aldrig overskrives.'}>
          <button className="btn" onClick={p.onLoadDemo}>
            {p.demoMode ? 'Nulstil til eksempeldata' : 'Indlæs eksempeldata'}
          </button>
        </Tool>
      )}
      <Tool title="Tastatur">
        <button className="btn" onClick={p.onShowHelp}>
          <Icon name="keyboard" size={16} /> Vis tastaturgenveje
        </button>
      </Tool>
      {!STANDALONE && (
        <Tool title="Log ud">
          <button className="btn" onClick={p.onLogout}>
            <Icon name="logout" size={16} /> Log ud
          </button>
        </Tool>
      )}
    </div>
  );
}

function Tool({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="tool">
      <h4 className="tool-title">{title}</h4>
      {help && <p className="hint">{help}</p>}
      {children}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = { edit: 'Redigering', import: 'Import', demo: 'Eksempeldata', init: 'Oprettet', migration: 'Opdateret datamodel' };

function Revisions({ onRestore, currentVersion }: { onRestore: (v: number) => void; currentVersion: number }) {
  const [list, setList] = useState<RevisionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    api.revisions().then(setList, (e) => setError((e as Error).message));
  }, [currentVersion]);
  if (error) return <p className="error-text">Kunne ikke hente versioner: {error}</p>;
  if (!list) return <p className="hint">Henter versioner…</p>;
  return (
    <>
      <ul className="revisions">
        {(all ? list : list.slice(0, 6)).map((r) => (
          <li key={r.version}>
            <span>
              <strong>Version {r.version}</strong> · {new Date(r.createdAt).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' })} · {SOURCE_LABELS[r.source] ?? r.source} · {r.blocks} klasser
            </span>
            {r.version === currentVersion ? (
              <span className="hint">Nuværende</span>
            ) : (
              <button className="btn btn-sm" onClick={() => onRestore(r.version)}>
                Gendan
              </button>
            )}
          </li>
        ))}
      </ul>
      {list.length > 6 && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? 'Vis færre' : `Vis alle ${list.length}`}
        </button>
      )}
    </>
  );
}

