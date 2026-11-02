// Redigeringstilstand: data, fortryd-historik og autogem med versionskontrol.
// Én brugerhandling = ét commit = ét historiktrin. Serveren er den autoritative kilde;
// localStorage bruges kun som sikring af ikke-gemte ændringer.
import { useSyncExternalStore } from 'react';
import type { AppData } from '../../shared/schema';
import { validateAppData } from '../../shared/validate';
import { api, ApiError } from './api';

export const HISTORY_LIMIT = 100;
const PENDING_KEY = 'ugeskema.pending.v1';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface Entry {
  label: string;
  data: AppData;
}

export interface EditorState {
  data: AppData;
  /** Serverversionen som `data` bygger på (sidst gemte/hentede). */
  baseVersion: number;
  past: Entry[];
  future: Entry[];
  status: SaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  /** Revision af data, som serveren har bekræftet. */
  savedRev: number;
  rev: number;
}

export interface PendingBackup {
  baseVersion: number;
  data: AppData;
  at: number;
}

type Listener = () => void;

export class EditorStore {
  state: EditorState;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private inFlight = false;
  onNotice: (msg: string) => void = () => {};

  constructor(data: AppData, version: number) {
    this.state = {
      data,
      baseVersion: version,
      past: [],
      future: [],
      status: 'saved',
      errorMessage: null,
      lastSavedAt: null,
      savedRev: 0,
      rev: 0,
    };
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;
  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  get dirty() {
    return this.state.rev !== this.state.savedRev;
  }

  /**
   * Registrerer én brugerhandling. Data valideres med samme regler som på serveren;
   * ugyldige ændringer afvises og efterlader tilstanden uændret.
   */
  commit(label: string, next: AppData): { ok: true } | { ok: false; errors: string[] } {
    const v = validateAppData(next);
    if (!v.ok) return { ok: false, errors: v.errors };
    const past = [...this.state.past, { label, data: this.state.data }].slice(-HISTORY_LIMIT);
    this.apply(next, { past, future: [] });
    return { ok: true };
  }

  get canUndo() {
    return this.state.past.length > 0;
  }
  get canRedo() {
    return this.state.future.length > 0;
  }

  undo(): string | null {
    const { past, future, data } = this.state;
    const entry = past[past.length - 1];
    if (!entry) return null;
    this.apply(entry.data, { past: past.slice(0, -1), future: [{ label: entry.label, data }, ...future] });
    return entry.label;
  }

  redo(): string | null {
    const { past, future, data } = this.state;
    const entry = future[0];
    if (!entry) return null;
    this.apply(entry.data, { past: [...past, { label: entry.label, data }], future: future.slice(1) });
    return entry.label;
  }

  private apply(data: AppData, patch: Partial<EditorState>) {
    const rev = this.state.rev + 1;
    const status: SaveStatus = this.state.status === 'conflict' ? 'conflict' : 'pending';
    this.set({ ...patch, data, rev, status });
    writePending({ baseVersion: this.state.baseVersion, data, at: Date.now() });
    if (status !== 'conflict') this.scheduleSave(250);
  }

  private scheduleSave(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  /** Gemmer aktuelle data. Kaldes automatisk; kan kaldes manuelt ("Prøv igen"). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.inFlight || !this.dirty || this.state.status === 'conflict') return;
    this.inFlight = true;
    const { data, rev, baseVersion } = this.state;
    this.set({ status: 'saving' });
    try {
      const res = await api.save(baseVersion, data);
      this.retryCount = 0;
      const stillDirty = this.state.rev !== rev;
      this.set({
        baseVersion: res.version,
        savedRev: rev,
        status: stillDirty ? 'pending' : 'saved',
        errorMessage: null,
        lastSavedAt: Date.now(),
      });
      if (stillDirty) {
        writePending({ baseVersion: res.version, data: this.state.data, at: Date.now() });
        this.scheduleSave(50);
      } else clearPending();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        this.set({ status: 'conflict', errorMessage: 'Skemaet er ændret i et andet vindue eller på en anden enhed.' });
      } else {
        const message =
          err.status === 401 || err.status === 403
            ? 'Du er ikke logget ind som administrator. Log ind igen – ændringerne er bevaret i browseren.'
            : err.status === 400
              ? `Serveren afviste ændringen: ${((err.body.errors as string[]) ?? []).slice(0, 3).join('; ') || err.message}`
              : `${err.message}. Ændringerne er bevaret i browseren.`;
        this.set({ status: 'error', errorMessage: message });
        if (err.status === 0 || err.status >= 500) {
          const delay = Math.min(30000, 2000 * 2 ** this.retryCount++);
          this.retryTimer = setTimeout(() => void this.flush(), delay);
        }
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Erstat med serverens data (fx efter konflikt eller opdatering fra anden session). */
  replaceFromServer(data: AppData, version: number) {
    if (this.timer) clearTimeout(this.timer);
    this.set({
      data,
      baseVersion: version,
      past: [],
      future: [],
      status: 'saved',
      errorMessage: null,
      rev: this.state.rev + 1,
      savedRev: this.state.rev + 1,
    });
    clearPending();
  }

  /** Bevidst overskrivning efter konflikt: gem vores data oven på den nyeste serverversion. */
  async overwriteServer(serverVersion: number) {
    this.set({ baseVersion: serverVersion, status: 'pending', errorMessage: null });
    await this.flush();
  }

  /** Gendan ikke-gemte ændringer fra en tidligere session som én fortrydbar handling. */
  restorePending(p: PendingBackup, serverVersion: number) {
    this.set({ baseVersion: serverVersion });
    this.commit('Gendan ikke-gemte ændringer', p.data);
  }
}

export function useEditor<T>(store: EditorStore, select: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

// ---- Sikring af ikke-gemte ændringer i browseren ---------------------------
export function writePending(p: PendingBackup) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* fx privat tilstand – serveren er stadig kilden */
  }
}
export function readPending(): PendingBackup | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingBackup) : null;
  } catch {
    return null;
  }
}
export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignorer */
  }
}

// ---- Lokale præferencer -----------------------------------------------------
export function pref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`ugeskema.pref.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function setPref(key: string, value: unknown) {
  try {
    localStorage.setItem(`ugeskema.pref.${key}`, JSON.stringify(value));
  } catch {
    /* ignorer */
  }
}
