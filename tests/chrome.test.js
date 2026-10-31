'use strict';

// Charge le vrai build Chrome (dist/chrome) dans Chromium : manifest, service worker,
// content script et popup, avec les vraies API d'extension (pas de simulation).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'dist', 'chrome');

let context;
let server;
let base;
let extId;

test.before(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs'), 'chrome']);
  // Page de test servie en HTTP (les content scripts ne s'injectent pas en file:// par défaut).
  const page = fs.readFileSync(path.join(__dirname, 'fixtures', 'page.html'));
  server = http.createServer((_, res) => res.end(page)).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/`;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lisible-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extId = new URL(worker.url()).host;
});

test.after(async () => {
  await context.close();
  server.close();
});

const style = (page, sel, prop) => page.$eval(sel, (el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('Chrome : le service worker démarre', () => {
  assert.match(extId, /^[a-p]{32}$/);
});

test('Chrome : le content script applique la police embarquée', async () => {
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.classList.contains('lisible-on'));
  assert.match(await style(page, '#para', 'font-family'), /Lisible OpenDyslexic/);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Lisible OpenDyslexic"', 'éœ');
  });
  assert.equal(loaded, true);
  await page.close();
});

test('Chrome : la popup modifie la page en direct', async () => {
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => document.documentElement.classList.contains('lisible-on'));

  const popup = await context.newPage();
  const errors = [];
  popup.on('pageerror', (e) => errors.push(e));
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#font').options.length > 0);
  await popup.selectOption('#font', 'lexend');
  await popup.click('label.switch:has(#ruler-enabled)');

  await page.bringToFront();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('para')).fontFamily.includes('Lexend'));
  await page.waitForSelector('#lisible-ruler');
  assert.deepEqual(errors, []);
  await popup.close();
  await page.close();
});

test('Chrome : la page « Plus de réglages » est déclarée et s’ouvre', async () => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(`chrome-extension://${extId}/options/options.html`);
  await page.waitForFunction(() => document.querySelector('#o-font').options.length > 0);
  assert.equal(await page.textContent('#version'), '1.0.0');
  assert.deepEqual(errors, []);
  await page.close();
});
