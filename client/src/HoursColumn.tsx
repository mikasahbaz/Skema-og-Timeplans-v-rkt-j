// Kompakt, løbende timeoptælling ved siden af skemaet: lærere og samlet medregnet ugetid.
// Tryk på en lærer viser kort undervisning, forberedelse og evt. tillæg. Detaljer ligger bag tandhjulet.
import type { TeacherSummary } from '../../shared/calc';
import type { AppData } from '../../shared/schema';
import { formatDuration } from '../../shared/time';
import { Icon, TeacherChip } from './ui';

interface Props {
  data: AppData;
  summaries: Map<string, TeacherSummary>;
  openId: string | null;
  onOpen: (id: string | null) => void;
  conflictCount: number;
  onShowConflicts: () => void;
  onDetails: (teacherId: string) => void;
}

export function HoursColumn({ data, summaries, openId, onOpen, conflictCount, onShowConflicts, onDetails }: Props) {
  const teachers = data.teachers
    .filter((t) => !t.archived || (summaries.get(t.id)?.week.U ?? 0) > 0)
    .sort((a, b) => a.initials.localeCompare(b.initials, 'da'));
  const ratesMissing = data.settings.prepPercent === null || data.settings.saturdayPercent === null;
  return (
    <div className="hours">
      <h2 className="label">Timer pr. uge</h2>
      {conflictCount > 0 && (
        <button className="hours-alert" onClick={onShowConflicts}>
          <Icon name="alert" size={14} /> {conflictCount} {conflictCount === 1 ? 'konflikt' : 'konflikter'} i planen
        </button>
      )}
      <ul className="hours-list">
        {teachers.map((t) => {
          const s = summaries.get(t.id)!;
          const open = openId === t.id;
          const total = s.week.K;
          return (
            <li key={t.id} className={open ? 'open' : ''}>
              <button className="hours-row" aria-expanded={open} onClick={() => onOpen(open ? null : t.id)}>
                <TeacherChip teacher={t} />
                <span className="hours-name">{t.name || ''}</span>
                <span className="hours-total tabular">{total === null ? '—' : formatDuration(total)}</span>
              </button>
              {open && (
                <div className="hours-detail">
                  <dl>
                    <div>
                      <dt>Undervisning</dt>
                      <dd className="tabular">{formatDuration(s.week.U)}</dd>
                    </div>
                    <div>
                      <dt>Forberedelse</dt>
                      <dd className="tabular">{s.week.F === null ? 'sats mangler' : formatDuration(s.week.F)}</dd>
                    </div>
                    {(s.week.L === null || s.week.L > 0) && (
                      <div>
                        <dt>Lørdagstillæg</dt>
                        <dd className="tabular">{s.week.L === null ? 'sats mangler' : formatDuration(s.week.L)}</dd>
                      </div>
                    )}
                    <div className="sum">
                      <dt>I alt</dt>
                      <dd className="tabular">{formatDuration(s.week.K)}</dd>
                    </div>
                  </dl>
                  {s.assembly && <p className="hint">Inkl. morgensamling fredag.</p>}
                  <button className="link-btn" onClick={() => onDetails(t.id)}>
                    Se detaljer <Icon name="chevronRight" size={14} />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!teachers.length && <p className="hint">Ingen lærere endnu. Tilføj dem under tandhjulet.</p>}
      {ratesMissing && teachers.length > 0 && <p className="hint">Satser mangler – tallene viser kun den del, der kan beregnes.</p>}
    </div>
  );
}
