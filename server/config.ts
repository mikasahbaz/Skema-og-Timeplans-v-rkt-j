import path from 'node:path';

export interface Config {
  port: number;
  dbFile: string;
  adminPassword: string;
  viewerPassword: string | null;
  sessionSecret: string | null;
  demoMode: boolean;
  cookieSecure: boolean;
  trustProxy: boolean;
  production: boolean;
  staticDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const demoMode = env.DEMO_MODE === '1' || env.DEMO_MODE === 'true';
  const dataDir = path.resolve(env.DATA_DIR ?? 'data');
  // Demotilstand bruger altid sin egen databasefil, så produktionsdata aldrig berøres.
  const dbFile = env.DB_FILE
    ? path.resolve(env.DB_FILE)
    : path.join(dataDir, demoMode ? 'demo.sqlite' : 'ugeskema.sqlite');

  let adminPassword = env.ADMIN_PASSWORD ?? '';
  if (!adminPassword) {
    if (production && !demoMode) {
      throw new Error('ADMIN_PASSWORD skal være sat i produktion (NODE_ENV=production).');
    }
    adminPassword = 'admin';
    console.warn('[ugeskema] ADMIN_PASSWORD er ikke sat – bruger udviklingsadgangskoden "admin".');
  }
  if (production && !demoMode && adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD skal have mindst 8 tegn i produktion.');
  }

  return {
    port: Number(env.PORT ?? 3000),
    dbFile,
    adminPassword,
    viewerPassword: env.VIEWER_PASSWORD || null,
    sessionSecret: env.SESSION_SECRET || null,
    demoMode,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    production,
    staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : null,
  };
}
