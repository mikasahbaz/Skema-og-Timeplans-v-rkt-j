import type { AppData } from '../../shared/schema';

export type Role = 'admin' | 'viewer' | null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'content-type': 'application/json', ...(init.headers ?? {}) } : init.headers,
    });
  } catch {
    throw new ApiError(0, 'Ingen forbindelse til serveren');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const fallback = res.status >= 500 ? `Serveren svarede med en fejl (${res.status})` : `Uventet svar fra serveren (${res.status})`;
    throw new ApiError(res.status, String(body.error ?? fallback), body);
  }
  return body as T;
}

export interface Session {
  role: Role;
  demo: boolean;
  viewerPasswordRequired: boolean;
  /** Prøveudgave uden server: data gemmes kun i denne browser. */
  standalone?: boolean;
}

export type PublicData = Pick<AppData, 'rooms' | 'blocks' | 'subjects' | 'groups'> & {
  teachers: Omit<AppData['teachers'][number], 'annualHours'>[];
  settings: Pick<AppData['settings'], 'daypartStarts'>;
};

export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

export const api = {
  session: () => request<Session>('/api/session'),
  login: (password: string) => request<{ role: Role }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ role: Role }>('/api/logout', { method: 'POST', body: '{}' }),
  version: () => request<{ version: number; updatedAt: string }>('/api/version'),
  data: () => request<{ version: number; updatedAt: string; data: AppData }>('/api/data'),
  schedule: () => request<{ version: number; updatedAt: string; data: PublicData }>('/api/schedule'),
  save: (baseVersion: number, data: AppData) =>
    request<{ version: number; updatedAt: string }>('/api/data', { method: 'PUT', body: JSON.stringify({ baseVersion, data }) }),
  importPreview: (backup: unknown) =>
    request<{
      ok: boolean;
      errors: string[];
      incoming: Counts | null;
      current: Counts;
      currentVersion: number;
    }>('/api/import/preview', { method: 'POST', body: JSON.stringify(backup) }),
  importReplace: (baseVersion: number, backup: unknown) =>
    request<{ version: number }>('/api/import', { method: 'POST', body: JSON.stringify({ baseVersion, backup }) }),
  revisions: () => request<RevisionInfo[]>('/api/revisions'),
  revision: (version: number) => request<{ version: number; createdAt: string; data: AppData }>(`/api/revisions/${version}`),
  loadDemo: (baseVersion: number) =>
    request<{ version: number }>('/api/demo', { method: 'POST', body: JSON.stringify({ baseVersion }) }),
};

export interface RevisionInfo {
  version: number;
  createdAt: string;
  source: string;
  blocks: number;
  teachers: number;
}

export interface Counts {
  blocks: number;
  teachers: number;
  subjects: number;
  groups: number;
}
