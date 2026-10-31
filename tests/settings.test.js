'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../extension/shared/settings.js');
require('../extension/shared/style.js');
const L = globalThis.Lisible;

test('hostFromURL normalise et ignore les schémas non web', () => {
  assert.equal(L.hostFromURL('https://www.Example.com/a?b'), 'example.com');
  assert.equal(L.hostFromURL('http://fr.wikipedia.org'), 'fr.wikipedia.org');
  assert.equal(L.hostFromURL('file:///Users/x/doc.html'), 'file');
  assert.equal(L.hostFromURL('about:blank'), '');
  assert.equal(L.hostFromURL('safari-web-extension://abc/popup.html'), '');
  assert.equal(L.hostFromURL('pas une url'), '');
});

test('sanitizeState rejette les valeurs invalides', () => {
  const st = L.sanitizeState({
    enabled: 'oui',
    global: { font: 'comic', letterSpacing: 99, theme: 'dark', customBg: 'red' },
    ruler: { mode: 'x', height: 9999, color: 'rouge' },
    sites: { 'WWW.A.com': { enabled: false, settings: { font: 'lexend' } }, 'b.com': {}, 'c.com': 3 }
  });
  assert.equal(st.enabled, true);
  assert.equal(st.global.font, L.DEFAULT_SETTINGS.font);
  assert.equal(st.global.letterSpacing, L.RANGES.letterSpacing[1]);
  assert.equal(st.global.theme, 'dark');
  assert.equal(st.global.customBg, L.DEFAULT_SETTINGS.customBg);
  assert.equal(st.ruler.mode, 'band');
  assert.equal(st.ruler.height, L.RULER_RANGES.height[1]);
  assert.equal(st.ruler.color, L.DEFAULT_RULER.color);
  assert.deepEqual(Object.keys(st.sites), ['a.com']);
  assert.equal(st.sites['a.com'].settings.font, 'lexend');
});

test('resolve : interrupteur général et sites désactivés', () => {
  const st = L.defaultState();
  assert.equal(L.resolve(st, 'a.com').active, true);

  st.sites['a.com'] = { enabled: false };
  assert.equal(L.resolve(st, 'a.com').active, false);
  assert.equal(L.resolve(st, 'www.a.com').active, false);
  assert.equal(L.resolve(st, 'b.com').active, true);

  st.enabled = false;
  assert.equal(L.resolve(st, 'b.com').active, false);
});

test('migration de la version 1 : portée supprimée, règle sortie des réglages', () => {
  const st = L.sanitizeState({
    enabled: true,
    scope: 'list',
    global: { ruler: true, rulerMode: 'mask', rulerHeight: 60, rulerOpacity: 50, rulerColor: '#00ff00' },
    sites: { 'a.com': { enabled: true }, 'b.com': { enabled: false } }
  });
  assert.equal('scope' in st, false);
  assert.deepEqual(st.ruler, { enabled: true, mode: 'mask', height: 60, opacity: 50, color: '#00ff00' });
  assert.equal('ruler' in st.global, false);
  // « Toujours » n'existe plus : seule l'exception « désactivé » est gardée.
  assert.deepEqual(st.sites, { 'b.com': { enabled: false } });
});

test('niveaux d’espacement', () => {
  assert.equal(L.spacingLevel(L.DEFAULT_SETTINGS), 'large');
  for (const [name, level] of Object.entries(L.SPACING_LEVELS)) {
    assert.equal(L.spacingLevel({ ...L.DEFAULT_SETTINGS, ...level }), name);
  }
  assert.equal(L.spacingLevel({ ...L.DEFAULT_SETTINGS, letterSpacing: 0.07 }), null);
  // Niveau « Normal » : la page garde ses espacements.
  const css = L.style.buildCSS(L.sanitizeSettings({ ...L.SPACING_LEVELS.normal, font: 'none', textAlign: 'default' }), (p) => p);
  assert.equal(css, '');
});

test('resolve : réglages propres à un site', () => {
  const st = L.defaultState();
  st.sites['a.com'] = { settings: { ...L.DEFAULT_SETTINGS, font: 'lexend' } };
  const r = L.resolve(st, 'a.com');
  assert.equal(r.custom, true);
  assert.equal(r.settings.font, 'lexend');
  assert.equal(L.resolve(st, 'b.com').settings.font, L.DEFAULT_SETTINGS.font);
});

