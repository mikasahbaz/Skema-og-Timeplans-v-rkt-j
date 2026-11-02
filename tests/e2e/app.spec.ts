import { expect, test, type Page } from '@playwright/test';
import { blockEl, cell, dragTo, fixture, g, loginAdmin, moveVia, resetData, ruleBlock, teacherDetail, teacherRow, VIEWER_PW, waitSaved } from './helpers';

const H8 = g('Hold 8');
const H9 = g('Hold 9');
const H6 = g('Hold 6');

/** Den eneste klasse i skemaet, uanset id. */
const only = (page: Page) => page.locator('.board .block').first();

test('1) hovedskærmen har kun skema, optælling, "Tilføj ny klasse" og tandhjul', async ({ page, request }) => {
  await resetData(request, fixture([ruleBlock(fixture(), { groupIds: [H8], day: 0, period: 0 })]));
  await loginAdmin(page);
  await expect(page.locator('.board')).toBeVisible();
  await expect(page.locator('.hours')).toBeVisible();
  const topButtons = page.locator('.topbar button');
  await expect(topButtons).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Tilføj ny klasse' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Indstillinger og øvrige funktioner' })).toBeVisible();
  // Ingen filtre, fortryd-knapper eller permanente handlingsknapper på klasserne.
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fortryd' })).toHaveCount(0);
  await expect(page.locator('.block button')).toHaveCount(0);
  // Trykflader til hovedfunktionerne er mindst 44 px.
  for (const name of ['Tilføj ny klasse', 'Indstillinger og øvrige funktioner']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('2) ny klasse: hold, lærer og titlen "Balletklasse"; tider først ved "Egne tider"; kladde tæller ikke', async ({ page, request }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Tilføj ny klasse' }).click();
  const panel = page.getByRole('dialog', { name: 'Tilføj ny klasse' });
  await expect(panel.getByLabel('Titel')).toHaveValue('Balletklasse');
  await expect(panel.getByLabel('Start')).toHaveCount(0);
  await panel.getByLabel('Egne tider').check();
  await expect(panel.getByLabel('Start')).toBeVisible();
  await panel.getByLabel('Egne tider').uncheck();
  await panel.getByRole('button', { name: 'Hold 8', exact: true }).click();
  await panel.getByRole('button', { name: 'TH' }).click();
  await panel.getByRole('button', { name: 'Opret og placér' }).click();
  await expect(page.locator('.place-bar')).toBeVisible();
  await expect(teacherRow(page, 'TH').locator('.hours-total')).toHaveText('0 min');
  // 3) placering giver kildens tid: Hold 8 mandag morgen 8.10–9.55 (KDS!L4)
  await cell(page, 0, 0, 'room-1').locator('.place-target').click();
  await expect(only(page)).toContainText('08.10–09.55');
  await expect(await teacherDetail(page, 'TH')).toContainText('1 t 45 min');
  await waitSaved(page);
});

test('3–5) flytning mandag → fredag → lørdag ændrer tid, varighed og tillæg; fortryd gendanner', async ({ page, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { groupIds: [H8], day: 0, period: 0 })]));
  await loginAdmin(page);
  const th = await teacherDetail(page, 'TH');
  await expect(th).toContainText('1 t 45 min');
  await moveVia(page, blockEl(page, 'b1'), cell(page, 4, 0, 'room-2'));
  await expect(cell(page, 4, 0, 'room-2').locator('.block')).toContainText('08.25–09.55'); // fredag KDS!L28
  await expect(page.locator('.toast')).toContainText('før 08.10–09.55');
  await expect(th.locator('dl > div', { hasText: 'Undervisning' })).toContainText('1 t 30 min');
  await expect(th.locator('dl > div', { hasText: 'Lørdagstillæg' })).toHaveCount(0);
  await dragTo(page, blockEl(page, 'b1'), cell(page, 5, 0, 'room-2')); // fredag → lørdag ligger tæt: træk
  await expect(cell(page, 5, 0, 'room-2').locator('.block')).toContainText('08.25–09.55'); // lørdag KDS!D34
  await expect(th.locator('dl > div', { hasText: 'Lørdagstillæg' })).toContainText('45 min');
  await expect(teacherRow(page, 'TH').locator('.hours-total')).toHaveText('2 t 38 min');
  // 11) Fortryd gendanner placering, tid og optælling
  await page.keyboard.press('Control+z');
  await expect(cell(page, 4, 0, 'room-2').locator('.block')).toContainText('08.25–09.55');
  await page.keyboard.press('Control+z');
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('08.10–09.55');
  await expect(th.locator('dl > div', { hasText: 'Undervisning' })).toContainText('1 t 45 min');
  await waitSaved(page);
  // 12) bevaret efter genindlæsning
  await page.reload();
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('08.10–09.55');
});

