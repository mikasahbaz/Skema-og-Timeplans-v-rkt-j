import type { Filter, GridData } from './Grid';
import { Icon } from './ui';

/** Skemafiltre. Påvirker kun visningen – aldrig timeopgørelsen. */
export function FilterBar({ data, filter, onFilter }: { data: GridData; filter: Filter; onFilter: (f: Filter) => void }) {
  const active = <T extends { archived: boolean; id: string }>(list: T[], selected: string | null) =>
    list.filter((x) => !x.archived || x.id === selected || data.blocks.some((b) => b.teacherIds.includes(x.id) || b.groupId === x.id || b.subjectId === x.id));
  const any = filter.teacherId || filter.groupId || filter.subjectId;
  return (
    <div className="filters" role="group" aria-label="Filtrér skemaet">
      <Icon name="filter" size={14} className="muted" />
      <select aria-label="Filtrér på lærer" value={filter.teacherId ?? ''} onChange={(e) => onFilter({ ...filter, teacherId: e.target.value || null })} className={filter.teacherId ? 'on' : ''}>
        <option value="">Alle lærere</option>
        {active(data.teachers, filter.teacherId)
          .sort((a, b) => a.initials.localeCompare(b.initials, 'da'))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.initials}
              {t.name ? ` – ${t.name}` : ''}
            </option>
          ))}
      </select>
      <select aria-label="Filtrér på hold" value={filter.groupId ?? ''} onChange={(e) => onFilter({ ...filter, groupId: e.target.value || null })} className={filter.groupId ? 'on' : ''}>
        <option value="">Alle hold</option>
        {active(data.groups, filter.groupId).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select aria-label="Filtrér på fag" value={filter.subjectId ?? ''} onChange={(e) => onFilter({ ...filter, subjectId: e.target.value || null })} className={filter.subjectId ? 'on' : ''}>
        <option value="">Alle fag</option>
        {active(data.subjects, filter.subjectId).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {any && (
        <button className="btn btn-sm btn-ghost" onClick={() => onFilter({ teacherId: null, groupId: null, subjectId: null })}>
          Ryd
        </button>
      )}
    </div>
  );
}