test('pruneSite supprime les entrées vides', () => {
  const st = L.defaultState();
  st.sites['a.com'] = {};
  L.pruneSite(st, 'a.com');
  assert.equal('a.com' in st.sites, false);
});

test('buildCSS : valeurs neutres = aucune règle de texte', () => {
  const s = L.sanitizeSettings({
    ...L.SPACING_LEVELS.normal, font: 'none', textAlign: 'default', theme: 'none'
  });
  assert.equal(L.style.buildCSS(s, (p) => p), '');
});

test('buildCSS : police, espacements et thème', () => {
  const s = L.sanitizeSettings({
    font: 'lexend', letterSpacing: 0.12, wordSpacing: 0.3, lineHeight: 1.8,
    paragraphSpacing: 1, fontScale: 120, theme: 'cream', noItalic: true
  });
  const css = L.style.buildCSS(s, (p) => `ext://${p}`);
  assert.match(css, /@font-face\{font-family:"Lisible Lexend";font-style:normal;font-weight:400/);
  assert.doesNotMatch(css, /lexend-latin-400-italic/); // Lexend n'a pas d'italique
  assert.match(css, /src:url\("ext:\/\/fonts\/lexend-latin-700-normal\.woff2"\)/);
  assert.match(css, /letter-spacing:0\.12em !important/);
  assert.match(css, /word-spacing:0\.3em !important/);
  assert.match(css, /line-height:1\.8 !important/);
  assert.match(css, /zoom:1\.2 !important/);
  assert.match(css, /margin-bottom:1em !important/);
  assert.match(css, /background-color:#FAF4E3 !important/);
  assert.match(css, /font-style:normal !important/);
});

test('rulerCSS : bande colorée ou masque', () => {
  const band = L.style.rulerCSS(L.sanitizeRuler({ mode: 'band', color: '#ff0000', opacity: 50 }));
  assert.match(band, /rgba\(255, 0, 0, 0\.5\)/);
  const mask = L.style.rulerCSS(L.sanitizeRuler({ mode: 'mask', opacity: 40 }));
  assert.match(mask, /rgba\(0, 0, 0, 0\.4\)/);
});

test('sanitizeSettings : choix fixes et migration des anciennes cases', () => {
  const s = L.sanitizeSettings({ fontWeight: 'ultra', textAlign: 'justify', textCase: 'uppercase' });
  assert.equal(s.fontWeight, 'default');
  assert.equal(s.textAlign, 'justify');
  assert.equal(s.textCase, 'uppercase');
  const old = L.sanitizeSettings({ bold: true, alignLeft: false });
  assert.equal(old.fontWeight, 'bold');
  assert.equal(old.textAlign, 'default');
});

test('buildCSS : graisse, casse, alignement et liens', () => {
  const css = L.style.buildCSS(
    L.sanitizeSettings({
      fontWeight: 'normal', textCase: 'capitalize', textAlign: 'center',
      linkHighlight: true, linkHighlightColor: '#222222', linkOutline: true
    }),
    (p) => p
  );
  assert.match(css, /font-weight:400 !important/);
  assert.match(css, /text-transform:capitalize !important/);
  assert.match(css, /text-align:center !important/);
  assert.match(css, /a\[href\]\{background-color:#222222 !important;color:#FFFFFF !important\}/);
  assert.match(css, /outline:2px solid currentColor !important/);
  const light = L.style.buildCSS(L.sanitizeSettings({ linkHighlight: true, linkHighlightColor: '#FFF3A0' }), (p) => p);
  assert.match(light, /color:#1A1A1A !important/);
});

test('largeur de ligne et préréglage recommandé', () => {
  assert.equal(L.style.buildCSS(L.sanitizeSettings({ ...L.SPACING_LEVELS.normal, font: 'none', lineWidth: 120, textAlign: 'default' }), (p) => p), '');
  const css = L.style.buildCSS(L.sanitizeSettings({ lineWidth: 60 }), (p) => p);
  assert.match(css, /max-width:60ch !important/);
  // Le préréglage ne contient que des valeurs valides.
  const s = L.sanitizeSettings({ ...L.DEFAULT_SETTINGS, ...L.RECOMMENDED });
  for (const [k, v] of Object.entries(L.RECOMMENDED)) assert.equal(s[k], v, k);
});
