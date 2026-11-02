// Faste pastelfarver til lærere. En ny lærer får den første ledige farve; når paletten er
// opbrugt, vælges farven med størst afstand i nuance til de eksisterende. Farven gemmes.

export const TEACHER_PALETTE = [
  '#f9c6c9', // rosa
  '#bfe3c6', // mint
  '#c7d7f5', // lyseblå
  '#fde1a9', // abrikos
  '#dccbf2', // lavendel
  '#b8e6e1', // turkis
  '#f6c9e4', // pink
  '#e3eba8', // lime
  '#f8d2b4', // fersken
  '#c4e1f2', // himmel
  '#e9d5c3', // sand
  '#cfe8b4', // æble
  '#ebc3d8', // mauve
  '#b9d9d0', // salvie
  '#f3e3a3', // citron
  '#d6d0f0', // syren
] as const;

function hue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function nextTeacherColor(used: string[]): string {
  const usedSet = new Set(used.map((c) => c.toLowerCase()));
  const free = TEACHER_PALETTE.find((c) => !usedSet.has(c));
  if (free) return free;
  // Paletten er brugt: generér en pastel med størst nuanceafstand.
  const hues = used.map(hue);
  let best = 0;
  let bestDist = -1;
  for (let h = 0; h < 360; h += 7) {
    const dist = Math.min(...hues.map((u) => Math.min(Math.abs(u - h), 360 - Math.abs(u - h))));
    if (dist > bestDist) {
      bestDist = dist;
      best = h;
    }
  }
  return hslToHex(best, 0.65, 0.84);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** Mørkere udgave af en pastelfarve til kanter og initialmærker. */
export function deepen(hex: string, amount = 0.45): string {
  const ch = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount));
  return `#${[1, 3, 5].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`;
}
