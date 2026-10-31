'use strict';

// Tests de bout en bout dans Chromium (Playwright) avec une API WebExtension simulée.
// Ils vérifient le rendu du content script et de la popup, pas l'intégration Safari.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const EXT_BASE = pathToFileURL(EXT).href + '/';
const read = (p) => fs.readFileSync(p, 'utf8');
const shim = read(path.join(__dirname, 'fixtures', 'browser-shim.js'));
const contentScripts = ['shared/settings.js', 'shared/style.js', 'content/content.js'].map((p) =>
  read(path.join(EXT, p))
);

let browser;

test.before(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
});

test.after(async () => {
  await browser.close();
});

async function openPage(initialState) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript(
    ({ base, state }) => {
      window.__LISIBLE_EXT_BASE__ = base;
      window.__LISIBLE_INITIAL__ = state;
    },
    { base: EXT_BASE, state: initialState || null }
  );
  await page.addInitScript(shim);
  await page.addInitScript(() => {
    if (window.__LISIBLE_INITIAL__) window.__lisibleStore.lisible = window.__LISIBLE_INITIAL__;
  });
  // Comme run_at: document_start.
  for (const src of contentScripts) await page.addInitScript(src);
  await page.goto(pathToFileURL(path.join(__dirname, 'fixtures', 'page.html')).href);
  return page;
}

function setState(page, state) {
  return page.evaluate((s) => window.browser.storage.local.set({ lisible: s }), state);
}

const style = (page, sel, prop) =>
  page.$eval(sel, (el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('applique la police, les espacements et l’alignement par défaut', async () => {
  const page = await openPage();
  await page.waitForFunction(() => document.documentElement.classList.contains('lisible-on'));
  assert.match(await style(page, '#para', 'font-family'), /Lisible OpenDyslexic/);
  assert.equal(await style(page, '#para', 'text-align'), 'start');
  assert.equal(await style(page, '#para', 'line-height'), `${16 * 1.6}px`);
  // La police est réellement chargée depuis les fichiers de l'extension.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Lisible OpenDyslexic"', 'éœ');
  });
  assert.equal(loaded, true);
  // Code et icônes gardent leur police.
  assert.doesNotMatch(await style(page, '#code', 'font-family'), /Lisible/);
  assert.equal(await style(page, '#icon', 'font-family'), 'FontAwesome');
  await page.close();
});

test('se met à jour en direct et se désactive par site', async () => {
  const page = await openPage();
  const L = await page.evaluate(() => window.Lisible.defaultState());
  L.global.theme = 'dark';
  L.global.noItalic = true;
  L.global.letterSpacing = 0.2;
  L.global.linkOutline = true;
  L.global.textCase = 'uppercase';
  await setState(page, L);
  assert.equal(await style(page, 'body', 'background-color'), 'rgb(30, 30, 30)');
  assert.equal(await style(page, '#card', 'background-color'), 'rgb(30, 30, 30)');
  assert.equal(await style(page, '#link', 'color'), 'rgb(138, 180, 248)');
  assert.equal(await style(page, '#em', 'font-style'), 'normal');
  assert.equal(await style(page, '#para', 'letter-spacing'), `${16 * 0.2}px`);
  assert.equal(await style(page, '#link', 'outline-style'), 'solid');
  assert.equal(await style(page, '#para', 'text-transform'), 'uppercase');

  // La page de test est servie en file:// : son « site » est "file".
  L.sites.file = { enabled: false };
  await setState(page, L);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('lisible-on')), false);
  assert.match(await style(page, '#para', 'font-family'), /Georgia/);
  await page.close();
});

test('règle de lecture : suit le pointeur, modes bande et masque', async () => {
  const page = await openPage();
  const st = await page.evaluate(() => window.Lisible.defaultState());
  st.ruler.enabled = true;
  st.ruler.height = 40;
  await setState(page, st);
  await page.mouse.move(100, 300);
  await page.waitForFunction(() => {
    const b = document.querySelector('#lisible-ruler .lisible-band');
    return b && b.getBoundingClientRect().top === 280;
  });
  assert.equal(await page.$eval('#lisible-ruler .lisible-band', (b) => b.getBoundingClientRect().height), 40);
  assert.equal(await page.$eval('#lisible-ruler', (r) => r.parentElement === document.documentElement), true);

  st.ruler.mode = 'mask';
  await setState(page, st);
  await page.mouse.move(100, 200);
  await page.waitForFunction(() => {
    const top = document.querySelector('#lisible-ruler .lisible-top');
    return top.getBoundingClientRect().height === 180;
  });
  assert.equal(await style(page, '#lisible-ruler .lisible-band', 'display'), 'none');

  st.ruler.enabled = false;
  await setState(page, st);
  assert.equal(await page.$('#lisible-ruler'), null);
  await page.close();
});

