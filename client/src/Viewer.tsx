// Fælles læsevisning: kun skemaet (ingen årstimer eller satser). Henter ændringer automatisk.
import { DndContext } from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { allConflicts } from '../../shared/conflicts';
import { api, ApiError, type PublicData, type Session } from './api';
import { DayList, DayTabs } from './DayList';
import { FilterBar } from './FilterBar';
import { emptyFilter, ScheduleGrid, type Filter } from './Grid';
import { LoginPage } from './Login';
import { Icon, useMediaQuery } from './ui';

const POLL_MS = 15000;

export function Viewer({ session, onSession }: { session: Session; onSession: () => void }) {
  const [state, setState] = useState<{ version: number; updatedAt: string; data: PublicData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [day, setDay] = useState(() => Math.min(5, (new Date().getDay() + 6) % 7));

  const load = useCallback(async () => {
    try {
      setState(await api.schedule());
      setError(null);
      setCheckedAt(new Date());
    } catch (e) {
      if ((e as ApiError).status === 401) setNeedLogin(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const poll = async () => {
      if (document.hidden || !state) return;
      try {
        const v = await api.version();
        setCheckedAt(new Date());
        setError(null);
        if (v.version !== state.version) await load();
      } catch (e) {
        if ((e as ApiError).status === 401) setNeedLogin(true);
        else setError('Ingen forbindelse – viser senest hentede skema.');
      }
    };
    const t = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [state, load]);

  if (needLogin)
    return (
      <LoginPage
        title="Skemaet er beskyttet"
        subtitle="Log ind for at se ugeskemaet."
        viewerHint
        onSuccess={() => {
          setNeedLogin(false);
          onSession();
          void load();
        }}
      />
    );
  if (!state) return <div className="loading">{error ?? 'Henter skema…'}</div>;

  const data = state.data;
  const conflicts = allConflicts(data.blocks);
  const updated = new Date(state.updatedAt).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="app app-viewer">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span className="brand-name">Ugeskema</span>
          {session.demo && <span className="demo-badge">DEMOTILSTAND</span>}
          <span className="view-badge">Læsevisning</span>
        </div>
        <FilterBar data={data} filter={filter} onFilter={setFilter} />
        <div className="tb-spacer" />
        <span className={`save ${error ? 'save-err' : 'save-ok'}`} role="status" title={checkedAt ? `Kontrolleret kl. ${checkedAt.toLocaleTimeString('da-DK')}` : undefined}>
          <Icon name={error ? 'cloudOff' : 'check'} size={14} /> {error ? 'Offline' : `Senest ændret ${updated}`}
        </span>
        <a className="btn btn-sm" href={session.standalone ? '#' : '/admin'}>
          {session.role === 'admin' ? 'Redigér' : 'Log ind'}
        </a>
      </header>
      {error && <div className="banner banner-error">{error}</div>}
      {isMobile ? (
        <div className="mobile-body">
          <DayTabs day={day} onDay={setDay} counts={[0, 1, 2, 3, 4, 5].map((d) => data.blocks.filter((b) => b.day === d).length)} />
          <DayList data={data} day={day} filter={filter} conflictIds={conflicts.blockIds} />
        </div>
      ) : (
        <div className="workspace panel-closed">
          <DndContext>
            <div className="grid-scroll">
              <ScheduleGrid data={data} filter={filter} editable={false} conflictIds={conflicts.blockIds} />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  );
}
