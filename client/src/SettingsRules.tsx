// Indstillinger → Tidsregler og morgensamling: redigerbar tidstabel, dækning, morgensamling og kilde.
import { useMemo, useState } from 'react';
import { assemblyPrepPercent } from '../../shared/calc';
import { coverage, ruleUsage } from '../../shared/rules';
import { DAY_NAMES, DAY_SHORT, PERIOD_NAMES, type AppData, type TimeRule } from '../../shared/schema';
import { SOURCE, SOURCE_ISSUES, SOURCE_NAME } from '../../shared/source/index';
import { formatNumber, formatRange, parseClock } from '../../shared/time';
import { CommitClock, CommitNumber, CommitText, Row, Segmented, cleanErrors } from './fields';
import { groupsLabel } from './Grid';
import * as ops from './ops';
import { Icon, TeacherChip } from './ui';

export interface RulesProps {
  data: AppData;
  onCommit: (label: string, next: AppData) => string[] | null;
  /** Ændring af tidstabellen: genberegner berørte klasser og spørger ved nye konflikter. */
  onRules: (label: string, result: ReturnType<typeof ops.updateRules>) => string[] | null;
  onLoadSourceWeek: () => void;
  onReloadSourceRules: () => void;
}

type Tab = 'rules' | 'coverage' | 'assembly' | 'source';

export function RulesSection(p: RulesProps) {
  const [tab, setTab] = useState<Tab>('rules');
  return (
    <div className="section-body">
      <Segmented<Tab>
        label="Tidsregler"
        value={tab}
        onChange={setTab}
        options={[
          ['rules', 'Tidsregler'],
          ['coverage', 'Dækning'],
          ['assembly', 'Morgensamling'],
          ['source', 'Kilde'],
        ]}
      />
      {tab === 'rules' && <RuleTable {...p} />}
      {tab === 'coverage' && <Coverage data={p.data} />}
      {tab === 'assembly' && <AssemblySettings {...p} />}
      {tab === 'source' && <SourceInfo {...p} />}
    </div>
  );
}