test('6) fredagens tider gælder, uanset om morgensamlingen er bemandet; morgensamling tæller kun med lærer og findes én gang', async ({ page, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { groupIds: [H8], day: 4, period: 0 })]));
  await loginAdmin(page);
  const chip = page.locator('.assembly');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('ingen lærer valgt');
  await expect(teacherRow(page, 'TH').locator('.hours-total')).toHaveText('1 t 53 min');
  await chip.click();
  await page.getByRole('tab', { name: 'Morgensamling' }).click();
  await page.getByLabel('Lærer til morgensamling').selectOption({ label: 'TH' });
  await page.getByRole('button', { name: 'Luk indstillinger' }).click();
  await expect(chip.locator('.chip')).toHaveText('TH');
  await expect(blockEl(page, 'b1')).toContainText('08.25–09.55');
  await expect(teacherRow(page, 'TH').locator('.hours-total')).toHaveText('2 t 5 min'); // 112,5 + 12,5 min
  await chip.click();
  await page.getByRole('tab', { name: 'Morgensamling' }).click();
  await page.getByLabel('Lærer til morgensamling').selectOption({ label: 'CO' });
  await page.getByRole('button', { name: 'Luk indstillinger' }).click();
  await expect(teacherRow(page, 'TH').locator('.hours-total')).toHaveText('1 t 53 min');
  await expect(teacherRow(page, 'CO').locator('.hours-total')).toHaveText('13 min');
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.assembly')).toHaveCount(1);
  await expect(page.locator('.assembly .chip')).toHaveText('CO');
  await page.locator('.assembly').click();
  await page.getByRole('tab', { name: 'Morgensamling' }).click();
  await page.getByLabel('Lærer til morgensamling').selectOption('');
  await page.getByRole('button', { name: 'Luk indstillinger' }).click();
  await expect(teacherRow(page, 'CO').locator('.hours-total')).toHaveText('0 min');
});

test('7) egne tider bevares ved flytning til anden sal, dag, dagdel og lørdag; bevaret efter genindlæsning', async ({ page, request }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  await cell(page, 0, 1, 'room-2').click({ position: { x: 20, y: 20 } });
  const panel = page.getByRole('dialog', { name: 'Tilføj ny klasse' });
  await panel.getByRole('button', { name: 'Hold 6', exact: true }).click();
  await panel.getByRole('button', { name: 'TH' }).click();
  await panel.getByLabel('Titel').fill('Spidsdans');
  await panel.getByLabel('Egne tider').check();
  await panel.getByLabel('Start').fill('9.10');
  await panel.getByLabel('Slut').fill('9.55');
  await panel.getByRole('button', { name: 'Opret' }).click();
  const b = page.locator('.board .block', { hasText: 'Spidsdans' });
  await expect(b).toContainText('09.10–09.55');
  await expect(b.locator('.lock-icon')).toHaveCount(1);
  for (const [day, period, room] of [
    [0, 1, 'room-5'],
    [2, 1, 'room-5'],
    [2, 3, 'room-5'],
    [5, 2, 'room-5'],
  ] as const) {
    if (day === 0) await dragTo(page, b, cell(page, day, period, room));
    else await moveVia(page, b, cell(page, day, period, room));
    await expect(cell(page, day, period, room).locator('.block')).toContainText('09.10–09.55');
  }
  await expect((await teacherDetail(page, 'TH')).locator('dl > div', { hasText: 'Lørdagstillæg' })).toContainText('23 min');
  await waitSaved(page);
  await page.reload();
  await expect(cell(page, 5, 2, 'room-5').locator('.block')).toContainText('09.10–09.55');
  await expect(cell(page, 5, 2, 'room-5').locator('.lock-icon')).toHaveCount(1);
});

test('8) fælles klasse med to hold og to lærere: én blok, begge lærere får hele tiden, ingen dobbelttælling', async ({ page, request }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  await cell(page, 5, 1, 'room-3').click({ position: { x: 20, y: 20 } });
  const panel = page.getByRole('dialog', { name: 'Tilføj ny klasse' });
  await panel.getByRole('button', { name: 'Hold 8', exact: true }).click();
  await panel.getByRole('button', { name: 'Hold 9', exact: true }).click();
  await panel.getByRole('button', { name: 'FM' }).click();
  await panel.getByRole('button', { name: 'HC' }).click();
  await panel.getByLabel('Titel').fill('PDD');
  await panel.getByRole('button', { name: 'Opret' }).click();
  await expect(page.locator('.board .block')).toHaveCount(1);
  await expect(only(page)).toContainText('10.10–11.45'); // KDS!D35 fælles regel
  await expect(only(page)).toContainText('Hold 8 + 9');
  for (const t of ['FM', 'HC']) {
    await expect((await teacherDetail(page, t)).locator('dl > div', { hasText: 'Undervisning' })).toContainText('1 t 35 min');
  }
});