async function openUI(file, { width = 400, height = 620, hash = '', initial = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.addInitScript(({ base }) => (window.__LISIBLE_EXT_BASE__ = base), { base: EXT_BASE });
  await page.addInitScript(shim);
  // État de départ (le stockage simulé ne survit pas à un rechargement).
  if (initial) await page.addInitScript((s) => (window.__lisibleStore.lisible = s), initial);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(pathToFileURL(path.join(EXT, file)).href + hash);
  return { page, errors };
}

const getState = (page) => page.evaluate(() => window.__lisibleStore.lisible);
const settle = (page) => page.waitForTimeout(250);

test('popup : réglages simples, règle en haut, annuler', async () => {
  const { page, errors } = await openUI('popup/popup.html');
  await page.waitForFunction(() => document.querySelector('#tab-site-name').textContent === 'exemple.fr');

  // La règle de lecture est le premier bloc après l'en-tête.
  assert.equal(await page.$eval('header + section', (el) => el.classList.contains('ruler')), true);
  // Onglet « Tous les sites » ouvert par défaut.
  assert.equal(await page.getAttribute('#tab-global', 'aria-selected'), 'true');

  await page.selectOption('#font', 'lexend');
  await page.click('[data-step="fontScale"][data-delta="10"]');
  await page.click('input[name="spacing"][value="xlarge"] + span');
  await page.click('#bg-swatches input[value="cream"] + span');
  await settle(page);
  let st = await getState(page);
  assert.equal(st.global.font, 'lexend');
  assert.equal(st.global.fontScale, 110);
  assert.equal(st.global.letterSpacing, 0.12);
  assert.equal(st.global.lineHeight, 1.9);
  assert.equal(st.global.theme, 'cream');
  assert.equal(await page.textContent('output[data-for="fontScale"]'), '110 %');
  assert.match(await style(page, '.controls .font-sample', 'font-family'), /Lisible Lexend/);

  // Règle de lecture : commune, en haut.
  // Les réglages de la règle sont repliés par défaut.
  assert.equal(await page.$eval('.ruler-more', (d) => d.open), false);
  await page.click('label.switch:has(#ruler-enabled)');
  await page.click('.ruler-more summary');
  await page.click('input[data-ruler="mode"][value="mask"] + span');
  await settle(page);
  st = await getState(page);
  assert.deepEqual([st.ruler.enabled, st.ruler.mode], [true, 'mask']);
  assert.equal(await page.isVisible('input[data-ruler="color"]'), false); // couleur : mode bande seulement

  // Annuler revient à l'état précédent le dernier groupe de changements.
  assert.equal(await page.isVisible('#toast'), true);
  await page.click('#undo');
  await settle(page);
  st = await getState(page);
  assert.equal(st.ruler.enabled, false);
  assert.equal(await page.isVisible('#toast'), false);

  // Réinitialiser (avec confirmation).
  await page.click('#reset');
  assert.equal(await page.textContent('#reset'), 'Confirmer ?');
  await page.click('#reset');
  await settle(page);
  st = await getState(page);
  assert.deepEqual(st.global, await page.evaluate(() => ({ ...window.Lisible.DEFAULT_SETTINGS })));

  // Plus de réglages : ouvre la page complète.
  await page.click('#more');
  await page.waitForFunction(() => window.__lisibleOpened);
  assert.match(await page.evaluate(() => window.__lisibleOpened), /options\/options\.html$/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('popup : onglet du site distinct (violet), désactiver, personnaliser, revenir', async () => {
  const { page, errors } = await openUI('popup/popup.html');
  await page.waitForFunction(() => document.querySelector('#tab-site-name').textContent === 'exemple.fr');
  await page.click('#tab-site');

  // Sans réglages propres : bandeau + bouton, pas de réglages ni de Réinitialiser.
  assert.equal(await page.isVisible('#site-banner'), true);
  assert.equal(await page.isVisible('#site-customize'), true);
  assert.equal(await page.isVisible('#controls'), false);
  assert.equal(await page.isVisible('#reset'), false);

  // Désactiver sur ce site.
  await page.click('label.switch:has(#site-enabled)');
  await settle(page);
  assert.deepEqual((await getState(page)).sites, { 'exemple.fr': { enabled: false } });
  await page.click('label.switch:has(#site-enabled)');
  await settle(page);
  assert.deepEqual((await getState(page)).sites, {});

  // Personnaliser : l'interface passe en violet et modifie le site seulement.
  await page.click('#site-customize');
  assert.equal(await page.$eval('body', (b) => b.classList.contains('editing-site')), true);
  assert.equal(await page.textContent('#site-title'), 'Réglages propres à exemple.fr');
  await page.selectOption('#font', 'andika');
  await settle(page);
  let st = await getState(page);
  assert.equal(st.sites['exemple.fr'].settings.font, 'andika');
  assert.equal(st.global.font, 'opendyslexic');

  // L'onglet « Tous les sites » prévient que ce site a ses propres réglages.
  await page.click('#tab-global');
  assert.equal(await page.isVisible('#global-note'), true);
  assert.equal(await page.$eval('body', (b) => b.classList.contains('editing-site')), false);

  // Revenir aux réglages communs.
  await page.click('#tab-site');
  await page.click('#site-revert');
  await settle(page);
  assert.deepEqual((await getState(page)).sites, {});
  assert.deepEqual(errors, []);
  await page.close();
});

test('popup : s’ouvre sur l’onglet du site quand il a ses propres réglages', async () => {
  const { page } = await openUI('popup/popup.html', {
    initial: { enabled: true, global: {}, sites: { 'exemple.fr': { settings: { font: 'arial' } } } }
  });
  await page.waitForFunction(() => document.querySelector('#tab-site').getAttribute('aria-selected') === 'true');
  assert.equal(await page.$eval('#font', (s) => s.value), 'arial');
  await page.close();
});

test('page « Plus de réglages » : réglages fins, sites, aperçu', async () => {
  const { page, errors } = await openUI('options/options.html', { width: 1100, height: 900 });
  await page.waitForFunction(() => document.querySelector('#o-font').options.length > 0);

  // Règle de lecture en premier.
  assert.equal(await page.$eval('main > section', (el) => el.id), 'ruler');

  await page.$eval('input[data-key="letterSpacing"]', (el) => {
    el.value = '0.2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.selectOption('#o-case', 'uppercase');
  await page.click('#o-themes input[value="custom"] + span');
  assert.equal(await page.isVisible('#custom-colors'), true);
  await settle(page);
  let st = await getState(page);
  assert.equal(st.global.letterSpacing, 0.2);
  assert.equal(st.global.textCase, 'uppercase');
  assert.equal(st.global.theme, 'custom');
  // L'aperçu applique les réglages.
  assert.equal(await style(page, '#preview p', 'text-transform'), 'uppercase');
  assert.ok(Math.abs(parseFloat(await style(page, '#preview p', 'letter-spacing')) - 17 * 0.2) < 0.01);
  // Le niveau d'espacement n'est plus coché (réglage fin).
  assert.equal(await page.$$eval('input[name="o-spacing"]:checked', (els) => els.length), 0);

  // Mes sites : vide, puis une ligne par site particulier.
  assert.equal(await page.isVisible('#sites-empty'), true);
  await page.evaluate(async () => {
    const st = window.Lisible.sanitizeState(window.__lisibleStore.lisible);
    st.sites['a.fr'] = { enabled: false };
    st.sites['b.fr'] = { settings: { ...st.global } };
    await window.browser.storage.local.set({ lisible: st });
  });
  await page.waitForFunction(() => document.querySelectorAll('#sites-body tr').length === 2);
  assert.deepEqual(await page.$$eval('#target option', (os) => os.map((o) => o.value)), ['', 'b.fr']);

  // Modifier b.fr : sélecteur en violet, changements limités à ce site.
  await page.click('#sites-body tr:nth-child(2) td.actions button.link:not(.remove)');
  assert.equal(await page.$eval('#target', (s) => s.value), 'b.fr');
  assert.equal(await page.$eval('body', (b) => b.classList.contains('editing-site')), true);
  await page.selectOption('#o-font', 'verdana');
  await settle(page);
  st = await getState(page);
  assert.equal(st.sites['b.fr'].settings.font, 'verdana');
  assert.notEqual(st.global.font, 'verdana');

  // Retirer a.fr.
  await page.click('#sites-body tr:nth-child(1) button.remove');
  await settle(page);
  assert.deepEqual(Object.keys((await getState(page)).sites), ['b.fr']);

  // Tout réinitialiser.
  await page.click('#reset-all');
  await page.click('#reset-all');
  await settle(page);
  st = await getState(page);
  assert.deepEqual(st.sites, {});
  assert.equal(await page.isVisible('#sites-empty'), true);

  // Crédits : une ligne par police embarquée, liens vers des licences existantes.
  const credits = await page.$$eval('#credits-list a', (as) => as.map((a) => a.href));
  assert.equal(credits.length, 4);
  for (const href of credits) assert.equal(fs.existsSync(new URL(href)), true, href);
  assert.deepEqual(errors, []);
  await page.close();
});

test('page « Plus de réglages » : #site=… ouvre les réglages de ce site', async () => {
  const { page } = await openUI('options/options.html', {
    width: 1100,
    height: 900,
    hash: '#site=c.fr',
    initial: { enabled: true, global: {}, sites: { 'c.fr': { settings: { font: 'arial' } } } }
  });
  await page.waitForFunction(() => document.querySelector('#target').value === 'c.fr');
  assert.equal(await page.$eval('#o-font', (s) => s.value), 'arial');
  await page.close();
});

test('page « Plus de réglages » : utilisable sur téléphone', async () => {
  const { page, errors } = await openUI('options/options.html', { width: 390, height: 800 });
  await page.waitForFunction(() => document.querySelector('#o-font').options.length > 0);
  // Pas de défilement horizontal de la page.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `débordement horizontal de ${overflow}px`);
  assert.deepEqual(errors, []);
  await page.close();
});
