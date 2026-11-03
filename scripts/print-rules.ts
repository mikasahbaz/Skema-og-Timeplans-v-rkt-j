// Skriver tidstabellen fra kilden som Markdown (docs/tidstabel-kds.md).
import { writeFileSync } from 'node:fs';
import { demoAppData } from '../shared/demo';
import { DAY_NAMES, PERIOD_NAMES } from '../shared/schema';
import { SOURCE_ISSUES, SOURCE_NAME } from '../shared/source/index';
import { formatRange } from '../shared/time';

const d = demoAppData();
const name = (id: string) => d.groups.find((g) => g.id === id)?.name ?? id;
const a = d.settings.assembly;
let md = `# Tidstabel fra skemadokumentet\n\nKilde: ${SOURCE_NAME}. Genereret af \`npx tsx scripts/print-rules.ts\`.\n\n`;
md += `${d.timeRules.length} tidsregler. Kun tider, der står i kilden, er med. En tom celle giver ingen regel.\n\n`;
for (let day = 0; day < 6; day++) {
  md += `## ${DAY_NAMES[day]}\n\n| Dagdel | Hold | Tid | Variant | Kilde |\n|---|---|---|---|---|\n`;
  for (const r of d.timeRules.filter((x) => x.day === day))
    md += `| ${PERIOD_NAMES[r.period]} | ${r.groupIds.map(name).join(' + ')} | ${formatRange(r.start, r.end)} | ${r.label || '–'} | ${r.source}${r.note ? ' (÷ p)' : ''} |\n`;
  md += '\n';
}
md += `## Standardtider (bruges, når holdet ikke har sin egen tid i dagdelen)\n\n| Dag | ${PERIOD_NAMES.join(' | ')} |\n|---|---|---|---|---|\n`;
d.settings.standardTimes.forEach((row, day) => {
  md += `| ${DAY_NAMES[day]} | ${row.map((s) => (s ? formatRange(s.start, s.end) : '–')).join(' | ')} |\n`;
});
md += '\n';
md += `## Morgensamling\n\n${DAY_NAMES[a.day]} ${formatRange(a.start, a.end)} · ${a.groupIds.map(name).join(', ')} · ${a.location} · kilde ${a.source}\n\n## Spørgsmål og usikkerheder\n\n`;
for (const i of SOURCE_ISSUES) md += `- **${i.ref}:** ${i.text}\n`;
writeFileSync('docs/tidstabel-kds.md', md);
console.log('docs/tidstabel-kds.md skrevet');