test('9) manglende regel opfinder ikke en tid: annuller bevarer, "Egne tider" er et aktivt valg; flere muligheder giver et valg', async ({ page, request }) => {
  const d = fixture([]);
  d.blocks = [ruleBlock(d, { groupIds: [H6], day: 0, period: 0 })];
  // To varianter for Hold 6 onsdag middag (manuelle regler til testen)
  d.timeRules.push(
    { id: 'x1', groupIds: [H6], day: 2, period: 2, start: 710, end: 755, label: 'A', note: '', source: 'Manuel' },
    { id: 'x2', groupIds: [H6], day: 2, period: 2, start: 730, end: 800, label: 'B', note: '', source: 'Manuel' },
  );
  await resetData(request, d);
  await loginAdmin(page);
  await dragTo(page, blockEl(page, 'b1'), cell(page, 1, 1, 'room-2')); // tirsdag formiddag: ingen regel for Hold 6
  const none = page.getByRole('dialog', { name: 'Ingen tidsregel' });
  await expect(none).toBeVisible();
  await none.getByRole('button', { name: 'Annuller' }).click();
  await expect(cell(page, 0, 0, 'room-1').locator('.block')).toContainText('08.10–09.55');
  await moveVia(page, blockEl(page, 'b1'), cell(page, 2, 2, 'room-2'));
  const choice = page.getByRole('dialog', { name: 'Vælg tidsrum' });
  await expect(choice.getByRole('button')).toHaveCount(3); // to tidsrum + annuller
  await choice.getByRole('button', { name: /12\.10–13\.20/ }).click();
  await expect(cell(page, 2, 2, 'room-2').locator('.block')).toContainText('12.10–13.20');
  await expect(cell(page, 2, 2, 'room-2').locator('.lock-icon')).toHaveCount(0);
});

test('konflikt: annuller bevarer, "Behold med konflikt" markerer og tæller med', async ({ page, request }) => {
  const d = fixture();
  d.blocks = [ruleBlock(d, { id: 'a', groupIds: [H8], day: 0, period: 0, teacherIds: ['th'] }), ruleBlock(d, { id: 'b', groupIds: [H9], day: 0, period: 0, roomId: 'room-2', teacherIds: ['co'] })];
  await resetData(request, d);
  await loginAdmin(page);
  await blockEl(page, 'a').click();
  await page.getByRole('button', { name: 'Redigér' }).click();
  await page.getByRole('dialog', { name: 'Redigér klasse' }).getByRole('button', { name: 'CO' }).click();
  await page.getByRole('button', { name: 'Gem' }).click();
  const dlg = page.getByRole('dialog', { name: /Konflikt/ });
  await expect(dlg).toContainText('Lærer CO er optaget af Balletklasse · Hold 9');
  await dlg.getByRole('button', { name: 'Annuller' }).click();
  await page.keyboard.press('Escape');
  await expect(blockEl(page, 'a').locator('.chip')).toHaveCount(1);
  await blockEl(page, 'a').click();
  await page.getByRole('button', { name: 'Redigér' }).click();
  await page.getByRole('dialog', { name: 'Redigér klasse' }).getByRole('button', { name: 'CO' }).click();
  await page.getByRole('button', { name: 'Gem' }).click();
  await page.getByRole('button', { name: 'Behold med konflikt' }).click();
  await expect(blockEl(page, 'a')).toHaveClass(/block-conflict/);
  await expect(page.locator('.hours-alert')).toContainText('1 konflikt');
});

test('ændring af tidsregel opdaterer klasser samlet og kan fortrydes; egne tider røres ikke', async ({ page, request }) => {
  const d = fixture();
  d.blocks = [ruleBlock(d, { id: 'r', groupIds: [H8], day: 0, period: 0 }), { ...ruleBlock(d, { id: 'c', groupIds: [H8], day: 1, period: 0, roomId: 'room-3' }), timeMode: 'custom', ruleId: null, start: 490, end: 595 }];
  await resetData(request, d);
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Indstillinger og øvrige funktioner' }).click();
  await page.getByRole('button', { name: /Tidsregler og morgensamling/ }).click();
  await page.getByRole('combobox', { name: 'Vis hold' }).selectOption({ label: 'Hold 8' });
  const start = page.getByLabel('Start for Hold 8 man morgen');
  await start.fill('8.20');
  await start.press('Enter');
  await page.getByRole('button', { name: 'Luk indstillinger' }).click();
  await expect(blockEl(page, 'r')).toContainText('08.20–09.55');
  await expect(blockEl(page, 'c')).toContainText('08.10–09.55');
  await page.keyboard.press('Control+z');
  await expect(blockEl(page, 'r')).toContainText('08.10–09.55');
});

