import { validateAppData } from '../shared/validate.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, store } = createApp(config);

// Opstartskontrol: databasens integritet og at de gemte data er gyldige.
const integrity = store.integrityCheck();
if (integrity !== 'ok') console.error(`[ugeskema] ADVARSEL: databasens integritetskontrol fejlede: ${integrity}`);
const current = store.get();
const valid = validateAppData(current.data);
if (!valid.ok) console.error(`[ugeskema] ADVARSEL: gemte data (version ${current.version}) er ugyldige:`, valid.errors.slice(0, 5));

// Daglig kopi af databasen (beholder de seneste BACKUP_KEEP dage).
async function backup() {
  if (!config.backupDir) return;
  try {
    const file = await store.backupTo(config.backupDir, config.backupKeep);
    if (file) console.log(`[ugeskema] Backup gemt: ${file}`);
  } catch (e) {
    console.error('[ugeskema] Backup mislykkedes:', e);
  }
}
void backup();
const backupTimer = setInterval(() => void backup(), 60 * 60 * 1000);
backupTimer.unref();

const server = app.listen(config.port, () => {
  console.log(
    `[ugeskema] Kører på http://localhost:${config.port}  (database: ${config.dbFile}${config.demoMode ? ', DEMOTILSTAND' : ''})`,
  );
});

function shutdown() {
  clearInterval(backupTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  // Luk alligevel efter 10 s, hvis forbindelser hænger.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