function RuleTable({ data, onRules }: RulesProps) {
  const [groupFilter, setGroupFilter] = useState('');
  const usageMap = useMemo(() => ruleUsage(data), [data]);
  const rules = data.timeRules.filter((r) => !groupFilter || r.groupIds.includes(groupFilter));
  const byDay = DAY_NAMES.map((_, d) => rules.filter((r) => r.day === d));
  return (
    <div>
      <p className="hint">
        En almindelig klasse får sin tid herfra ud fra hold, ugedag og dagdel. Ændrer du et tidsrum, opdateres alle klasser, der bruger det –
        klasser med egne tider røres ikke. Mangler en regel, kan klassen få egne tider.
      </p>
      <label className="field field-inline">
        <span>Vis hold</span>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">Alle hold</option>
          {data.groups
            .filter((g) => !g.archived)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </label>
      {byDay.map((list, day) =>
        list.length ? (
          <div key={day} className="rule-day">
            <h4 className="label">{DAY_NAMES[day]}</h4>
            <table className="table rule-table">
              <thead>
                <tr>
                  <th>Dagdel</th>
                  <th>Hold</th>
                  <th>Start</th>
                  <th>Slut</th>
                  <th>Variant</th>
                  <th>Kilde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <RuleRow key={r.id} rule={r} data={data} used={usageMap.get(r.id) ?? 0} onRules={onRules} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null,
      )}
      {!rules.length && <p className="hint">Ingen tidsregler for det valgte hold.</p>}
      <AddRule data={data} onRules={onRules} />
    </div>
  );
}

function RuleRow({ rule, data, used, onRules }: { rule: TimeRule; data: AppData; used: number; onRules: RulesProps['onRules'] }) {
  const groups = groupsLabel(rule.groupIds, data.groups);
  const where = `${groups} ${DAY_SHORT[rule.day].toLowerCase()} ${PERIOD_NAMES[rule.period].toLowerCase()}`;
  const change = (patch: Partial<TimeRule>, what: string) => {
    const next = { ...rule, ...patch };
    if (next.end <= next.start) return ['Sluttid skal ligge efter starttid'];
    return cleanErrors(onRules(`${what}: ${where}`, ops.updateRule(data, rule.id, patch)));
  };
  return (
    <tr>
      <td>{PERIOD_NAMES[rule.period]}</td>
      <td>{groups}</td>
      <td>
        <CommitClock value={rule.start} label={`Start for ${where}`} onCommit={(m) => change({ start: m }, 'Ændr starttid')} />
      </td>
      <td>
        <CommitClock value={rule.end} label={`Slut for ${where}`} onCommit={(m) => change({ end: m }, 'Ændr sluttid')} />
      </td>
      <td>
        <CommitText value={rule.label} label={`Variant for ${where}`} placeholder="—" onCommit={(v) => change({ label: v }, 'Ændr variant')} />
      </td>
      <td className="source-ref" title={rule.note || undefined}>
        {rule.source || 'Manuel'}
        {rule.note && <Icon name="info" size={13} className="muted-icon" title={rule.note} />}
      </td>
      <td className="actions">
        {used ? (
          <span className="hint" title="Tidsregler i brug kan ikke slettes. Flyt eller ret klasserne først.">
            {used} {used === 1 ? 'klasse' : 'klasser'}
          </span>
        ) : (
          <button className="icon-btn" aria-label={`Slet tidsregel ${where}`} onClick={() => onRules(`Slet tidsregel: ${where}`, ops.removeRule(data, rule.id))}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </td>
    </tr>
  );
}

function AddRule({ data, onRules }: { data: AppData; onRules: RulesProps['onRules'] }) {
  const [open, setOpen] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [day, setDay] = useState(0);
  const [period, setPeriod] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Tilføj tidsregel
      </button>
    );
  const submit = () => {
    const s = parseClock(start);
    const e = parseClock(end);
    if (!groupIds.length) return setErr('Vælg mindst ét hold');
    if (s === null || e === null) return setErr('Skriv start og slut, fx 9.10 og 9.55');
    if (e <= s) return setErr('Sluttid skal ligge efter starttid');
    const errors = onRules(`Tilføj tidsregel`, ops.addRule(data, { groupIds, day, period, start: s, end: e, label: label.trim(), note: '', source: 'Manuel' }));
    if (errors) return setErr(cleanErrors(errors)![0]);
    setOpen(false);
    setGroupIds([]);
    setStart('');
    setEnd('');
    setLabel('');
    setErr(null);
  };
  return (
    <div className="card add-rule">
      <h4 className="label">Ny tidsregel</h4>
      <div className="chip-picker">
        {data.groups
          .filter((g) => !g.archived)
          .map((g) => {
            const on = groupIds.includes(g.id);
            return (
              <button key={g.id} type="button" className={`pick${on ? ' pick-on' : ''}`} aria-pressed={on} onClick={() => setGroupIds(on ? groupIds.filter((x) => x !== g.id) : [...groupIds, g.id])}>
                {g.name}
              </button>
            );
          })}
      </div>
      <div className="field-row">
        <label className="field">
          <span>Dag</span>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dagdel</span>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            {PERIOD_NAMES.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-time">
          <span>Start</span>
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="9.10" inputMode="numeric" />
        </label>
        <label className="field field-time">
          <span>Slut</span>
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="9.55" inputMode="numeric" />
        </label>
      </div>
      <label className="field">
        <span>Variant (valgfri)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="fx Fysisk" />
      </label>
      {err && <p className="error-text">{err}</p>}
      <div className="form-actions">
        <button className="btn btn-quiet" onClick={() => setOpen(false)}>
          Annuller
        </button>
        <button className="btn btn-primary" onClick={submit}>
          Tilføj
        </button>
      </div>
    </div>
  );
}

function Coverage({ data }: { data: AppData }) {
  const rows = coverage(data);
  const short = ['Mo', 'Fo', 'Mi', 'Ef'];
  return (
    <div>
      <p className="hint">
        Viser, hvor hvert hold har en tidsregel (Mo = morgen, Fo = formiddag, Mi = middag, Ef = eftermiddag). Et tomt felt betyder, at kilden
        ikke angiver en tid – ikke at holdet ikke må undervises dér. Fælles klasser for flere hold har egne regler og vises ikke her.
      </p>
      <div className="table-scroll">
        <table className="table coverage">
          <thead>
            <tr>
              <th>Hold</th>
              {DAY_SHORT.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.groupId}>
                <th scope="row">{data.groups.find((g) => g.id === r.groupId)?.name}</th>
                {r.days.map((periods, d) => (
                  <td key={d} className={periods.length ? '' : 'cov-none'}>
                    {periods.length ? periods.map((p) => short[p]).join(' ') : 'mangler'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssemblySettings({ data, onCommit }: RulesProps) {
  const a = data.settings.assembly;
  const teacher = data.teachers.find((t) => t.id === a.teacherId);
  const set = (patch: Partial<typeof a>, label: string) => cleanErrors(onCommit(label, ops.updateAssembly(data, patch)));
  const effective = assemblyPrepPercent(data.settings);
  return (
    <div>
      <p className="hint">
        Morgensamlingen er en fast begivenhed. Den vises ved fredagens morgen og booker ingen af de otte sale. Den giver kun lærertimer, når der er
        valgt en lærer.
      </p>
      <Row label="Tidspunkt" help={`${DAY_NAMES[a.day]}`}>
        <div className="inline">
          <CommitClock value={a.start} label="Morgensamling start" onCommit={(m) => (m >= a.end ? ['Start skal ligge før slut'] : set({ start: m }, 'Ændr morgensamlingens start'))} />
          <span>–</span>
          <CommitClock value={a.end} label="Morgensamling slut" onCommit={(m) => (m <= a.start ? ['Slut skal ligge efter start'] : set({ end: m }, 'Ændr morgensamlingens slut'))} />
        </div>
      </Row>
      <Row label="Hold og sted">
        <span>
          {a.groupIds.length ? groupsLabel(a.groupIds, data.groups) : '—'} · {a.location || 'sted ikke angivet'}
        </span>
      </Row>
      <Row label="Lærer" help={SOURCE.assembly ? `Kilden (${SOURCE.assembly.source.replace(/\s+!/, '!')}) angiver ${SOURCE.assembly.teachers.join('/')}` : undefined}>
        <div className="inline">
          <select value={a.teacherId ?? ''} onChange={(e) => set({ teacherId: e.target.value || null }, e.target.value ? 'Vælg lærer til morgensamling' : 'Fjern lærer fra morgensamling')} aria-label="Lærer til morgensamling">
            <option value="">Ingen lærer (giver ingen lærertimer)</option>
            {data.teachers
              .filter((t) => !t.archived || t.id === a.teacherId)
              .sort((x, y) => x.initials.localeCompare(y.initials, 'da'))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.initials}
                  {t.name ? ` – ${t.name}` : ''}
                </option>
              ))}
          </select>
          {teacher && <TeacherChip teacher={teacher} />}
        </div>
      </Row>
      <Row label="Forberedelse" help="Gælder kun morgensamlingen og ændrer ikke klassernes sats.">
        <div className="radio-list">
          <label className="check">
            <input type="radio" name="asm-prep" checked={a.prepMode === 'same'} onChange={() => set({ prepMode: 'same' }, 'Morgensamling: samme forberedelse som klasser')} />
            <span>Samme som klasser ({data.settings.prepPercent === null ? 'sats mangler' : `${formatNumber(data.settings.prepPercent)} %`})</span>
          </label>
          <label className="check">
            <input type="radio" name="asm-prep" checked={a.prepMode === 'none'} onChange={() => set({ prepMode: 'none' }, 'Morgensamling: ingen forberedelse')} />
            <span>Ingen forberedelse</span>
          </label>
          <label className="check">
            <input type="radio" name="asm-prep" checked={a.prepMode === 'custom'} onChange={() => set({ prepMode: 'custom' }, 'Morgensamling: egen forberedelsessats')} />
            <span>Egen sats</span>
          </label>
          {a.prepMode === 'custom' && (
            <CommitNumber value={a.prepPercent} label="Forberedelse for morgensamlingen" suffix="%" onCommit={(v) => set({ prepPercent: v }, 'Ændr morgensamlingens forberedelse')} />
          )}
          <span className="hint">
            Anvendes nu: {effective === null ? 'sats mangler' : `${formatNumber(effective)} %`} af {formatRange(a.start, a.end)} ({a.end - a.start} min).
          </span>
        </div>
      </Row>
    </div>
  );
}

function SourceInfo({ data, onLoadSourceWeek, onReloadSourceRules }: RulesProps) {
  const [confirm, setConfirm] = useState<'week' | 'rules' | null>(null);
  return (
    <div>
      <p>
        Tidsreglerne er udtrukket fra <strong>{SOURCE_NAME}</strong>. Hver regel henviser til cellen i arket.
      </p>
      <h4 className="label">Spørgsmål og usikkerheder</h4>
      <ul className="issues">
        {SOURCE_ISSUES.map((i) => (
          <li key={i.text}>
            <span className="source-ref">{i.ref}</span> {i.text}
          </li>
        ))}
      </ul>
      <h4 className="label">Brug kilden</h4>
      <div className="stack">
        <div>
          <button className="btn" onClick={() => setConfirm('rules')}>
            Genindlæs tidsregler fra kilden
          </button>
          <p className="hint">Erstatter tidstabellen med kildens regler og opdaterer almindelige klasser. Egne tider røres ikke. Kan fortrydes.</p>
        </div>
        <div>
          <button className="btn" onClick={() => setConfirm('week')}>
            Indlæs ugeskemaet fra kilden
          </button>
          <p className="hint">
            Erstatter alle {data.blocks.length} klasser med kildens klasser (klasser i K-salen kan ikke placeres i de otte kolonner). Lærere fra kilden
            oprettes, hvis de mangler. Kan fortrydes.
          </p>
        </div>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Bekræft">
          <p>{confirm === 'week' ? `Alle ${data.blocks.length} nuværende klasser erstattes. Vil du fortsætte?` : 'Tidstabellen erstattes med kildens regler. Vil du fortsætte?'}</p>
          <div className="form-actions">
            <button className="btn btn-quiet" onClick={() => setConfirm(null)}>
              Annuller
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (confirm === 'week') onLoadSourceWeek();
                else onReloadSourceRules();
                setConfirm(null);
              }}
            >
              {confirm === 'week' ? 'Erstat klasser' : 'Erstat tidstabel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
