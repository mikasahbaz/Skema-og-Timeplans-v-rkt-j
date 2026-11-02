// Prøveudgave uden server: besvarer appens /api-kald i browseren med samme regler som
// den rigtige server (validering, versionskontrol, læsevisning uden årstimer).
// Data gemmes i browserens localStorage og deles ikke med andre.
import { demoAppData } from '../../shared/demo';
import { migrateAny } from '../../shared/migrate';
import { publicProjection } from '../../shared/public';
import type { AppData } from '../../shared/schema';
import { validateAppData } from '../../shared/validate';

const KEY = 'ugeskema.standalone.v1';
const MAX_REVISIONS = 50;

interface Revision {
  version: number;
  createdAt: string;
  source: string;
  data: AppData;
}
interface Db {
  version: number;
  updatedAt: string;
  data: AppData;
  revisions: Revision[];
}

let memory: Db | null = null;

function fresh(): Db {
  const now = new Date().toISOString();
  const data = demoAppData();
  return { version: 1, updatedAt: now, data, revisions: [{ version: 1, createdAt: now, source: 'demo', data }] };
}

function load(): Db {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as Db;
      // Ældre prøvedata bringes op på den aktuelle datamodel.
      const v = validateAppData(migrateAny(db.data).data);
      if (v.ok) return (memory = { ...db, data: v.data! });
    }
  } catch {
    /* privat vindue o.l. – brug hukommelsen */
  }
  return (memory = fresh());
}

function persist(db: Db) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* kun i hukommelsen denne gang */
  }
}

function save(db: Db, data: AppData, source: string) {
  const version = db.version + 1;
  const updatedAt = new Date().toISOString();
  const revisions = [{ version, createdAt: updatedAt, source, data }, ...db.revisions].slice(0, MAX_REVISIONS);
  persist({ version, updatedAt, data, revisions });
  return { version, updatedAt };
}

const counts = (d: AppData) => ({ blocks: d.blocks.length, teachers: d.teachers.length, groups: d.groups.length, rules: d.timeRules.length });
const unwrap = (b: unknown) =>
  b && typeof b === 'object' && (b as { format?: string }).format === 'ballet-ugeskema-backup' ? (b as { data: unknown }).data : b;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function handle(method: string, path: string, body: unknown): Response {
  const db = load();
  const b = (body ?? {}) as Record<string, unknown>;
  if (path === '/api/session') return json(200, { role: 'admin', demo: true, viewerPasswordRequired: false, standalone: true });
  if (path === '/api/login' || path === '/api/logout') return json(200, { role: 'admin' });
  if (path === '/api/health') return json(200, { ok: true, version: db.version });
  if (path === '/api/version') return json(200, { version: db.version, updatedAt: db.updatedAt });
  if (path === '/api/schedule') return json(200, { version: db.version, updatedAt: db.updatedAt, data: publicProjection(db.data) });
  if (path === '/api/data' && method === 'GET') return json(200, { version: db.version, updatedAt: db.updatedAt, data: db.data });
  if (path === '/api/data' && method === 'PUT') {
    if (!Number.isInteger(b.baseVersion)) return json(400, { error: 'baseVersion mangler', errors: [] });
    const v = validateAppData(b.data);
    if (!v.ok) return json(400, { error: 'Ugyldige data', errors: v.errors });
    if (b.baseVersion !== db.version) return json(409, { error: 'Skemaet er ændret et andet sted', currentVersion: db.version });
    return json(200, save(db, v.data!, 'edit'));
  }
  if (path === '/api/import/preview') {
    const v = validateAppData(migrateAny(unwrap(body)).data);
    return json(200, { ok: v.ok, errors: v.errors, incoming: v.ok ? counts(v.data!) : null, current: counts(db.data), currentVersion: db.version });
  }
  if (path === '/api/import') {
    const v = validateAppData(migrateAny(unwrap(b.backup)).data);
    if (!v.ok) return json(400, { error: 'Filen er ikke en gyldig backup', errors: v.errors });
    if (b.baseVersion !== db.version) return json(409, { error: 'Skemaet er ændret et andet sted', currentVersion: db.version });
    return json(200, save(db, v.data!, 'import'));
  }
  if (path === '/api/demo') return json(200, save(db, demoAppData(), 'demo'));
  if (path === '/api/revisions')
    return json(
      200,
      db.revisions.map((r) => ({ version: r.version, createdAt: r.createdAt, source: r.source, blocks: r.data.blocks.length, teachers: r.data.teachers.length })),
    );
  const m = path.match(/^\/api\/revisions\/(\d+)$/);
  if (m) {
    const r = db.revisions.find((x) => x.version === Number(m[1]));
    return r ? json(200, { version: r.version, createdAt: r.createdAt, data: r.data }) : json(404, { error: 'Versionen findes ikke (længere)' });
  }
  if (path === '/api/export') return json(200, { format: 'ballet-ugeskema-backup', formatVersion: 1, exportedAt: new Date().toISOString(), version: db.version, data: db.data });
  return json(404, { error: 'Ukendt API-adresse' });
}

/** Udskifter fetch for /api-adresser. Alt andet går videre til den rigtige fetch. */
export function installStandaloneServer() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Appen kalder altid relative adresser som "/api/data"; alt andet sendes videre uændret.
    if (typeof input !== 'string' || !input.startsWith('/api/')) return real(input, init);
    const path = input.split('?')[0];
    let body: unknown;
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    } catch {
      return json(400, { error: 'Ugyldig JSON' });
    }
    // Lille forsinkelse, så "Gemmer…" kan ses som i den rigtige app.
    await new Promise((r) => setTimeout(r, 120));
    return handle((init?.method ?? 'GET').toUpperCase(), path, body);
  };
}

/** Nulstil prøveudgaven til eksempeldata. */
export function resetStandalone() {
  persist(fresh());
}
