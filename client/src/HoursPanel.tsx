// Timeoverblik: lærerliste med ugetotaler + valgt lærers detaljer og årsfremskrivning.
// Alle tal kommer fra shared/calc.ts (én beregningslogik).
import { MISSING_LABELS, prepMinutesPerHour, scheduleTotals, type Figures, type TeacherSummary } from '../../shared/calc';
import { DAY_SHORT, type AppData } from '../../shared/schema';
import { formatDecimalHours, formatDuration, formatHours, formatNumber, formatRange } from '../../shared/time';
import { Icon, TeacherChip } from './ui';

export type Unit = 'hm' | 'dec';

interface Props {
  data: AppData;
  summaries: Map<string, TeacherSummary>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  conflictCount: number;
  unit: Unit;
  onUnit: (u: Unit) => void;
  onOpenSettings: (tab?: string) => void;
  onShowConflicts: () => void;
  onFilterTeacher: (id: string) => void;
  filteredTeacherId: string | null;
}

export function HoursPanel(p: Props) {
  const fmt = (m: number | null) => (p.unit === 'dec' ? formatDecimalHours(m) : formatDuration(m));
  const totals = scheduleTotals(p.data);
  const s = p.data.settings;
  const missingRates = [s.prepPercent === null && 'forberedelsesprocent', s.saturdayPercent === null && 'lørdagstillæg', s.teachingWeeks === null && 'undervisningsuger'].filter(Boolean);
  const teachers = [...p.data.teachers].filter((t) => !t.archived || (p.summaries.get(t.id)?.blockCount ?? 0) > 0).sort((a, b) => a.initials.localeCompare(b.initials, 'da'));
  const selected = p.selectedId ? p.data.teachers.find((t) => t.id === p.selectedId) : undefined;
  const sum = p.selectedId ? p.summaries.get(p.selectedId) : undefined;

  return (
    <div className="panel-inner">
      <div className="hp-list">
      <div className="panel-head">
        <h2>Timeoverblik</h2>
        <div className="seg" role="group" aria-label="Tidsformat">
          <button className={p.unit === 'hm' ? 'on' : ''} aria-pressed={p.unit === 'hm'} onClick={() => p.onUnit('hm')}>
            t:min
          </button>
          <button className={p.unit === 'dec' ? 'on' : ''} aria-pressed={p.unit === 'dec'} onClick={() => p.onUnit('dec')}>
            decimal
          </button>
        </div>
      </div>

      <div className="rates">
        <span>
          Forberedelse <strong>{s.prepPercent === null ? 'mangler' : `${formatNumber(s.prepPercent)} %`}</strong>
          {s.prepPercent !== null && <span className="muted"> = {formatNumber(prepMinutesPerHour(s.prepPercent))} min pr. time</span>}
        </span>
        <span>
          Lørdagstillæg <strong>{s.saturdayPercent === null ? 'mangler' : `${formatNumber(s.saturdayPercent)} %`}</strong>
        </span>
        <span>
          Grundlag <strong>{s.prepBasis === 'actual' ? 'faktisk undervisning' : 'inkl. lørdagstillæg'}</strong>
        </span>
        <span>
          Uger <strong>{s.teachingWeeks === null ? 'mangler' : formatNumber(s.teachingWeeks)}</strong>
        </span>
        <button className="link small" onClick={() => p.onOpenSettings('calc')}>
          Ret satser
        </button>
      </div>

      {missingRates.length > 0 && (
        <div className="notice notice-warn small">
          Mangler: {missingRates.join(', ')}. Tal, der afhænger af dem, vises som "—" og regnes ikke som 0.
        </div>
      )}
      {p.conflictCount > 0 && (
        <div className="notice notice-conflict notice-inline small">
          <Icon name="alert" size={14} /> Planen indeholder {p.conflictCount} {p.conflictCount === 1 ? 'konflikt' : 'konflikter'}. Konfliktblokke
          tæller med i opgørelsen.{' '}
          <button className="link" onClick={p.onShowConflicts}>
            Vis
          </button>
        </div>
      )}

      <table className="hours-table">
        <thead>
          <tr>
            <th scope="col">Lærer</th>
            <th scope="col" title="Faktisk undervisningstid pr. uge">Underv. (U)</th>
            <th scope="col" title="Samlet medregnet arbejdstid pr. uge">I alt (K)</th>
            <th scope="col" title="Resterende årstimer">Rest år</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => {
            const ts = p.summaries.get(t.id)!;
            const rest = ts.annual.remainingHours;
            return (
              <tr
                key={t.id}
                className={p.selectedId === t.id ? 'sel' : ''}
                onClick={() => p.onSelect(p.selectedId === t.id ? null : t.id)}
                tabIndex={0}
                aria-selected={p.selectedId === t.id}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), p.onSelect(p.selectedId === t.id ? null : t.id))}
              >
                <th scope="row">
                  <TeacherChip teacher={t} small />
                </th>
                <td>{fmt(ts.week.U)}</td>
                <td className="strong">{fmt(ts.week.K)}</td>
                <td className={rest !== null && rest < 0 ? 'neg' : ''}>{rest === null ? <span className="missing">mangler</span> : formatHours(round2(rest))}</td>
              </tr>
            );
          })}
          {teachers.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Ingen lærere endnu.{' '}
                <button className="link" onClick={() => p.onOpenSettings('teachers')}>
                  Tilføj lærere
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted small totals-line">
        Skemaet: {fmt(totals.roomMinutes)} undervisning i salene · {fmt(totals.teacherMinutes)} lærertimer (U) i alt · {totals.blockCount} blokke
      </p>
      </div>
      <div className="hp-detail">
      {selected && sum ? (
        <TeacherDetail p={p} sum={sum} fmt={fmt} />
      ) : (
        teachers.length > 0 && <p className="muted hint">Vælg en lærer for at se den detaljerede beregning.</p>
      )}
      </div>
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function TeacherDetail({ p, sum, fmt }: { p: Props; sum: TeacherSummary; fmt: (m: number | null) => string }) {
  const t = p.data.teachers.find((x) => x.id === sum.teacherId)!;
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '?';
  const a = sum.annual;
  const missingAnnual = sum.missing.filter((m) => m === 'teachingWeeks' || m === 'annualHours' || ((m === 'prepPercent' || m === 'saturdayPercent') && sum.week.K === null));

  return (
    <section className="detail" aria-label={`Detaljer for ${t.initials}`}>
      <div className="detail-head">
        <TeacherChip teacher={t} />
        <h3>{t.name || t.initials}</h3>
        <span className="muted small">{sum.blockCount} blokke</span>
        <button
          className={`btn btn-sm${p.filteredTeacherId === t.id ? ' btn-selected' : ''}`}
          onClick={() => p.onFilterTeacher(t.id)}
          title="Viser kun lærerens blokke i skemaet. Opgørelsen påvirkes ikke."
        >
          <Icon name="filter" size={13} /> {p.filteredTeacherId === t.id ? 'Vis alle' : 'Vis i skema'}
        </button>
      </div>

      <div className="detail-boxes">
      <div className="week-box">
        <div className="wb-title">Samlet uge</div>
        <dl>
          <Stat label="Faktisk undervisningstid (U)" v={fmt(sum.week.U)} />
          <Stat label="Forberedelsestid (F)" v={fmt(sum.week.F)} />
          <Stat label="Undervisning + forberedelse (U + F)" v={fmt(sum.week.UF)} />
          <Stat label="Lørdagstillæg (L)" v={fmt(sum.week.L)} />
          <Stat label="Samlet medregnet arbejdstid (K)" v={fmt(sum.week.K)} strong />
        </dl>
      </div>

      <div className="year-box">
        <div className="wb-title">Årsfremskrivning</div>
        <dl>
          <Stat label="Årsarbejdstimer (A)" v={a.expectedHours === null ? 'mangler' : formatHours(a.expectedHours)} missing={a.expectedHours === null} />
          <Stat label="Planlagt fra grundugen (K × W)" v={a.plannedHours === null ? 'mangler' : formatHours(round2(a.plannedHours))} missing={a.plannedHours === null} />
          <Stat
            label={a.remainingHours !== null && a.remainingHours < 0 ? 'Overplanlagt' : 'Resterende årstimer'}
            v={a.remainingHours === null ? 'mangler' : formatHours(round2(a.remainingHours))}
            strong
            neg={a.remainingHours !== null && a.remainingHours < 0}
            missing={a.remainingHours === null}
          />
        </dl>
        {missingAnnual.length > 0 && (
          <p className="small warn-text">
            Mangler: {missingAnnual.map((m) => MISSING_LABELS[m]).join(', ')}.{' '}
            <button className="link" onClick={() => p.onOpenSettings(missingAnnual.includes('annualHours') ? 'teachers' : 'calc')}>
              Udfyld
            </button>
          </p>
        )}
        <p className="muted small">
          Forudsætter samme grunduge i alle {a.weeks === null ? 'W' : formatNumber(a.weeks)} undervisningsuger. Møder, forestillinger og øvrige opgaver er ikke
          indregnet.
        </p>
      </div>

      </div>
      <div className="detail-tables">
      <h4>Pr. ugedag</h4>
      <div className="table-scroll">
      <table className="day-table">
        <thead>
          <tr>
            <th>Dag</th>
            <th>U</th>
            <th>F</th>
            <th>U+F</th>
            <th>L</th>
            <th>K</th>
          </tr>
        </thead>
        <tbody>
          {sum.days.map((d: Figures, i) => (
            <tr key={i} className={d.U === 0 ? 'zero' : ''}>
              <th scope="row">{DAY_SHORT[i]}</th>
              <td>{fmt(d.U)}</td>
              <td>{fmt(d.F)}</td>
              <td>{fmt(d.UF)}</td>
              <td>{fmt(d.L)}</td>
              <td className="strong">{fmt(d.K)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Uge</th>
            <td>{fmt(sum.week.U)}</td>
            <td>{fmt(sum.week.F)}</td>
            <td>{fmt(sum.week.UF)}</td>
            <td>{fmt(sum.week.L)}</td>
            <td className="strong">{fmt(sum.week.K)}</td>
          </tr>
        </tfoot>
      </table>
      </div>

      <div className="split-lists">
        <div>
          <h4>Pr. fag (U)</h4>
          <ul className="kv">
            {sum.bySubject.map((r) => (
              <li key={r.id}>
                <span>{name(p.data.subjects, r.id)}</span>
                <span>{fmt(r.minutes)}</span>
              </li>
            ))}
            {!sum.bySubject.length && <li className="muted">Ingen undervisning</li>}
          </ul>
        </div>
        <div>
          <h4>Pr. hold (U)</h4>
          <ul className="kv">
            {sum.byGroup.map((r) => (
              <li key={r.id}>
                <span>{name(p.data.groups, r.id)}</span>
                <span>{fmt(r.minutes)}</span>
              </li>
            ))}
            {!sum.byGroup.length && <li className="muted">Ingen undervisning</li>}
          </ul>
        </div>
      </div>

      <h4>Blokke</h4>
      <ul className="block-lines">
        {sum.blocksByDay.flatMap((list, day) =>
          list.map((b) => (
            <li key={b.id}>
              <span className="bl-day">{DAY_SHORT[day]}</span>
              <span className="tabular">{formatRange(b.start, b.end)}</span>
              <span className="bl-what">
                {name(p.data.subjects, b.subjectId)} · {name(p.data.groups, b.groupId)}
                {b.teacherIds.length > 1 && (
                  <span className="muted"> · med {b.teacherIds.filter((x) => x !== t.id).map((x) => p.data.teachers.find((y) => y.id === x)?.initials).join(', ')}</span>
                )}
              </span>
              <span className="bl-dur">{fmt(b.end - b.start)}</span>
            </li>
          )),
        )}
      </ul>
      </div>
    </section>
  );
}

function Stat({ label, v, strong, neg, missing }: { label: string; v: string; strong?: boolean; neg?: boolean; missing?: boolean }) {
  return (
    <div className={`stat${strong ? ' stat-strong' : ''}${neg ? ' neg' : ''}${missing ? ' stat-missing' : ''}`}>
      <dt>{label}</dt>
      <dd>{v}</dd>
    </div>
  );
}
