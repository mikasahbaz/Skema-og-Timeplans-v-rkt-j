// Fælles læsevisning: kun skemaet (ingen årstimer eller satser). Henter ændringer automatisk.
import { DndContext } from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type PublicData, type Session } from './api';
import { DayList, DayTabs } from './DayList';
import { ScheduleGrid } from './Grid';
import { LoginPage } from './Login';
import { useMediaQuery } from './ui';

const POLL_MS = 15000;

export function Viewer({ session, onSession }: { session: Session; onSession: () => void }) {
  const [state, setState] = useState<{ version: number; updatedAt: string; data: PublicData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
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
  const updated = new Date(state.updatedAt).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="app app-viewer">
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">Balletskolen</span>
          <h1 className="brand-title">Ugeskema</h1>
          {session.demo && <span className="tag">{session.standalone ? 'Prøveversion' : 'Demo'}</span>}
        </div>
        <div className="topbar-right">
          <span className={`save ${error ? 'save-err' : ''}`} role="status" title={checkedAt ? `Kontrolleret kl. ${checkedAt.toLocaleTimeString('da-DK')}` : undefined}>
            {error ? 'Offline' : `Opdateret ${updated}`}
          </span>
          <a className="btn" href={session.standalone ? '#' : '/admin'}>
            {session.role === 'admin' ? 'Redigér' : 'Log ind'}
          </a>
        </div>
      </header>
      {error && <div className="banner banner-error">{error}</div>}
      {isMobile ? (
        <div className="mobile-body">
          <DayTabs day={day} onDay={setDay} />
          <DayList data={data} day={day} />
        </div>
      ) : (
        <div className="workspace workspace-full">
          <DndContext>
            <div className="board-scroll">
              <ScheduleGrid data={data} editable={false} />
            </div>
          </DndContext>
        </div>
      )}
    </div>
  );
}
