import { useCallback, useEffect, useState } from 'react';
import type { AppData } from '../../shared/schema';
import { api, type Session } from './api';
import { Editor } from './Editor';
import { LoginPage } from './Login';
import { clearPending, EditorStore, readPending, type PendingBackup } from './store';
import { Modal } from './ui';
import { Viewer } from './Viewer';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    api.session().then(setSession, (e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);

  if (error) return <div className="loading">Kunne ikke kontakte serveren: {error}</div>;
  if (!session) return <div className="loading">Indlæser…</div>;
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  if (!isAdminRoute) return <Viewer session={session} onSession={refresh} />;
  if (session.role !== 'admin')
    return <LoginPage title="Administrator" subtitle="Log ind for at redigere ugeskemaet." onSuccess={refresh} />;
  return <AdminRoot session={session} onLogout={() => api.logout().finally(refresh)} />;
}

function AdminRoot({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [store, setStore] = useState<EditorStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: PendingBackup; serverVersion: number; serverData: AppData } | null>(null);

  useEffect(() => {
    api.data().then(
      (res) => {
        const s = new EditorStore(res.data, res.version);
        const p = readPending();
        if (p && JSON.stringify(p.data) !== JSON.stringify(res.data)) setPending({ backup: p, serverVersion: res.version, serverData: res.data });
        else if (p) clearPending();
        setStore(s);
      },
      (e) => setError((e as Error).message),
    );
  }, []);

  if (error) return <div className="loading">Kunne ikke hente data: {error}</div>;
  if (!store) return <div className="loading">Henter skema…</div>;
  return (
    <>
      <Editor store={store} session={session} onLogout={onLogout} />
      {pending && (
        <Modal
          title="Ikke-gemte ændringer fundet"
          onClose={() => setPending(null)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  clearPending();
                  setPending(null);
                }}
              >
                Kassér
              </button>
              <button
                className={`btn ${pending.backup.baseVersion === pending.serverVersion ? 'btn-primary' : 'btn-warn'}`}
                onClick={() => {
                  store.restorePending(pending.backup, pending.serverVersion);
                  setPending(null);
                }}
              >
                {pending.backup.baseVersion === pending.serverVersion ? 'Gendan og gem' : 'Gendan og overskriv nyere'}
              </button>
            </>
          }
        >
          <p>
            Denne browser har ændringer fra {new Date(pending.backup.at).toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' })}, som ikke blev
            gemt på serveren ({pending.backup.data.blocks.length} blokke i den lokale udgave, {pending.serverData.blocks.length} på serveren).
          </p>
          {pending.backup.baseVersion !== pending.serverVersion && (
            <div className="notice notice-warn">
              Skemaet er siden ændret på serveren (version {pending.backup.baseVersion} → {pending.serverVersion}). Gendanner du, erstattes de nyere ændringer.
            </div>
          )}
          <p className="muted small">Gendannelsen kan fortrydes som én handling.</p>
        </Modal>
      )}
    </>
  );
}
