import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { STANDALONE } from './api';
import { installStandaloneServer } from './standalone';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';

function boot() {
  // Prøveudgaven har ingen server: API'et besvares i browseren (se standalone.ts).
  if (STANDALONE) installStandaloneServer();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
