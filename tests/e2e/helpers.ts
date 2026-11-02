import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { emptyAppData, type AppData, type Block } from '../../shared/schema';

export const ADMIN_PW = 'e2e-admin-pw';
export const VIEWER_PW = 'e2e-viewer';

/** Testopsætningen fra kravene: p = 25 %, s = 50 %, W = 36, A(TH) = 1600. */
export function fixture(blocks: Block[] = []): AppData {
  const d = emptyAppData();
  d.settings = { ...d.settings, prepPercent: 25, saturdayPercent: 50, teachingWeeks: 36 };
  d.teachers = [
    { id: 'th', initials: 'TH', name: '', color: '#f9c6c9', annualHours: 1600, archived: false },
    { id: 'co', initials: 'CO', name: '', color: '#bfe3c6', annualHours: null, archived: false },
    { id: 'ml', initials: 'ML', name: '', color: '#c7d7f5', annualHours: 1500, archived: false },
  ];
  d.subjects = [
    { id: 'kb', name: 'Klassisk ballet', archived: false },
    { id: 'rep', name: 'Repertoire', archived: false },
  ];
  d.groups = [
    { id: 'h3', name: 'Hold 3', archived: false },
    { id: 'h4', name: 'Hold 4', archived: false },
  ];
  d.blocks = blocks;
  return d;
}

export const blk = (over: Partial<Block>): Block => ({
  id: 'b1', subjectId: 'kb', groupId: 'h3', teacherIds: ['th'], day: 0, roomId: 'room-1', start: 540, end: 660, note: '', ...over,
});

/** Erstatter serverens data direkte via API'et (deterministisk udgangspunkt for hver test). */
export async function resetData(request: APIRequestContext, data: AppData) {
  const login = await request.post('/api/login', { data: { password: ADMIN_PW } });
  expect(login.ok()).toBeTruthy();
  const current = await (await request.get('/api/data')).json();
  const res = await request.put('/api/data', { data: { baseVersion: current.version, data } });
  expect(res.ok()).toBeTruthy();
}

export async function loginAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Adgangskode').fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Log ind' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}

export const cell = (page: Page, day: number, daypart: number, room: string) => page.locator(`[data-cell="cell|${day}|${daypart}|${room}"]`);
export const teacherRow = (page: Page, initials: string) => page.locator('.hours-table tbody tr', { hasText: initials });

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

export async function center(page: Page, selector: Loc) {
  await selector.scrollIntoViewIfNeeded();
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 20) };
}

/** Ruller skemaet, så både kilde og mål er synlige, og returnerer deres koordinater. */
export async function dragPoints(page: Page, src: Loc, dst: Loc) {
  await src.scrollIntoViewIfNeeded();
  const a = (await src.boundingBox())!;
  const b = (await dst.boundingBox())!;
  const mid = (a.y + b.y + b.height) / 2;
  await page.locator('.grid-scroll').evaluate((el, m) => {
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
