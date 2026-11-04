// Panelet bag tandhjulet: fire afsnit, ét åbent ad gangen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MISSING_LABELS, computeTeacherSummary, prepMinutesPerHour, prepPercentFromMinutes, type TeacherSummary } from '../../shared/calc';
import { allConflicts, describeConflict, slotTitle, ASSEMBLY_ID } from '../../shared/conflicts';
import { DAY_NAMES, DAY_SHORT, SCHOOL_RULES_26_27, type AppData, type Block } from '../../shared/schema';
import { formatDuration, formatNumber, formatRange } from '../../shared/time';
import { usage } from '../../shared/validate';
import { api, STANDALONE, type RevisionInfo } from './api';
import { AddRow, ColorPicker, CommitNumber, CommitText, Row, Segmented, cleanErrors } from './fields';
import { groupsLabel } from './Grid';
import * as ops from './ops';
import { QUESTIONS, teachersMissingContract } from './questions';

function questionsDesc(data: AppData) {
  const q = QUESTIONS.filter((x) => !data.settings.answers[x.id]).length;
  const t = teachersMissingContract(data).length;
  const parts = [q ? `${q} spørgsmål venter på svar` : '', t ? `${t} ${t === 1 ? 'lærer mangler' : 'lærere mangler'} kontrakttimer` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Alt er besvaret';
}
import { QuestionsSection } from './SettingsQuestions';
import { RulesSection, type RulesProps } from './SettingsRules';
import { Icon, TeacherChip, useEscape } from './ui';

export type SectionId = 'questions' | 'people' | 'rules' | 'work' | 'tools';

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
  { id: 'questions', title: 'Spørgsmål', desc: '' },
  { id: 'people', title: 'Lærere og hold', desc: 'Lærere, farver, hold og salenes navne' },
  { id: 'rules', title: 'Tidsregler og morgensamling', desc: 'Tider fra skemadokumentet og fredagens morgensamling' },
  { id: 'work', title: 'Arbejdstid, forberedelse og lørdagstillæg', desc: 'Satser, kontrakt, timebank og opgørelse pr. lærer' },
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
                    <span className="section-desc">
                      {s.id === 'questions' ? questionsDesc(p.data) : s.desc}
                    </span>
                  </span>
                  <Icon name="chevronDown" size={20} className="chev" />
                </button>
                {open && (
                  <>
                    {s.id === 'questions' && <QuestionsSection data={p.data} onCommit={p.onCommit} />}
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
  const [tab, setTab] = useState<'rates' | 'contract' | 'detail'>(p.detailTeacherId ? 'detail' : 'rates');
  const [teacherId, setTeacherId] = useState<string>(p.detailTeacherId ?? [...data.teachers].sort((a, b) => a.initials.localeCompare(b.initials, 'da'))[0]?.id ?? '');
  const s = data.settings;
  const set = (patch: Partial<typeof s>, label: string) => cleanErrors(onCommit(label, ops.updateSettings(data, patch)));
  const minPerHour = s.prepPercent === null ? null : Math.round(prepMinutesPerHour(s.prepPercent) * 10000) / 10000;
  const isSchool = (Object.keys(SCHOOL_RULES_26_27) as (keyof typeof SCHOOL_RULES_26_27)[]).every((k) =>
    k === 'prepPercent' ? s.prepPercent !== null && Math.abs(s.prepPercent - SCHOOL_RULES_26_27.prepPercent) < 1e-9 : s[k] === SCHOOL_RULES_26_27[k],
  );
  return (
    <div className="section-body">
      <Segmented
        label="Arbejdstid"
        value={tab}
        onChange={setTab}
        options={[
          ['rates', 'Satser'],
          ['contract', 'Kontrakt og timebank'],
          ['detail', 'Opgørelse pr. lærer'],
        ]}
      />
      {tab === 'rates' && (
        <>
          <div className={`notice ${isSchool ? '' : 'notice-warn'}`}>
            {isSchool ? (
              <>Satserne følger skolens timeopgørelse for sæson 26/27 (Fernando_Mora_timer_26_27).</>
            ) : (
              <>
                Satserne afviger fra skolens timeopgørelse 26/27.{' '}
                <button className="link-btn" onClick={() => set({ ...SCHOOL_RULES_26_27 }, 'Brug skolens regler 26/27')}>
                  Brug skolens regler
                </button>
              </>
            )}
          </div>
          <Row label="Forberedelse" help={s.prepPercent === null ? 'Mangler' : `pr. undervisningstime (= ${formatNumber(s.prepPercent)} %)`}>
            <CommitNumber
              value={minPerHour}
              label="Forberedelse i minutter pr. undervisningstime"
              suffix="min pr. time"
              onCommit={(v) => set({ prepPercent: v === null ? null : prepPercentFromMinutes(v) }, 'Ændr forberedelse')}
            />
          </Row>
          <Row label="Lørdagstillæg" help={s.saturdayPercent === null ? 'Mangler' : `Lørdagstimer tæller × ${formatNumber(1 + s.saturdayPercent / 100)}`}>
            <CommitNumber value={s.saturdayPercent} label="Lørdagstillæg i procent" suffix="%" onCommit={(v) => set({ saturdayPercent: v }, 'Ændr lørdagstillæg')} />
          </Row>
          <Row label="Forberedelse til lørdage" help="Timeopgørelsen beregner forberedelsen af lørdagstiden inkl. tillæg.">
            <div className="radio-list">
              <label className="check">
                <input type="radio" name="basis" checked={s.prepBasis === 'withSaturday'} onChange={() => set({ prepBasis: 'withSaturday' }, 'Forberedelse af lørdagstid inkl. tillæg')} />
                <span>Af lørdagstiden inkl. tillæg (som timeopgørelsen)</span>
              </label>
              <label className="check">
                <input type="radio" name="basis" checked={s.prepBasis === 'actual'} onChange={() => set({ prepBasis: 'actual' }, 'Forberedelse af faktisk lørdagstid')} />
                <span>Af den faktiske lørdagstid</span>
              </label>
            </div>
          </Row>
          <Row label="Undervisningsuger" help="Uger i sæsonen; lørdagene fordeles på dem">
            <CommitNumber value={s.teachingWeeks} label="Antal undervisningsuger" suffix="uger" onCommit={(v) => set({ teachingWeeks: v }, 'Ændr undervisningsuger')} />
          </Row>
          <Row label="Lørdage pr. sæson" help="Antal lørdage med undervisning (kan sættes pr. lærer)">
            <CommitNumber value={s.saturdaysPerSeason} label="Antal lørdage pr. sæson" suffix="lørdage" onCommit={(v) => set({ saturdaysPerSeason: v }, 'Ændr antal lørdage')} />
          </Row>
          <Row label="Orientering og mails" help="Trækkes fra kontrakten pr. uge (kan sættes pr. lærer)">
            <CommitNumber value={s.orientationHours} label="Orientering pr. uge i timer" suffix="t pr. uge" onCommit={(v) => set({ orientationHours: v }, 'Ændr tid til orientering')} />
          </Row>
          <Row label="Afrunding" help="De to måder kan give et par minutters forskel pr. uge.">
            <div className="radio-list">
              <label className="check">
                <input type="radio" name="rounding" checked={s.rounding === 'steps'} onChange={() => set({ rounding: 'steps' }, 'Afrund som timeopgørelsen')} />
                <span>Hele minutter i hvert trin (som timeopgørelsen)</span>
              </label>
              <label className="check">
                <input type="radio" name="rounding" checked={s.rounding === 'exact'} onChange={() => set({ rounding: 'exact' }, 'Regn præcist')} />
                <span>Præcist – afrund kun det viste resultat</span>
              </label>
            </div>
          </Row>
          <Row label="Morgensamling" help="Indstilles under Tidsregler og morgensamling">
            <span>
              {s.assembly.prepMode === 'same' ? 'Samme forberedelse som klasser' : s.assembly.prepMode === 'none' ? 'Ingen forberedelse' : `Egen sats: ${s.assembly.prepPercent ?? 'mangler'} %`}
            </span>
          </Row>
          <div className="formula">
            <div className="label">Sådan regnes der pr. lærer</div>
            <code>Undervisning ma–fre: klassernes faktiske tid (to lærere får begge hele tiden)</code>
            <code>Forberedelse: {minPerHour ?? 'x'} min pr. undervisningstime</code>
            <code>
              Lørdag: tid × {s.saturdayPercent === null ? '(1 + tillæg)' : formatNumber(1 + s.saturdayPercent / 100)} × {s.saturdaysPerSeason ?? 'antal'} lørdage ÷{' '}
              {s.teachingWeeks ?? 'uger'} uger
            </code>
            <code>Timebank pr. uge = kontrakt − {s.orientationHours ?? 'orientering'} t − undervisning − forberedelse − lørdage</code>
          </div>
        </>
      )}
      {tab === 'contract' && <ContractTable {...p} />}
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

const fmtH = (min: number | null) => (min === null ? 'mangler' : formatDuration(min));

function ContractTable({ data, onCommit }: SettingsProps) {
  const s = data.settings;
  return (
    <>
      <p className="hint">
        Kontrakttimer pr. uge fra den enkelte lærers kontrakt. Orientering og lørdage kan sættes pr. lærer; tomt felt = skolens fælles værdi (
        {s.orientationHours ?? '?'} t, {s.saturdaysPerSeason ?? '?'} lørdage). Timebanken er den del af kontrakten, der ikke går til undervisning
        og forberedelse. Aflyst undervisning er ikke indregnet.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Lærer</th>
              <th>Kontrakt pr. uge</th>
              <th>Orientering</th>
              <th>Lørdage</th>
              <th>I alt pr. uge</th>
              <th>Timebank pr. uge</th>
              <th>Timebank sæson</th>
            </tr>
          </thead>
          <tbody>
            {[...data.teachers]
              .filter((t) => !t.archived)
              .sort((a, b) => a.initials.localeCompare(b.initials, 'da'))
              .map((t) => {
                const sum = computeTeacherSummary(data, t.id);
                const upd = (patch: Partial<typeof t>, label: string) => cleanErrors(onCommit(label, ops.updateTeacher(data, t.id, patch)));
                return (
                  <tr key={t.id}>
                    <th scope="row">
                      <TeacherChip teacher={t} />
                    </th>
                    <td>
                      <CommitNumber value={t.contractHours} label={`Kontrakttimer for ${t.initials}`} suffix="t" onCommit={(v) => upd({ contractHours: v }, `Kontrakt for ${t.initials}`)} />
                    </td>
                    <td>
                      <CommitNumber value={t.orientationHours} label={`Orientering for ${t.initials}`} suffix="t" placeholder="fælles" onCommit={(v) => upd({ orientationHours: v }, `Orientering for ${t.initials}`)} />
                    </td>
                    <td>
                      <CommitNumber value={t.saturdays} label={`Lørdage for ${t.initials}`} placeholder="fælles" onCommit={(v) => upd({ saturdays: v }, `Lørdage for ${t.initials}`)} />
                    </td>
                    <td className="num tabular">{fmtH(sum.week.K)}</td>
                    <td className={`num tabular${sum.timebank.week !== null && sum.timebank.week < 0 ? ' neg' : ''}`}>{fmtH(sum.timebank.week)}</td>
                    <td className={`num tabular${sum.timebank.season !== null && sum.timebank.season < 0 ? ' neg' : ''}`}>{fmtH(sum.timebank.season)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Opgørelse pr. lærer i samme opstilling som skolens timeopgørelse. */
function TeacherDetail({ data, sum }: { data: AppData; sum: TeacherSummary }) {
  const st = data.settings;
  const minPerHour = st.prepPercent === null ? null : prepMinutesPerHour(st.prepPercent);
  const weekdayByGroup = new Map<string, number>();
  sum.blocksByDay.slice(0, 5).forEach((list) => list.forEach((b) => weekdayByGroup.set(b.groupIds.join('+'), (weekdayByGroup.get(b.groupIds.join('+')) ?? 0) + b.end - b.start)));
  const satByGroup = new Map<string, number>();
  sum.blocksByDay[5].forEach((b) => satByGroup.set(b.groupIds.join('+'), (satByGroup.get(b.groupIds.join('+')) ?? 0) + b.end - b.start));
  const factor = st.saturdayPercent === null ? null : 1 + st.saturdayPercent / 100;
  const missing = sum.missing;
  return (
    <div className="detail">
      <table className="table calc-table">
        <tbody>
          <tr className="calc-group">
            <th scope="row">Undervisning ma–fre</th>
            <td className="num tabular strong">{formatDuration(sum.week.weekdayU)}</td>
          </tr>
          {[...weekdayByGroup].map(([g, m]) => (
            <tr key={g} className="calc-sub">
              <th scope="row">{groupsLabel(g.split('+'), data.groups)}</th>
              <td className="num tabular">{formatDuration(m)}</td>
            </tr>
          ))}
          {sum.assembly && (
            <tr className="calc-sub">
              <th scope="row">Morgensamling (fredag)</th>
              <td className="num tabular">{formatDuration(sum.assembly.minutes)}</td>
            </tr>
          )}
          <tr className="calc-group">
            <th scope="row">Forberedelse ma–fre {minPerHour !== null && <span className="hint">({formatNumber(minPerHour)} min pr. time)</span>}</th>
            <td className="num tabular strong">{fmtH(sum.week.weekdayF)}</td>
          </tr>
          {sum.saturday.U > 0 && (
            <>
              <tr className="calc-group">
                <th scope="row">Lørdage</th>
                <td className="num tabular strong">{fmtH(sum.week.saturday)} pr. uge</td>
              </tr>
              {[...satByGroup].map(([g, m]) => (
                <tr key={g} className="calc-sub">
                  <th scope="row">{groupsLabel(g.split('+'), data.groups)}</th>
                  <td className="num tabular">{formatDuration(m)}</td>
                </tr>
              ))}
              <tr className="calc-sub">
                <th scope="row">Pr. lørdag {factor !== null && `(${formatDuration(sum.saturday.U)} × ${formatNumber(factor)})`}</th>
                <td className="num tabular">{fmtH(sum.saturday.counted)}</td>
              </tr>
              <tr className="calc-sub">
                <th scope="row">Pr. sæson ({sum.saturdays ?? '?'} lørdage)</th>
                <td className="num tabular">{fmtH(sum.seasonSaturday.counted)}</td>
              </tr>
              <tr className="calc-group">
                <th scope="row">Forberedelse lørdage</th>
                <td className="num tabular strong">{fmtH(sum.week.saturdayF)} pr. uge</td>
              </tr>
              <tr className="calc-sub">
                <th scope="row">Pr. lørdag · pr. sæson</th>
                <td className="num tabular">
                  {fmtH(sum.saturday.F)} · {fmtH(sum.seasonSaturday.F)}
                </td>
              </tr>
            </>
          )}
          <tr className="calc-total">
            <th scope="row">I alt pr. uge</th>
            <td className="num tabular">{fmtH(sum.week.K)}</td>
          </tr>
          <tr className="calc-sub">
            <th scope="row">
              Kontrakt {sum.contract.hours ?? '?'} t − orientering {sum.contract.orientation ?? '?'} t = til rådighed
            </th>
            <td className="num tabular">{fmtH(sum.contract.available)}</td>
          </tr>
          <tr className="calc-total">
            <th scope="row">Timebank pr. uge</th>
            <td className={`num tabular${sum.timebank.week !== null && sum.timebank.week < 0 ? ' neg' : ''}`}>{fmtH(sum.timebank.week)}</td>
          </tr>
          <tr className="calc-total">
            <th scope="row">Timebank pr. sæson ({sum.annual.weeks ?? '?'} uger)</th>
            <td className={`num tabular${sum.timebank.season !== null && sum.timebank.season < 0 ? ' neg' : ''}`}>{fmtH(sum.timebank.season)}</td>
          </tr>
        </tbody>
      </table>
      {missing.length > 0 && <p className="hint hint-warn">Mangler: {missing.map((m) => MISSING_LABELS[m]).join(', ')}.</p>}
      <p className="hint">
        {st.rounding === 'steps' ? 'Afrundet til hele minutter i hvert trin som timeopgørelsen.' : 'Regnet præcist; kun det viste er afrundet.'} Aflyst undervisning,
        møder og forestillinger er ikke indregnet.
      </p>
      <h4 className="label">Klasser</h4>
      <ul className="kv">
        {sum.blocksByDay.flatMap((list, d) =>
          list.map((b) => (
            <li key={b.id}>
              <span>
                {DAY_SHORT[d]} <span className="tabular">{formatRange(b.start, b.end)}</span> · {b.title} · {groupsLabel(b.groupIds, data.groups)}
                {b.timeMode === 'custom' && ' · egne tider'}
                {b.noPrep && ' · uden forberedelse'}
              </span>
              <span className="tabular">{formatDuration(b.end - b.start)}</span>
            </li>
          )),
        )}
      </ul>
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