test('lagringsfejl vises tydeligt og kan prøves igen uden datatab', async ({ page, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { groupIds: [H8], day: 0, period: 0 })]));
  await loginAdmin(page);
  await page.route('**/api/data', (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, body: '{"error":"Serverfejl"}' }) : r.continue()));
  await blockEl(page, 'b1').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.save-err')).toContainText('Kunne ikke gemme');
  await expect(page.locator('.banner-error')).toBeVisible();
  await page.unroute('**/api/data');
  await page.getByRole('button', { name: 'Prøv igen' }).click();
  await waitSaved(page);
  await page.reload();
  await expect(page.locator('.board .block')).toHaveCount(0);
});

test('forældet vindue overskriver ikke nyere data', async ({ browser, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { id: 'a', groupIds: [H8], day: 0, period: 0 }), ruleBlock(d, { id: 'x', groupIds: [H9], day: 2, period: 0 })]));
  const [ca, cb] = [await browser.newContext(), await browser.newContext()];
  const [a, b] = [await ca.newPage(), await cb.newPage()];
  await loginAdmin(a);
  await loginAdmin(b);
  await blockEl(a, 'x').focus();
  await a.keyboard.press('Delete');
  await waitSaved(a);
  await blockEl(b, 'a').focus();
  await b.keyboard.press('Delete');
  await expect(b.locator('.banner-error')).toContainText('ændret i et andet vindue');
  await b.getByRole('button', { name: 'Hent nyeste' }).click();
  await expect(blockEl(b, 'x')).toHaveCount(0);
  await expect(blockEl(b, 'a')).toHaveCount(1);
  await ca.close();
  await cb.close();
});

test('læseadgang: kun skemaet, ingen redigering, ingen timer', async ({ browser, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { groupIds: [H8], day: 0, period: 0 })]));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Adgangskode').fill(VIEWER_PW);
  await page.getByRole('button', { name: 'Log ind' }).click();
  await expect(page.locator('.board .block')).toContainText('08.10–09.55');
  await expect(page.locator('.hours')).toHaveCount(0);
  expect((await page.request.put('/api/data', { data: { baseVersion: 1, data: {} } })).status()).toBe(403);
  await ctx.close();
});

test('13) iPad vandret: skema og optælling samtidig, touch-træk og læsbar tekst', async ({ browser, request }) => {
  const d = fixture();
  await resetData(request, fixture([ruleBlock(d, { groupIds: [H8], day: 0, period: 0 })]));
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  await loginAdmin(page);
  await expect(page.locator('.board')).toBeVisible();
  await expect(page.locator('.hours')).toBeVisible();
  const fs = await page.locator('.block-title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fs).toBeGreaterThanOrEqual(13);
  const p = await (await import('./helpers')).dragPoints(page, blockEl(page, 'b1'), cell(page, 0, 0, 'room-3'));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: string, pt?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt ? [{ x: pt.x, y: pt.y, id: 1 }] : [] });
  await touch('touchStart', p.from);
  await page.waitForTimeout(400);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', { x: p.from.x + ((p.to.x - p.from.x) * i) / 12, y: p.from.y + ((p.to.y - p.from.y) * i) / 12 });
    await page.waitForTimeout(16);
  }
  await touch('touchEnd');
  await expect(cell(page, 0, 0, 'room-3').locator('.block')).toContainText('08.10–09.55');
  await ctx.close();
});

test('tæt besat uge fra dokumentet: indlæses fra Indstillinger, kan fortrydes', async ({ page, request }) => {
  await resetData(request, fixture());
  await loginAdmin(page);
  await page.getByRole('button', { name: 'Indstillinger og øvrige funktioner' }).click();
  await page.getByRole('button', { name: /Tidsregler og morgensamling/ }).click();
  await page.getByRole('tab', { name: 'Kilde' }).click();
  await page.getByRole('button', { name: 'Indlæs ugeskemaet fra kilden' }).click();
  await page.getByRole('button', { name: 'Erstat klasser' }).click();
  await page.getByRole('button', { name: 'Luk indstillinger' }).click();
  await expect(page.locator('.board .block')).toHaveCount(67);
  await expect(page.locator('.hours-alert')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.board .block')).toHaveCount(0);
});
