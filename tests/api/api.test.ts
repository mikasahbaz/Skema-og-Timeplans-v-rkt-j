import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { loadConfig } from '../../server/config';
import { demoAppData } from '../../shared/demo';

const servers: { server: Server; close: () => void }[] = [];
afterEach(() => {
  while (servers.length) servers.pop()!.close();
});

async function start(env: Record<string, string> = {}, dbFile?: string) {
  const file = dbFile ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ugeskema-')), 'test.sqlite');
  const config = loadConfig({ ADMIN_PASSWORD: 'hemmeligt-ord', DB_FILE: file, STATIC_DIR: '/nonexistent', ...env });
  const { app, store } = createApp(config);
  const server = await new Promise<Server>((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  servers.push({ server, close: () => (server.close(), store.close()) });
  return { base, file };
}

async function login(base: string, password = 'hemmeligt-ord') {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

const json = (cookie: string, body: unknown, method = 'PUT') => ({
  method,
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});

describe('API', () => {
  it('kræver administrator for at skrive; læseadgang kan ikke skrive', async () => {
    const { base } = await start({ VIEWER_PASSWORD: 'kig' });
    const anon = await fetch(`${base}/api/data`, json('', { baseVersion: 1, data: demoAppData() }));
    expect(anon.status).toBe(401);
    const viewer = await login(base, 'kig');
    expect(viewer.res.status).toBe(200);
    const asViewer = await fetch(`${base}/api/data`, json(viewer.cookie, { baseVersion: 1, data: demoAppData() }));
    expect(asViewer.status).toBe(403);
    expect((await fetch(`${base}/api/data`, { headers: { cookie: viewer.cookie } })).status).toBe(403);
    expect((await fetch(`${base}/api/demo`, json(viewer.cookie, {}, 'POST'))).status).toBe(403);
    expect((await fetch(`${base}/api/import`, json(viewer.cookie, { baseVersion: 1, backup: demoAppData() }, 'POST'))).status).toBe(403);
    // Læseren kan se skemaet, men ikke årstimer eller satser.
    const sched = await (await fetch(`${base}/api/schedule`, { headers: { cookie: viewer.cookie } })).json();
    expect(sched.data.rooms).toHaveLength(8);
    expect(JSON.stringify(sched)).not.toContain('annualHours');
    expect(JSON.stringify(sched)).not.toContain('prepPercent');
    // Uden login og med læseadgangskode sat: ingen adgang til skemaet.
    expect((await fetch(`${base}/api/schedule`)).status).toBe(401);
  });

  it('afviser forkert adgangskode og forfalsket cookie', async () => {
    const { base } = await start();
    expect((await login(base, 'forkert')).res.status).toBe(401);
    const fake = 'ugeskema_session=' + Buffer.from(JSON.stringify({ r: 'admin', exp: Date.now() + 1e9 })).toString('base64url') + '.abc';
    expect((await fetch(`${base}/api/data`, { headers: { cookie: fake } })).status).toBe(401);
  });

  it('gemmer med versionskontrol og afviser forældede versioner', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const first = await (await fetch(`${base}/api/data`, { headers: { cookie } })).json();
    expect(first.version).toBe(1);
    const data = demoAppData();
    const ok = await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).version).toBe(2);
    const stale = await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data: { ...data, blocks: [] } }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).currentVersion).toBe(2);
    const now = await (await fetch(`${base}/api/data`, { headers: { cookie } })).json();
    expect(now.data.blocks.length).toBe(data.blocks.length);
  });

  it('validerer data på serveren', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const data = demoAppData();
    data.blocks[0].end = data.blocks[0].start; // ugyldigt interval
    const res = await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.join()).toMatch(/Sluttid/);
    const dup = demoAppData();
    dup.blocks[0].teacherIds = [dup.blocks[0].teacherIds[0], dup.blocks[0].teacherIds[0]];
    expect((await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data: dup }))).status).toBe(400);
  });

  it('data overlever genstart af serveren', async () => {
    const first = await start();
    const { cookie } = await login(first.base);
    await fetch(`${first.base}/api/data`, json(cookie, { baseVersion: 1, data: demoAppData() }));
    servers.pop()!.close();
    const second = await start({}, first.file);
    const c2 = (await login(second.base)).cookie;
    const s = await (await fetch(`${second.base}/api/data`, { headers: { cookie: c2 } })).json();
    expect(s.version).toBe(2);
    expect(s.data.teachers.map((t: { initials: string }) => t.initials)).toContain('TH');
  });

  it('demodata overskriver aldrig et skema med indhold', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    expect((await fetch(`${base}/api/demo`, json(cookie, {}, 'POST'))).status).toBe(200);
    expect((await fetch(`${base}/api/demo`, json(cookie, {}, 'POST'))).status).toBe(409);
  });

  it('import: forhåndsvisning og validering før erstatning', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const backup = { format: 'ballet-ugeskema-backup', formatVersion: 1, data: demoAppData() };
    const preview = await (await fetch(`${base}/api/import/preview`, json(cookie, backup, 'POST'))).json();
    expect(preview.ok).toBe(true);
    expect(preview.incoming.blocks).toBe(demoAppData().blocks.length);
    expect(preview.current.blocks).toBe(0);
    const bad = await (await fetch(`${base}/api/import/preview`, json(cookie, { hej: 1 }, 'POST'))).json();
    expect(bad.ok).toBe(false);
    const imp = await fetch(`${base}/api/import`, json(cookie, { baseVersion: 1, backup }, 'POST'));
    expect(imp.status).toBe(200);
    const exp = await (await fetch(`${base}/api/export`, { headers: { cookie } })).json();
    expect(exp.format).toBe('ballet-ugeskema-backup');
    expect(exp.data.blocks.length).toBe(demoAppData().blocks.length);
  });

  it('afviser skrivning fra fremmed oprindelse og ikke-JSON', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const res = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie, origin: 'https://ondsindet.example' },
      body: JSON.stringify({ baseVersion: 1, data: demoAppData() }),
    });
    expect(res.status).toBe(403);
    const form = await fetch(`${base}/api/data`, { method: 'PUT', headers: { 'content-type': 'text/plain', cookie }, body: 'x' });
    expect(form.status).toBe(415);
  });

  it('skift af adgangskode gør gamle logins ugyldige', async () => {
    const first = await start({ ADMIN_PASSWORD: 'gammelt-kodeord' });
    const { cookie } = await login(first.base, 'gammelt-kodeord');
    expect((await fetch(`${first.base}/api/data`, { headers: { cookie } })).status).toBe(200);
    servers.pop()!.close();
    const second = await start({ ADMIN_PASSWORD: 'nyt-kodeord-123' }, first.file);
    expect((await fetch(`${second.base}/api/data`, { headers: { cookie } })).status).toBe(401);
  });

  it('en læse-cookie kan ikke ændres til administrator', async () => {
    const { base } = await start({ VIEWER_PASSWORD: 'kig' });
    const { cookie } = await login(base, 'kig');
    const [name, value] = cookie.split('=');
    const [payload, sig] = value.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), r: 'admin' })).toString('base64url');
    expect((await fetch(`${base}/api/data`, { headers: { cookie: `${name}=${forged}.${sig}` } })).status).toBe(401);
  });

  it('login spærres efter 20 forkerte forsøg, ikke før', async () => {
    const { base } = await start();
    for (let i = 0; i < 19; i++) expect((await login(base, 'forkert')).res.status).toBe(401);
    expect((await login(base)).res.status).toBe(200);
    for (let i = 0; i < 20; i++) await login(base, 'forkert');
    expect((await login(base)).res.status).toBe(429);
  });

  it('tidligere versioner kan listes og hentes', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data: demoAppData() }));
    const list = await (await fetch(`${base}/api/revisions`, { headers: { cookie } })).json();
    expect(list.map((r: { version: number }) => r.version)).toEqual([2, 1]);
    expect(list[0].blocks).toBe(demoAppData().blocks.length);
    const rev1 = await (await fetch(`${base}/api/revisions/1`, { headers: { cookie } })).json();
    expect(rev1.data.blocks).toEqual([]);
    expect((await fetch(`${base}/api/revisions/999`, { headers: { cookie } })).status).toBe(404);
    expect((await fetch(`${base}/api/revisions/1`)).status).toBe(401);
  });

  it('sender sikkerhedsheadere og danske fejlbeskeder', async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/session`);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const { cookie } = await login(base);
    const bad = await (await fetch(`${base}/api/data`, json(cookie, { baseVersion: 1, data: {} }))).json();
    expect(bad.errors.join(' ')).not.toMatch(/Invalid input|expected/);
  });

  it('daglig backup af databasen', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugeskema-bak-'));
    const { Store } = await import('../../server/db');
    const store = new Store(path.join(dir, 'db.sqlite'));
    const file = await store.backupTo(path.join(dir, 'backups'), 2);
    expect(file && fs.existsSync(file)).toBe(true);
    expect(await store.backupTo(path.join(dir, 'backups'), 2)).toBeNull(); // kun én pr. dag
    expect(store.integrityCheck()).toBe('ok');
    store.close();
  });

  it('migrerer gamle data ved opstart uden at slette noget', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugeskema-mig-'));
    const file = path.join(dir, 'db.sqlite');
    const Database = (await import('better-sqlite3')).default;
    const raw = new Database(file);
    raw.exec('CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE revisions (version INTEGER PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL); CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const v1 = {
      schemaVersion: 1,
      teachers: [{ id: 't1', initials: 'TH', name: '', color: '#f9c6c9', annualHours: 1600, archived: false }],
      subjects: [{ id: 's1', name: 'Klassisk ballet', archived: false }],
      groups: [{ id: 'g6', name: 'Hold 6', archived: false }],
      rooms: [...Array.from({ length: 7 }, (_, i) => ({ id: `room-${i + 1}`, name: `Sal ${i + 1}` })), { id: 'room-gym', name: 'Motionsrum' }],
      blocks: [{ id: 'b1', subjectId: 's1', groupId: 'g6', teacherIds: ['t1'], day: 0, roomId: 'room-1', start: 490, end: 595, note: '' }],
      settings: { prepPercent: 25, saturdayPercent: 50, prepBasis: 'actual', teachingWeeks: 36, daypartStarts: [600, 780, 1080] },
    };
    raw.prepare('INSERT INTO app_state VALUES (1, 7, ?, ?)').run(JSON.stringify(v1), new Date().toISOString());
    raw.prepare('INSERT INTO revisions VALUES (7, ?, ?, ?)').run(JSON.stringify(v1), new Date().toISOString(), 'edit');
    raw.close();
    const { base } = await start({}, file);
    const { cookie } = await login(base);
    const s = await (await fetch(`${base}/api/data`, { headers: { cookie } })).json();
    expect(s.version).toBe(8);
    expect(s.data.schemaVersion).toBe(3);
    expect(s.data.blocks[0]).toMatchObject({ id: 'b1', title: 'Klassisk ballet', groupIds: ['g6'], timeMode: 'rule' });
    expect(s.data.timeRules.length).toBeGreaterThan(50);
    const revs = await (await fetch(`${base}/api/revisions`, { headers: { cookie } })).json();
    expect(revs.map((r: { source: string }) => r.source).slice(0, 2)).toEqual(['migration', 'edit']);
  });

  it('import af en gammel backup migreres før validering', async () => {
    const { base } = await start();
    const { cookie } = await login(base);
    const old = { schemaVersion: 1, teachers: [], subjects: [], groups: [], rooms: [...Array.from({ length: 7 }, (_, i) => ({ id: `room-${i + 1}`, name: `Sal ${i + 1}` })), { id: 'room-gym', name: 'Motionsrum' }], blocks: [], settings: { prepPercent: null, saturdayPercent: null, prepBasis: 'actual', teachingWeeks: null, daypartStarts: [600, 780, 1080] } };
    const preview = await (await fetch(`${base}/api/import/preview`, json(cookie, old, 'POST'))).json();
    expect(preview.ok).toBe(true);
  });

  it('demotilstand bruger sin egen databasefil', () => {
    const c = loadConfig({ DEMO_MODE: '1', DATA_DIR: '/tmp/x' });
    expect(c.dbFile).toBe('/tmp/x/demo.sqlite');
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/ADMIN_PASSWORD/);
  });
});
