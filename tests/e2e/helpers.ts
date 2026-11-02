import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { emptyAppData, type AppData, type Block } from '../../shared/schema';
import { withSourceRules } from '../../shared/source/index';

export const ADMIN_PW = 'e2e-admin-pw';
export const VIEWER_PW = 'e2e-viewer';

/** KDS-tidsreglerne + testopsætningen fra kravene: p = 25 %, s = 50 %, W = 36, A(TH) = 1600. */
export function fixture(blocks: Block[] = []): AppData {
  const d = withSourceRules(emptyAppData());
  d.settings = { ...d.settings, prepPercent: 25, saturdayPercent: 50, teachingWeeks: 36 };
  d.teachers = [
    { id: 'th', initials: 'TH', name: '', color: '#f9c6c9', annualHours: 1600, archived: false },
    { id: 'co', initials: 'CO', name: '', color: '#bfe3c6', annualHours: null, archived: false },
    { id: 'fm', initials: 'FM', name: '', color: '#c7d7f5', annualHours: 1500, archived: false },
    { id: 'hc', initials: 'HC', name: '', color: '#fde1a9', annualHours: null, archived: false },
  ];
  d.blocks = blocks;
  return d;
}

/** Hold-id som kilden opretter dem: "Hold 8" → "g-hold-8". */
export const g = (name: string) => `g-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** En regelklasse med kildens tid. */
export function ruleBlock(d: AppData, over: Partial<Block> & { groupIds: string[]; day: number; period: number }): Block {
  const r = d.timeRules.find((x) => x.day === over.day && x.period === over.period && x.groupIds.join() === over.groupIds.join());
  if (!r) throw new Error('Ingen regel i fixture');
  return { id: 'b1', title: 'Balletklasse', teacherIds: ['th'], roomId: 'room-1', note: '', timeMode: 'rule', ruleId: r.id, start: r.start, end: r.end, ...over };
}

export async function resetData(request: APIRequestContext, data: AppData) {
  const login = await request.post('/api/login', { data: { password: ADMIN_PW } });
  expect(login.ok()).toBeTruthy();
  const current = await (await request.get('/api/data')).json();
  const res = await request.put('/api/data', { data: { baseVersion: current.version, data } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export async function loginAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Adgangskode').fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Log ind' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}

export const cell = (page: Page, day: number, period: number, room: string) => page.locator(`[data-cell="cell|${day}|${period}|${room}"]`);
export const teacherRow = (page: Page, initials: string) => page.locator('.hours-list li', { has: page.locator('.chip', { hasText: new RegExp(`^${initials}$`) }) });
export const blockEl = (page: Page, id: string) => page.locator(`[data-block-id="${id}"]`);

/** Åbner lærerens linje i timeoptællingen og returnerer detaljerne. */
export async function teacherDetail(page: Page, initials: string) {
  const row = teacherRow(page, initials);
  if (!(await row.locator('.hours-detail').count())) await row.locator('.hours-row').click();
  return row.locator('.hours-detail');
}

export async function waitSaved(page: Page) {
  await expect(page.locator('.save')).toHaveText(/Gemt/, { timeout: 8000 });
}

/** Træk med mus: langsomme bevægelser, så dnd-kit registrerer aktivering og målcelle. */
export async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { alt?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
}

type Loc = ReturnType<Page['locator']>;

/** Ruller skemaet, så både kilde og mål er synlige, og returnerer deres koordinater. */
export async function dragPoints(page: Page, src: Loc, dst: Loc) {
  await src.scrollIntoViewIfNeeded();
  const a = (await src.boundingBox())!;
  const b = (await dst.boundingBox())!;
  const mid = (a.y + b.y + b.height) / 2;
  await page.locator('.board-scroll').evaluate((el, m) => {
    const r = el.getBoundingClientRect();
    el.scrollTop += m - (r.top + r.height / 2) + 40;
  }, mid);
  await page.waitForTimeout(50);
  const a2 = (await src.boundingBox())!;
  const b2 = (await dst.boundingBox())!;
  return {
    from: { x: a2.x + a2.width / 2, y: a2.y + Math.min(a2.height / 2, 20) },
    to: { x: b2.x + b2.width / 2, y: b2.y + Math.min(b2.height / 2, 30) },
  };
}

/** Træk en klasse til en celle med musen. */
export async function dragTo(page: Page, src: Loc, dst: Loc, opts: { alt?: boolean } = {}) {
  const p = await dragPoints(page, src, dst);
  await mouseDrag(page, p.from, p.to, opts);
}

/** Flyt via klassens panel (Flyt → tryk på målcelle) – samme vej som tastatur og touch uden træk. */
export async function moveVia(page: Page, src: Loc, dst: Loc) {
  await src.click();
  await page.getByRole('button', { name: 'Flyt' }).click();
  await dst.locator('.place-target').click();
}
