import { expect, test } from '@playwright/test';
import { blk, cell, dragPoints, fixture, loginAdmin, mouseDrag, resetData, teacherRow, VIEWER_PW, waitSaved } from './helpers';

const A = blk({ id: 'A', day: 0, start: 540, end: 660, teacherIds: ['th'] }); // Mandag 09–11, TH
const B = blk({ id: 'B', day: 5, start: 540, end: 660, teacherIds: ['th', 'co'], groupId: 'h4' }); // Lørdag 09–11, TH + CO

const block = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-block-id="${id}"]`);

test('eksempel A–D vises korrekt i timeoverblikket og fortryd gendanner summerne', async ({ page, request }) => {
  await resetData(request, fixture([A, B]));
  await loginAdmin(page);
  const th = teacherRow(page, 'TH');
  await expect(th).toContainText('4 t'); // U
  await expect(th).toContainText('6 t'); // K
  await expect(th).toContainText('1.384 t'); // rest
  const co = teacherRow(page, 'CO');
  await expect(co).toContainText('3 t 30 min');
  await expect(co).toContainText('mangler'); // CO har ingen årsarbejdstimer
  await expect(page.locator('.totals-line')).toContainText('4 t undervisning i salene');
  await expect(page.locator('.totals-line')).toContainText('6 t lærertimer');

  await th.click();
  const week = page.locator('.week-box');
  await expect(week.locator('.stat', { hasText: 'Forberedelsestid' })).toContainText('1 t');
  await expect(week.locator('.stat', { hasText: 'Lørdagstillæg' })).toContainText('1 t');
  await expect(page.locator('.year-box .stat', { hasText: 'Planlagt' })).toContainText('216 t');

  // Eksempel D: grundlag inkl. lørdagstillæg → lørdagsblok 3 t 45 min pr. lærer
  await page.getByRole('button', { name: 'Ret satser' }).click();
  await page.getByText('Undervisning inkl. lørdagstillæg').click();
  await page.getByRole('button', { name: 'Luk' }).first().click();
  await expect(teacherRow(page, 'CO')).toContainText('3 t 45 min');
  await expect(teacherRow(page, 'TH')).toContainText('6 t 15 min');

  await page.keyboard.press('Control+z');
  await expect(teacherRow(page, 'CO')).toContainText('3 t 30 min');
  await expect(teacherRow(page, 'TH')).toContainText('6 t');
  await waitSaved(page);
});

test('opret blok fra tom celle; bevaret efter genindlæsning og synlig i læsevisning i anden session', async ({ page, request, browser }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  const target = cell(page, 0, 0, 'room-1');
  await target.click({ position: { x: 20, y: 20 } });
  const dialog = page.getByRole('dialog', { name: 'Ny blok' });
  await dialog.getByLabel('Fag').selectOption({ label: 'Klassisk ballet' });
  await dialog.getByLabel('Hold').selectOption({ label: 'Hold 3' });
  await dialog.getByRole('button', { name: 'TH' }).click();
  await dialog.getByLabel('Start').fill('08.10');
  await dialog.getByLabel('Slut').fill('09.50');
  await expect(dialog.locator('.duration-out')).toContainText('1 t 40 min');
  await dialog.getByRole('button', { name: 'Opret' }).click();
  await expect(target.locator('.block')).toContainText('08.10–09.50');
  await expect(teacherRow(page, 'TH')).toContainText('1 t 40 min');
  await waitSaved(page);

  await page.reload();
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('08.10–09.50');

  const ctx = await browser.newContext();
  const viewer = await ctx.newPage();
  await viewer.goto('/');
  await viewer.getByLabel('Adgangskode').fill(VIEWER_PW);
  await viewer.getByRole('button', { name: 'Log ind' }).click();
  await expect(viewer.locator('.block')).toContainText('Klassisk ballet');
  await expect(viewer.getByText('Timeoverblik')).toHaveCount(0);
  expect(await viewer.content()).not.toContain('1.600');
  await ctx.close();
});

test('afviser ugyldigt tidsinterval og manglende felter', async ({ page, request }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  await cell(page, 1, 1, 'room-2').click({ position: { x: 20, y: 20 } });
  const dialog = page.getByRole('dialog', { name: 'Ny blok' });
  await dialog.getByLabel('Start').fill('11.00');
  await dialog.getByLabel('Slut').fill('10.00');
  await dialog.getByRole('button', { name: 'Opret' }).click();
  await expect(dialog.locator('.errors')).toContainText('Sluttid skal ligge efter starttid');
  await expect(dialog.locator('.errors')).toContainText('Vælg et fag');
  await expect(dialog.locator('.errors')).toContainText('Vælg mindst én lærer');
  await dialog.getByRole('button', { name: 'Annuller' }).click();
  await expect(page.locator('.block')).toHaveCount(0);
});

test('træk inden for samme dagdel bevarer klokkeslæt; fortryd flytter tilbage', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  { const p = await dragPoints(page, block(page, 'A'), cell(page, 1, 0, 'room-3')); await mouseDrag(page, p.from, p.to); }
  await expect(cell(page, 1, 0, 'room-3').locator('.block')).toContainText('09.00–11.00');
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Flyttet til Tirsdag');
  await page.locator('.toast-action', { hasText: 'Fortryd' }).click();
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('09.00–11.00');
});

test('flytning fredag → lørdag ændrer lørdagstillæg, ikke varighed', async ({ page, request }) => {
  await resetData(request, fixture([blk({ id: 'F', day: 4 })]));
  await loginAdmin(page);
  await teacherRow(page, 'TH').click();
  const L = page.locator('.week-box .stat', { hasText: 'Lørdagstillæg' });
  await expect(L).toContainText('0 min');
  { const p = await dragPoints(page, block(page, 'F'), cell(page, 5, 0, 'room-1')); await mouseDrag(page, p.from, p.to); }
  await expect(cell(page, 5, 0, 'room-1').locator('.block')).toContainText('2 t');
  await expect(L).toContainText('1 t');
  await expect(page.locator('.week-box .stat', { hasText: 'Faktisk undervisningstid' })).toContainText('2 t');
});

test('træk til anden dagdel åbner tidsvælger; annuller bevarer originalen', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  const target = cell(page, 0, 2, 'room-2');
  { const p = await dragPoints(page, block(page, 'A'), target); await mouseDrag(page, p.from, p.to); }
  const picker = page.getByRole('dialog', { name: /Flyt: vælg tid/ });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel('Ny start')).toHaveValue('13.00');
  await expect(picker).toContainText('13.00–15.00');
  await picker.getByRole('button', { name: 'Annuller' }).click();
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('09.00–11.00');

  { const p = await dragPoints(page, block(page, 'A'), target); await mouseDrag(page, p.from, p.to); }
  await picker.getByLabel('Ny start').fill('14.15');
  await picker.getByRole('button', { name: 'Flyt hertil' }).click();
  await expect(target.locator('.block')).toContainText('14.15–16.15');
  await expect(page.locator('.toast')).toContainText('før 09.00–11.00');
});

test('kopiér via menu: nyt id, original bevaret, uafhængig redigering, kopi i samme celle foreslår ny tid', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  await block(page, 'A').getByRole('button', { name: /Handlinger/ }).click();
  await page.getByRole('menuitem', { name: /Kopiér/ }).click();
  await expect(page.locator('.banner-copy')).toBeVisible();
  await cell(page, 2, 0, 'room-2').locator('.place-target').click();
  const copy = cell(page, 2, 0, 'room-2').locator('.block');
  await expect(copy).toContainText('09.00–11.00');
  await expect(block(page, 'A')).toBeVisible();
  const copyId = await copy.getAttribute('data-block-id');
  expect(copyId).not.toBe('A');
  await expect(teacherRow(page, 'TH')).toContainText('4 t');

  await copy.click();
  const dialog = page.getByRole('dialog', { name: 'Rediger blok' });
  await dialog.getByLabel('Hold').selectOption({ label: 'Hold 4' });
  await dialog.getByRole('button', { name: 'Gem' }).click();
  await expect(copy).toContainText('Hold 4');
  await expect(block(page, 'A')).toContainText('Hold 3');

  // Kopi til samme celle: ingen kopi oven på originalen – tidsvælger foreslår efter eksisterende blok
  await block(page, 'A').focus();
  await page.keyboard.press('k');
  await cell(page, 0, 0, 'room-1').locator('.place-target').click();
  const picker = page.getByRole('dialog', { name: /Kopiér: vælg tid/ });
  await expect(picker.getByLabel('Ny start')).toHaveValue('11.00');
  await expect(picker).toContainText('vises i formiddag');
  await picker.getByRole('button', { name: 'Kopiér hertil' }).click();
  await expect(cell(page, 0, 1, 'room-1').locator('.block')).toContainText('11.00–13.00');
  await expect(block(page, 'A')).toContainText('09.00–11.00');
  await expect(page.locator('.btn-conflict')).toHaveCount(0);
  await waitSaved(page);
});

test('konflikt for anden lærer: annuller bevarer, "Behold med konflikt" markerer og tæller med', async ({ page, request }) => {
  const C = blk({ id: 'C', teacherIds: ['co'], roomId: 'room-2', groupId: 'h4', start: 600, end: 720 });
  await resetData(request, fixture([A, C]));
  await loginAdmin(page);
  await expect(teacherRow(page, 'CO')).toContainText('2 t');

  await block(page, 'A').click();
  let dialog = page.getByRole('dialog', { name: 'Rediger blok' });
  await dialog.getByRole('button', { name: 'CO' }).click();
  await expect(dialog.locator('.notice-conflict')).toContainText('Lærer CO');
  await dialog.getByRole('button', { name: 'Gem' }).click();
  const conflict = page.getByRole('dialog', { name: /Konflikt/ });
  await expect(conflict).toContainText('Lærer CO er optaget af Klassisk ballet · Hold 4');
  await conflict.getByRole('button', { name: 'Annuller ændringen' }).click();
  await expect(conflict).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Annuller' }).click();
  await expect(block(page, 'A').locator('.chip')).toHaveCount(1);
  await expect(teacherRow(page, 'CO')).toContainText('2 t');

  await block(page, 'A').click();
  dialog = page.getByRole('dialog', { name: 'Rediger blok' });
  await dialog.getByRole('button', { name: 'CO' }).click();
  await dialog.getByRole('button', { name: 'Gem' }).click();
  await page.getByRole('button', { name: 'Behold med konflikt' }).click();
  await expect(block(page, 'A')).toHaveClass(/block-conflict/);
  await expect(block(page, 'C')).toHaveClass(/block-conflict/);
  await expect(page.locator('.btn-conflict')).toContainText('1');
  await expect(teacherRow(page, 'CO')).toContainText('4 t');
  await expect(page.locator('.panel .notice-conflict')).toContainText('1 konflikt');

  // Fjern CO igen → begge opgørelser opdateres straks
  await block(page, 'A').click();
  dialog = page.getByRole('dialog', { name: 'Rediger blok' });
  await dialog.getByRole('button', { name: 'CO' }).click();
  await dialog.getByRole('button', { name: 'Gem' }).click();
  await expect(teacherRow(page, 'CO')).toContainText('2 t');
  await expect(page.locator('.btn-conflict')).toHaveCount(0);
});

test('tastatur: M + piletast + Enter flytter blokken', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  await block(page, 'A').focus();
  await page.keyboard.press('m');
  await expect(page.locator('.banner-move')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  // Ned = formiddag → tidsvælger; Enter bekræfter forslaget
  const picker = page.getByRole('dialog', { name: /Flyt: vælg tid/ });
  await expect(picker.getByLabel('Ny start')).toHaveValue('10.00');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 1, 'room-2').locator('.block')).toContainText('10.00–12.00');
});

test('fortryd og annuller fortryd af lærerliste gemmes og overlever genindlæsning', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  await block(page, 'A').click();
  const dialog = page.getByRole('dialog', { name: 'Rediger blok' });
  await dialog.getByRole('button', { name: 'CO' }).click();
  await dialog.getByRole('button', { name: 'Gem' }).click();
  await expect(teacherRow(page, 'CO')).toContainText('2 t');
  await page.locator('.toast-action', { hasText: 'Fortryd' }).last().click();
  await expect(teacherRow(page, 'CO')).toContainText('0 min');
  await page.keyboard.press('Control+Shift+z');
  await expect(teacherRow(page, 'CO')).toContainText('2 t');
  await page.keyboard.press('Control+z');
  await expect(teacherRow(page, 'CO')).toContainText('0 min');
  await waitSaved(page);
  await page.reload();
  await expect(block(page, 'A').locator('.chip')).toHaveCount(1);
});

test('lagringsfejl vises ærligt og kan prøves igen uden datatab', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  await page.route('**/api/data', (route) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: '{"error":"Serverfejl"}' }) : route.continue()));
  await block(page, 'A').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.save')).toContainText('Kunne ikke gemme');
  await expect(page.locator('.banner-error')).toContainText('bevaret i browseren');
  await page.unroute('**/api/data');
  await page.getByRole('button', { name: 'Prøv igen' }).click();
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.block')).toHaveCount(0);
});

test('forældet vindue overskriver ikke nyere data', async ({ browser, request }) => {
  await resetData(request, fixture([A, blk({ id: 'X', day: 2 })]));
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await loginAdmin(a);
  await loginAdmin(b);
  await a.locator('[data-block-id="X"]').focus();
  await a.keyboard.press('Delete');
  await waitSaved(a);
  await b.locator('[data-block-id="A"]').focus();
  await b.keyboard.press('Delete');
  await expect(b.locator('.banner-error')).toContainText('ændret i et andet vindue');
  await expect(b.locator('.save')).toContainText('Ikke gemt');
  await b.getByRole('button', { name: /Hent nyeste/ }).click();
  await expect(b.locator('[data-block-id="X"]')).toHaveCount(0);
  await expect(b.locator('[data-block-id="A"]')).toHaveCount(1);
  await ctxA.close();
  await ctxB.close();
});

test('manglende satser og årsdata vises som manglende, ikke som 0', async ({ page, request }) => {
  const d = fixture([A, B]);
  d.settings.prepPercent = null;
  d.settings.teachingWeeks = null;
  await resetData(request, d);
  await loginAdmin(page);
  await expect(page.locator('.panel .notice-warn')).toContainText('forberedelsesprocent');
  await teacherRow(page, 'TH').click();
  await expect(page.locator('.week-box .stat', { hasText: 'Forberedelsestid' })).toContainText('—');
  await expect(page.locator('.year-box .stat', { hasText: 'Resterende' })).toContainText('mangler');
});

test('touch: langt tryk og træk flytter blokken (tablet)', async ({ browser, request }) => {
  await resetData(request, fixture([A]));
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await loginAdmin(page);
  const { from, to } = await dragPoints(page, block(page, 'A'), cell(page, 0, 0, 'room-3'));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: string, p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(400);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 });
    await page.waitForTimeout(16);
  }
  await expect(page.locator('.cell-over')).toHaveAttribute('data-cell', 'cell|0|0|room-3');
  await touch('touchEnd');
  await expect(cell(page, 0, 0, 'room-3').locator('.block')).toContainText('09.00–11.00');
  await ctx.close();
});

test('læseadgang: ingen redigering, /admin kræver administrator', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Adgangskode').fill(VIEWER_PW);
  await page.getByRole('button', { name: 'Log ind' }).click();
  await expect(page.locator('.view-badge')).toBeVisible();
  await expect(page.locator('.block-menu-btn')).toHaveCount(0);
  const res = await page.request.put('/api/data', { data: { baseVersion: 1, data: {} } });
  expect(res.status()).toBe(403);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administrator' })).toBeVisible();
  await ctx.close();
});

test('læsevisning henter nye ændringer automatisk', async ({ browser, request }) => {
  test.setTimeout(45_000);
  await resetData(request, fixture([A]));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Adgangskode').fill(VIEWER_PW);
  await page.getByRole('button', { name: 'Log ind' }).click();
  await expect(page.locator('.block')).toHaveCount(1);
  await resetData(request, fixture([A, blk({ id: 'NY', day: 3, subjectId: 'rep' })]));
  await expect(page.locator('.block')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('.block', { hasText: 'Repertoire' })).toBeVisible();
  await ctx.close();
});

test('Alt + træk kopierer i stedet for at flytte', async ({ page, request }) => {
  await resetData(request, fixture([A]));
  await loginAdmin(page);
  const p = await dragPoints(page, block(page, 'A'), cell(page, 1, 0, 'room-4'));
  await mouseDrag(page, p.from, p.to, { alt: true });
  await expect(cell(page, 1, 0, 'room-4').locator('.block')).toContainText('09.00–11.00');
  await expect(block(page, 'A')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Kopi oprettet');
});
