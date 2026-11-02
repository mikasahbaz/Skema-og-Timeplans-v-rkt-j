// Samler prøveudgaven (dist/standalone) til én HTML-fil uden eksterne filer:
// dist/standalone/ugeskema-proeve.html. Bruges til en delbar prøveversion uden server.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist/standalone');
const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
// Skrifttyper indlejres som data-URI'er, så filen ikke henter noget udefra.
const inlineFonts = (cssText, cssDir) =>
  cssText.replace(/url\(\.\/([^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(path.join(cssDir, f)).toString('base64')})`);
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) =>
  inlineFonts(readFileSync(path.join(dir, m[1]), 'utf8'), path.dirname(path.join(dir, m[1]))),
);
const js = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"/g)].map((m) => readFileSync(path.join(dir, m[1]), 'utf8'));
if (js.length !== 1) throw new Error(`Forventede ét script, fandt ${js.length}`);
// "</script" i koden ville afslutte script-tagget for tidligt.
const safeJs = js[0].replace(/<\/script/gi, '<\\/script');
const out = `<title>Balletskolens ugeskema</title>
<style>
${css.join('\n')}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;
writeFileSync(path.join(dir, 'ugeskema-proeve.html'), out);
console.log(`Skrev ${path.join(dir, 'ugeskema-proeve.html')} (${Math.round(out.length / 1024)} KB)`);
