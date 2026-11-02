// HTTP-API. Alle skrivninger kræver administratorsession og valideres fuldt før lagring.
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { demoAppData } from '../shared/demo.js';
import { migrateAny } from '../shared/migrate.js';
import { publicProjection } from '../shared/public.js';
import type { AppData } from '../shared/schema.js';
import { validateAppData } from '../shared/validate.js';
import { LoginLimiter, safeEqual, Sessions, type Role } from './auth.js';
import type { Config } from './config.js';
import { Store } from './db.js';

export const BACKUP_FORMAT = 'ballet-ugeskema-backup';

export { publicProjection };

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function summarize(data: AppData) {
  return {
    blocks: data.blocks.length,
    teachers: data.teachers.length,
    rules: data.timeRules.length,
    groups: data.groups.length,
  };
}

/** Accepterer både backupformatet og et rent AppData-dokument. */
function unwrapBackup(body: unknown): unknown {
  if (body && typeof body === 'object' && (body as { format?: unknown }).format === BACKUP_FORMAT) {
    return (body as { data?: unknown }).data;
  }
  return body;
}

export function createApp(config: Config, store?: Store) {
  const db = store ?? new Store(config.dbFile, config.demoMode ? demoAppData : undefined);
  const migration = db.migrate();
  if (migration) console.log(`[ugeskema] Data migreret fra version ${migration.from}: ${migration.matched} klasser knyttet til tidsregler, ${migration.custom} beholder egne tider.`);
  const sessions = new Sessions(
    config.sessionSecret ?? db.sessionSecret(),
    { admin: config.adminPassword, viewer: config.viewerPassword },
    config.cookieSecure,
  );
  const limiter = new LoginLimiter();
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Kun egne scripts; inline-styles bruges til lærerfarver.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
        "font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });

  // API-svar må ikke caches; skriveforespørgsler skal være JSON fra samme oprindelse.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'Forventede JSON' });
      const origin = req.headers.origin;
      if (origin && hostOf(origin) !== req.headers.host) {
        return res.status(403).json({ error: 'Forespørgslen kom fra en anden oprindelse' });
      }
    }
    next();
  });
  app.use('/api', express.json({ limit: '5mb' }));

  const role = (req: Request): Role | null => sessions.read(req);
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const r = role(req);
    if (r === 'admin') return next();
    res.status(r ? 403 : 401).json({ error: r ? 'Kun administrator kan redigere' : 'Log ind som administrator' });
  };
  const requireReader = (req: Request, res: Response, next: NextFunction) => {
    if (!config.viewerPassword || role(req)) return next();
    res.status(401).json({ error: 'Log ind for at se skemaet' });
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: db.getVersion().version });
  });

  app.get('/api/session', (req, res) => {
    res.json({ role: role(req), demo: config.demoMode, viewerPasswordRequired: Boolean(config.viewerPassword) });
  });

  app.post('/api/login', (req, res) => {
    const ip = req.ip ?? 'ukendt';
    if (limiter.blocked(ip)) return res.status(429).json({ error: 'For mange forsøg. Vent nogle minutter.' });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    let granted: Role | null = null;
    if (password && safeEqual(password, config.adminPassword)) granted = 'admin';
    else if (password && config.viewerPassword && safeEqual(password, config.viewerPassword)) granted = 'viewer';
    if (!granted) {
      limiter.fail(ip);
      return res.status(401).json({ error: 'Forkert adgangskode' });
    }
    limiter.reset(ip);
    sessions.issue(res, granted);
    res.json({ role: granted });
  });

  app.post('/api/logout', (_req, res) => {
    sessions.clear(res);
    res.json({ role: null });
  });

  // ---- Læsning -----------------------------------------------------------
  app.get('/api/version', requireReader, (_req, res) => {
    res.json(db.getVersion());
  });

  app.get('/api/schedule', requireReader, (_req, res) => {
    const s = db.get();
    res.json({ version: s.version, updatedAt: s.updatedAt, data: publicProjection(s.data) });
  });

  app.get('/api/data', requireAdmin, (_req, res) => {
    res.json(db.get());
  });

  // ---- Skrivning ---------------------------------------------------------
  app.put('/api/data', requireAdmin, (req, res) => {
    const { baseVersion, data } = req.body ?? {};
    if (!Number.isInteger(baseVersion)) return res.status(400).json({ error: 'baseVersion mangler', errors: [] });
    const result = validateAppData(data);
    if (!result.ok) return res.status(400).json({ error: 'Ugyldige data', errors: result.errors });
    const saved = db.save(baseVersion, result.data!);
    if (!saved.ok) {
      return res.status(409).json({ error: 'Skemaet er ændret et andet sted', currentVersion: saved.currentVersion });
    }
    res.json({ version: saved.state.version, updatedAt: saved.state.updatedAt });
  });

  app.get('/api/export', requireAdmin, (_req, res) => {
    const s = db.get();
    const stamp = s.updatedAt.slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="ugeskema-backup-${stamp}.json"`);
    res.json({ format: BACKUP_FORMAT, formatVersion: 1, exportedAt: new Date().toISOString(), version: s.version, data: s.data });
  });

  app.post('/api/import/preview', requireAdmin, (req, res) => {
    const result = validateAppData(migrateAny(unwrapBackup(req.body)).data);
    const current = db.get();
    res.json({
      ok: result.ok,
      errors: result.errors,
      incoming: result.ok ? summarize(result.data!) : null,
      current: summarize(current.data),
      currentVersion: current.version,
    });
  });

  app.post('/api/import', requireAdmin, (req, res) => {
    const { baseVersion, backup } = req.body ?? {};
    if (!Number.isInteger(baseVersion)) return res.status(400).json({ error: 'baseVersion mangler', errors: [] });
    const result = validateAppData(migrateAny(unwrapBackup(backup)).data);
    if (!result.ok) return res.status(400).json({ error: 'Filen er ikke en gyldig backup', errors: result.errors });
    const saved = db.save(baseVersion, result.data!, 'import');
    if (!saved.ok) return res.status(409).json({ error: 'Skemaet er ændret et andet sted', currentVersion: saved.currentVersion });
    res.json({ version: saved.state.version, updatedAt: saved.state.updatedAt });
  });

  /** Demodata indlæses kun i demotilstand eller i et helt tomt skema (produktionsdata beskyttes). */
  app.post('/api/demo', requireAdmin, (req, res) => {
    const current = db.get();
    const d = current.data;
    // Tomt = ingen klasser og ingen lærere (tidstabel og hold fra kilden må gerne findes).
    const empty = d.blocks.length === 0 && d.teachers.length === 0;
    if (!config.demoMode && !empty) {
      return res.status(409).json({ error: 'Eksempeldata kan kun indlæses i et tomt skema eller i demotilstand.' });
    }
    const baseVersion = Number.isInteger(req.body?.baseVersion) ? req.body.baseVersion : current.version;
    const saved = db.save(baseVersion, demoAppData(), 'demo');
    if (!saved.ok) return res.status(409).json({ error: 'Skemaet er ændret et andet sted', currentVersion: saved.currentVersion });
    res.json({ version: saved.state.version, updatedAt: saved.state.updatedAt });
  });

  app.get('/api/revisions', requireAdmin, (_req, res) => {
    res.json(db.revisions());
  });

  app.get('/api/revisions/:version', requireAdmin, (req, res) => {
    const version = Number(req.params.version);
    const rev = Number.isInteger(version) ? db.revision(version) : null;
    if (!rev) return res.status(404).json({ error: 'Versionen findes ikke (længere)' });
    res.json(rev);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ukendt API-adresse' });
  });

  // ---- Statisk klient ----------------------------------------------------
  const staticDir = config.staticDir ?? path.resolve('dist/client');
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ugyldig JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Data er for store' });
    console.error(err);
    res.status(500).json({ error: 'Serverfejl' });
  });

  return { app, store: db };
}
