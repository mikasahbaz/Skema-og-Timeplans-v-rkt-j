import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app, store } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(
    `[ugeskema] Kører på http://localhost:${config.port}  (database: ${config.dbFile}${config.demoMode ? ', DEMOTILSTAND' : ''})`,
  );
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
