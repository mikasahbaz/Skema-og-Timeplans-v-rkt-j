import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.PORT ?? 3000);

// Prøveudgaven (VITE_STANDALONE=1) har ingen server og bygges med relative stier.
const standalone = process.env.VITE_STANDALONE === '1';

export default defineConfig({
  root: 'client',
  base: standalone ? './' : '/',
  plugins: [react()],
  build: { outDir: standalone ? '../dist/standalone' : '../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
});
