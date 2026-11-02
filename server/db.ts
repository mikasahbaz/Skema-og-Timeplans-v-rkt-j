// Vedvarende lagring i SQLite. Hele appens data er ét versioneret JSON-dokument;
// hver lagring øger versionen og gemmer en revision (til gendannelse ved uheld).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { emptyAppData, type AppData } from '../shared/schema.js';

const MAX_REVISIONS = 500;

export interface StoredState {
  version: number;
  updatedAt: string;
  data: AppData;
}

export type SaveResult = { ok: true; state: StoredState } | { ok: false; conflict: true; currentVersion: number };

export class Store {
  private db: Database.Database;

  constructor(file: string, seed: () => AppData = emptyAppData) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revisions (
        version INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    const row = this.db.prepare('SELECT version FROM app_state WHERE id = 1').get();
    if (!row) {
      const now = new Date().toISOString();
      const json = JSON.stringify(seed());
      this.db.prepare('INSERT INTO app_state (id, version, data, updated_at) VALUES (1, 1, ?, ?)').run(json, now);
      this.db.prepare('INSERT INTO revisions (version, data, created_at, source) VALUES (1, ?, ?, ?)').run(json, now, 'init');
    }
  }

  get(): StoredState {
    const row = this.db.prepare('SELECT version, data, updated_at FROM app_state WHERE id = 1').get() as {
      version: number;
      data: string;
      updated_at: string;
    };
    return { version: row.version, updatedAt: row.updated_at, data: JSON.parse(row.data) as AppData };
  }

  getVersion(): { version: number; updatedAt: string } {
    const row = this.db.prepare('SELECT version, updated_at FROM app_state WHERE id = 1').get() as {
      version: number;
      updated_at: string;
    };
    return { version: row.version, updatedAt: row.updated_at };
  }

  /** Gemmer kun, hvis baseVersion er den aktuelle version (optimistisk låsning). */
  save(baseVersion: number, data: AppData, source = 'edit'): SaveResult {
    const tx = this.db.transaction((): SaveResult => {
      const current = this.getVersion().version;
      if (current !== baseVersion) return { ok: false, conflict: true, currentVersion: current };
      const version = current + 1;
      const now = new Date().toISOString();
      const json = JSON.stringify(data);
      this.db.prepare('UPDATE app_state SET version = ?, data = ?, updated_at = ? WHERE id = 1').run(version, json, now);
      this.db.prepare('INSERT INTO revisions (version, data, created_at, source) VALUES (?, ?, ?, ?)').run(version, json, now, source);
      this.db.prepare('DELETE FROM revisions WHERE version <= ?').run(version - MAX_REVISIONS);
      return { ok: true, state: { version, updatedAt: now, data } };
    });
    return tx.immediate();
  }

  revisions(limit = 50) {
    return this.db
      .prepare(
        `SELECT version, created_at AS createdAt, source,
                json_array_length(data, '$.blocks') AS blocks, json_array_length(data, '$.teachers') AS teachers
         FROM revisions ORDER BY version DESC LIMIT ?`,
      )
      .all(limit) as { version: number; createdAt: string; source: string; blocks: number; teachers: number }[];
  }

  /** Indholdet af en tidligere version (til gendannelse). */
  revision(version: number): { version: number; createdAt: string; data: AppData } | null {
    const row = this.db.prepare('SELECT version, created_at, data FROM revisions WHERE version = ?').get(version) as
      | { version: number; created_at: string; data: string }
      | undefined;
    return row ? { version: row.version, createdAt: row.created_at, data: JSON.parse(row.data) as AppData } : null;
  }

  /** SQLite's egen integritetskontrol. Returnerer 'ok' eller en beskrivelse af problemet. */
  integrityCheck(): string {
    const rows = this.db.pragma('quick_check') as { quick_check: string }[];
    return rows.map((r) => r.quick_check).join('; ');
  }

  /**
   * Konsistent kopi af databasen (SQLite online backup) til `dir`, én fil pr. dag.
   * Beholder de nyeste `keep` filer. Returnerer stien eller null, hvis dagens kopi findes.
   */
  async backupTo(dir: string, keep: number): Promise<string | null> {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `ugeskema-${new Date().toISOString().slice(0, 10)}.sqlite`);
    if (fs.existsSync(file)) return null;
    await this.db.backup(`${file}.tmp`);
    fs.renameSync(`${file}.tmp`, file);
    const old = fs
      .readdirSync(dir)
      .filter((f) => /^ugeskema-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort()
      .reverse()
      .slice(keep);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
    return file;
  }

  /** Hemmelighed til signering af sessioner; genereres én gang og gemmes. */
  sessionSecret(): string {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'session_secret'").get() as { value: string } | undefined;
    if (row) return row.value;
    const value = crypto.randomBytes(32).toString('hex');
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('session_secret', ?)").run(value);
    return value;
  }

  close() {
    this.db.close();
  }
}
