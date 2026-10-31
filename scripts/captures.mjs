#!/usr/bin/env node
/*
 * Produit les captures d'écran de la documentation (docs/images/fr et docs/images/en).
 *
 *   node scripts/captures.mjs        # ou : npm run captures
 *
 * Comme les tests de bout en bout : Chromium (Playwright) et l'API WebExtension simulée
 * (tests/fixtures/browser-shim.js). L'extension et la page d'exemple sont servies sur de
 * fausses adresses https pour que la popup affiche un vrai nom de site.
 * Prérequis : npm i -D playwright && npx playwright install chromium
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const EXT_BASE = 'https://lisible.extension/';
const read = (p) => readFileSync(p, 'utf8');
const shim = read(join(ROOT, 'tests', 'fixtures', 'browser-shim.js'));
const contentScripts = ['shared/settings.js', 'shared/style.js', 'content/content.js'].map((p) => read(join(EXT, p)));
const articleTemplate = read(join(ROOT, 'scripts', 'captures', 'article.html'));
const SCALE = 2;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.json': 'application/json' };

const LANGS = {
  fr: {
    tabURL: 'https://exemple.fr/article',
    before: 'Sans Lisible',
    after: 'Avec Lisible',
    band: 'Règle de lecture : bande',
    mask: 'Règle de lecture : masque',
    article: {
      title: 'Lire autrement',
      site: 'Le Quotidien',
      nav1: 'Actualités',
      nav2: 'Culture',
      nav3: 'Sciences',
      h1: 'Lire autrement : quand la mise en page change tout',
      meta: 'Publié le 12 mars · 4 min de lecture',
      body: [
        "<p>Pour beaucoup de lecteurs, une page web n'est pas difficile à cause de ses mots, mais à cause de leur présentation : des lettres serrées, des lignes trop longues, un texte justifié qui crée des « rivières » blanches entre les mots.</p>",
        "<p>Les recherches montrent qu'un <a href=\"#\">espacement plus large entre les lettres</a> aide de nombreux enfants dyslexiques à lire plus vite. Des lignes plus courtes et un fond légèrement teinté rendent aussi la lecture moins fatigante.</p>",
        '<blockquote>Chacun lit différemment : le bon réglage est celui qui vous convient.</blockquote>',
        "<p>Il suffit souvent de quelques changements pour qu'un article devienne confortable. L'important est de pouvoir les essayer facilement, puis de les garder d'un site à l'autre.</p>",
        "<p>Certains préfèrent une police dessinée pour la dyslexie, d'autres une police simple et ronde. Le plus utile reste de pouvoir comparer, sur un vrai texte, en quelques secondes.</p>"
      ].join('\n')
    }
  },
  en: {
    tabURL: 'https://example.com/article',
    before: 'Without Lisible',
    after: 'With Lisible',
    band: 'Reading ruler: band',
    mask: 'Reading ruler: mask',
    article: {
      title: 'Reading differently',
      site: 'The Daily',
      nav1: 'News',
      nav2: 'Culture',
      nav3: 'Science',
      h1: 'Reading differently: when layout changes everything',
      meta: 'Published 12 March · 4 min read',
      body: [
        '<p>For many readers, a web page is not hard because of its words but because of how they are shown: cramped letters, overly long lines, justified text that opens white “rivers” between the words.</p>',
        '<p>Research shows that <a href="#">wider spacing between letters</a> helps many dyslexic children read faster. Shorter lines and a lightly tinted background also make reading less tiring.</p>',
        '<blockquote>Everyone reads differently: the right setting is the one that suits you.</blockquote>',
        '<p>A few changes are often enough to make an article comfortable. What matters is being able to try them easily, then keep them from one site to the next.</p>',
        '<p>Some people prefer a typeface designed for dyslexia, others a simple, rounded one. The most useful thing is being able to compare, on real text, in a few seconds.</p>'
      ].join('\n')
    }
  }
};

function articleHTML(lang) {
  const a = { lang, ...LANGS[lang].article };
  return articleTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => a[k]);
}

function messages(lang) {
  const raw = JSON.parse(read(join(EXT, '_locales', lang, 'messages.json')));
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.message]));
}

let browser;

async function newPage(lang, { width, height, state = null }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: SCALE, locale: lang });
  await page.route(`${EXT_BASE}**`, (route) => {
    const file = join(EXT, decodeURIComponent(new URL(route.request().url()).pathname));
    route.fulfill({
      body: readFileSync(file),
      contentType: MIME[extname(file)] || 'application/octet-stream',
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  });
  await page.route(LANGS[lang].tabURL, (route) => route.fulfill({ body: articleHTML(lang), contentType: 'text/html' }));
  await page.addInitScript(
    ({ base, tabURL }) => {
      window.__LISIBLE_EXT_BASE__ = base;
      window.__LISIBLE_TAB_URL__ = tabURL;
    },
    { base: EXT_BASE, tabURL: LANGS[lang].tabURL }
  );
  await page.addInitScript(shim);
  // Textes de l'interface : le shim ne renvoie rien (français par défaut), on lit messages.json.
  await page.addInitScript(
    ({ msgs, ui, state }) => {
      window.browser.i18n.getMessage = (key) => (key === '@@ui_locale' ? ui : msgs[key] || '');
      if (state) window.__lisibleStore.lisible = state;
    },
    { msgs: messages(lang), ui: lang, state }
  );
  return page;
}

const fontsReady = (page) => page.evaluate(() => document.fonts.ready.then(() => true));

/** Page d'exemple, avec ou sans Lisible, éventuellement avec la règle de lecture. */
async function article(lang, state, { pointerY = null, width = 640, height = 560 } = {}) {
  const page = await newPage(lang, { width, height, state });
  for (const src of contentScripts) await page.addInitScript(src);
  await page.goto(LANGS[lang].tabURL);
  await fontsReady(page);
  if (pointerY !== null) {
    await page.mouse.move(200, pointerY);
    await page.waitForSelector('#lisible-ruler');
    await page.waitForTimeout(100);
  }
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** Popup : capture de l'élément <body> (la popup a une largeur fixe). */
async function popup(lang, state, prepare) {
  const page = await newPage(lang, { width: 400, height: 640, state });
  await page.goto(`${EXT_BASE}popup/popup.html`);
  const host = new URL(LANGS[lang].tabURL).hostname;
  await page.waitForFunction((h) => document.querySelector('#tab-site-name').textContent === h, host);
  if (prepare) await prepare(page);
  await fontsReady(page);
  await page.waitForTimeout(150);
  const png = await page.locator('body').screenshot();
  await page.close();
  return png;
}

async function options(lang, state, prepare) {
  const page = await newPage(lang, { width: 1100, height: 900, state });
  await page.goto(`${EXT_BASE}options/options.html`);
  await page.waitForFunction(() => document.querySelector('#o-font').options.length > 0);
  await fontsReady(page);
  await page.waitForTimeout(300); // fin des transitions des interrupteurs
  const png = await prepare(page);
  await page.close();
  return png;
}

/** Assemble plusieurs captures côte à côte, chacune avec une légende. */
async function sideBySide(items) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: SCALE });
  const figures = items
    .map(
      ({ label, png }) =>
        // Largeur PNG (octets 16 à 19 de l'en-tête) ramenée en pixels CSS.
        `<figure style="width:${png.readUInt32BE(16) / SCALE}px"><figcaption>${label}</figcaption>` +
        `<img src="data:image/png;base64,${png.toString('base64')}"></figure>`
    )
    .join('');
  await page.setContent(`<style>
    body { margin: 0; font: 600 15px -apple-system, "Segoe UI", sans-serif; color: #333; }
    main { display: inline-flex; gap: 20px; padding: 16px; background: #eef1f5; }
    figure { margin: 0; }
    figcaption { margin: 0 0 8px; }
    img { display: block; width: 100%; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
  </style><main>${figures}</main>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const png = await page.locator('main').screenshot();
  await page.close();
  return png;
}

function baseState(patch = {}) {
  return {
    version: 2,
    enabled: true,
    global: { font: 'opendyslexic', ...patch.global },
    ruler: { enabled: false, ...patch.ruler },
    sites: patch.sites || {}
  };
}

async function captures(lang) {
  const out = join(ROOT, 'docs', 'images', lang);
  mkdirSync(out, { recursive: true });
  const save = (name, png) => writeFileSync(join(out, name), png);
  const L = LANGS[lang];
  const host = new URL(L.tabURL).hostname;
  const recommended = {
    letterSpacing: 0.12, wordSpacing: 0.42, lineHeight: 1.5, paragraphSpacing: 1,
    lineWidth: 70, textAlign: 'left', noItalic: true, theme: 'cream'
  };

  // Avant / après : la même page sans Lisible et avec les valeurs conseillées.
  const before = await article(lang, { ...baseState(), enabled: false });
  const after = await article(lang, baseState({ global: recommended }));
  save('before-after.png', await sideBySide([{ label: L.before, png: before }, { label: L.after, png: after }]));

  // Règle de lecture : bande et masque.
  const band = await article(lang, baseState({ ruler: { enabled: true, height: 44 } }), { pointerY: 230 });
  const mask = await article(lang, baseState({ ruler: { enabled: true, mode: 'mask', height: 64, opacity: 55 } }), { pointerY: 230 });
  save('ruler.png', await sideBySide([{ label: L.band, png: band }, { label: L.mask, png: mask }]));

  // Popup, onglet « Tous les sites ».
  save('popup.png', await popup(lang, baseState({ global: { theme: 'cream' } })));

  // Popup, onglet du site personnalisé (en violet).
  save('popup-site.png', await popup(lang, baseState({ sites: { [host]: { settings: { font: 'lexend', fontScale: 110, theme: 'blue' } } } })));

  // Page « Plus de réglages » : haut de page, puis la liste des sites.
  save('options.png', await options(lang, baseState({ global: recommended, ruler: { enabled: true } }), (page) => page.screenshot()));
  save(
    'options-sites.png',
    await options(
      lang,
      baseState({
        sites: {
          'journal.example': { enabled: false },
          [host]: { settings: { font: 'lexend', theme: 'blue' } },
          'wiki.example': { settings: { font: 'atkinson' } }
        }
      }),
      (page) => page.locator('#sites').screenshot()
    )
  );
  console.log(`docs/images/${lang}/ : captures écrites`);
}

browser = await chromium.launch();
try {
  for (const lang of Object.keys(LANGS)) await captures(lang);
} finally {
  await browser.close();
}
