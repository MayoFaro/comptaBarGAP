// Run after test:integration against the disposable local emulator and Web build.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function type(label, value) {
  const field = page.getByRole('textbox', { name: label, exact: true });
  await field.click(); await page.waitForTimeout(250);
  await page.keyboard.press('Control+A'); await page.keyboard.type(value, { delay: 20 });
  await page.waitForTimeout(150); assert.equal(await field.inputValue(), value);
}
async function save() {
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
}
try {
  await page.goto('http://127.0.0.1:8088');
  await page.locator('flt-semantics-placeholder').waitFor();
  await page.locator('flt-semantics-placeholder').evaluate(el => el.click());
  await page.getByRole('button', { name: 'Connexion', exact: true }).click();
  await page.getByText('Se connecter', { exact: true }).click();
  await type('Email', 'integration_alice@gap.test');
  await type('Mot de passe', 'Local-test-123!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByText('Gestion Onglet 6 sur 6', {exact:true}).click();
  await page.getByText('Espace de gestion', { exact: true }).waitFor();
  await page.getByText('Adhérents', { exact: true }).click();
  await page.getByRole('button', { name: 'Nouvel adhérent', exact: true }).click();
  await type('Nom', 'Adhérent test interface');
  const now = new Date(); const nextEven = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCMonth() % 2 === 0 ? 1 : 2), 1)).toISOString().slice(0, 7);
  await type('Premier mois à facturer (AAAA-MM)', nextEven);
  await type('Avoir antérieur (FCFA)', '20000');
  await save();
  console.log('Fiche créée depuis l’interface.');
  await page.getByText('Opérations', { exact: true }).click();
  await page.getByRole('button', { name: 'Encaisser une cotisation', exact: true }).click();
  await page.getByRole('button', { name: /Adhérent/ }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Adhérent test interface/ }).waitFor();
  await type('Montant (FCFA)', '10000');
  await save();
  await page.getByText('40 000 FCFA', { exact: true }).waitFor();
  console.log('Encaissement enregistré : caisse 40 000 FCFA.');
  const more = page.getByRole('button', { name: 'Autres actions', exact: true });
  const anchor = await more.boundingBox();
  await more.click();
  await page.waitForTimeout(300);
  // Flutter 3.32's canvas popup does not expose its entries to this browser's
  // accessibility tree. Click the first row relative to the visible trigger.
  await page.mouse.click(anchor.x - 40, anchor.y + 32);
  await page.getByRole('button', { name: /Adhérent/ }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Adhérent test interface/ }).waitFor();
  await type('Montant (FCFA)', '5000');
  await type('Motif', 'Départ — test interface');
  await save();
  await page.getByText('35 000 FCFA', { exact: true }).waitFor();
  console.log('Avoir remboursé : caisse 35 000 FCFA.');
  await page.getByRole('button', { name: 'Contrôler la caisse', exact: true }).click();
  await page.getByText('Saisir le montant total', { exact: true }).click();
  await type('Montant compté (FCFA)', '35000');
  await save();
  await page.getByText('Journal Onglet 1 sur 6', { exact: true }).click();
  await page.getByText('35 000 FCFA', { exact: true }).waitFor();
  const journal = await page.locator('body').innerText();
  assert.equal(journal.includes('Adhérent test interface'), false);
  assert.equal(journal.includes('Alice privée'), false);
  assert.match(journal, /Dernier contrôle[\s\S]*Écart 0 FCFA/);
  await page.screenshot({ path: '/tmp/gap-ui-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/gap-ui-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.getByRole('button', { name: 'Connexion', exact: true }).waitFor();
  assert.equal((await page.locator('body').innerText()).includes('Gestion'), false);
  console.log('Contrôle de caisse, journal anonyme et déconnexion vérifiés sur Web et petit écran.');
  assert.deepEqual(errors, []);
} catch (e) {
  console.error(e.message);
  console.error((await page.locator('body').innerText()).slice(0,4000));
  await page.screenshot({ path: '/tmp/gap-ui-error.png' });
  process.exitCode = 1;
} finally { await browser.close(); }
