/*
 * Modèle de réglages partagé par le content script, la popup et le background.
 * Script « classique » : il expose tout sur globalThis.Lisible pour pouvoir être
 * chargé aussi bien via <script>, content_scripts ou import (module).
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'lisible';
  const STATE_VERSION = 2;

  // Polices embarquées (fichiers dans /fonts) et polices système.
  const FONTS = {
    none: { label: 'fontNone', family: null },
    opendyslexic: {
      label: 'OpenDyslexic',
      family: 'Lisible OpenDyslexic',
      file: 'opendyslexic',
      author: 'Abbie Gonzalez',
      italic: true,
      fallback: 'sans-serif'
    },
    atkinson: {
      label: 'Atkinson Hyperlegible',
      family: 'Lisible Atkinson Hyperlegible',
      file: 'atkinson-hyperlegible',
      author: 'Braille Institute of America',
      italic: true,
      fallback: 'sans-serif'
    },
    lexend: {
      label: 'Lexend',
      family: 'Lisible Lexend',
      file: 'lexend',
      author: 'The Lexend Project Authors',
      italic: false,
      fallback: 'sans-serif'
    },
    andika: {
      label: 'Andika',
      family: 'Lisible Andika',
      file: 'andika',
      author: 'SIL International',
      italic: true,
      fallback: 'sans-serif'
    },
    verdana: { label: 'Verdana', family: 'Verdana', system: true, fallback: 'sans-serif' },
    arial: { label: 'Arial', family: 'Arial', system: true, fallback: 'Helvetica, sans-serif' }
  };

  // Thèmes de couleur : fond, texte, liens.
  const THEMES = {
    none: null,
    cream: { bg: '#FAF4E3', text: '#222222', link: '#0B4F9C' },
    yellow: { bg: '#FFF8C5', text: '#1A1A1A', link: '#0B4F9C' },
    blue: { bg: '#DCEBFA', text: '#102030', link: '#7A1F6B' },
    green: { bg: '#DFF2E1', text: '#13261A', link: '#0B4F9C' },
    pink: { bg: '#FCE4EC', text: '#2A1A1F', link: '#0B4F9C' },
    grey: { bg: '#E6E6E6', text: '#1A1A1A', link: '#0B4F9C' },
    dark: { bg: '#1E1E1E', text: '#E8E2D0', link: '#8AB4F8' },
    custom: null
  };

  // Valeurs « neutres » : à ces valeurs, la propriété n'est pas modifiée sur la page.
  const NEUTRAL = {
    fontScale: 100,
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 1,
    paragraphSpacing: 0,
    lineWidth: 120
  };

  const DEFAULT_SETTINGS = Object.freeze({
    font: 'opendyslexic',
    fontScale: 100, // %
    fontWeight: 'default', // 'default' | 'normal' | 'bold'
    noItalic: false,
    textAlign: 'left', // voir CHOICES.textAlign
    textCase: 'default', // voir CHOICES.textCase
    // Espacements par défaut = niveau « Large » (voir SPACING_LEVELS).
    letterSpacing: 0.05, // em
    wordSpacing: 0.2, // em
    lineHeight: 1.6, // multiplicateur, 1 = inchangé
    paragraphSpacing: 0.5, // em, 0 = inchangé
    lineWidth: 120, // caractères (ch) par ligne, 120 = inchangé
    theme: 'none',
    customText: '#1A1A1A',
    customBg: '#FAF4E3',
    customLink: '#0B4F9C',
    linkHighlight: false,
    linkHighlightColor: '#FFF3A0',
    linkOutline: false
  });

  // Règle de lecture : outil commun à tous les sites (pas de réglage par site).
  const DEFAULT_RULER = Object.freeze({
    enabled: false,
    mode: 'band', // 'band' | 'mask'
    height: 48, // px
    opacity: 35, // %
    color: '#FFE45C'
  });

  const RULER_RANGES = {
    height: [16, 200],
    opacity: [10, 90]
  };

  // Réglages à choix fixe ; 'default' = la page garde sa propre valeur.
  const CHOICES = {
    fontWeight: ['default', 'normal', 'bold'],
    textAlign: ['default', 'left', 'center', 'right', 'justify'],
    textCase: ['default', 'lowercase', 'uppercase', 'capitalize']
  };

  const RANGES = {
    fontScale: [80, 200],
    letterSpacing: [0, 0.4],
    wordSpacing: [0, 1],
    lineHeight: [1, 3],
    paragraphSpacing: [0, 3],
    lineWidth: [20, 120]
  };

  // Les trois niveaux d'espacement de la popup (lettres, mots, interligne, paragraphes
  // réglés d'un coup). « Normal » laisse la page telle quelle. « Très large » reprend
  // les valeurs approchées du guide de la British Dyslexia Association.
  const SPACING_LEVELS = Object.freeze({
    normal: Object.freeze({ letterSpacing: 0, wordSpacing: 0, lineHeight: 1, paragraphSpacing: 0 }),
    large: Object.freeze({ letterSpacing: 0.05, wordSpacing: 0.2, lineHeight: 1.6, paragraphSpacing: 0.5 }),
    xlarge: Object.freeze({ letterSpacing: 0.12, wordSpacing: 0.42, lineHeight: 1.9, paragraphSpacing: 1 })
  });

  // Niveau correspondant aux réglages, ou null s'ils ont été ajustés finement.
  function spacingLevel(s) {
    for (const [name, level] of Object.entries(SPACING_LEVELS)) {
      if (Object.entries(level).every(([k, v]) => Math.abs(s[k] - v) < 1e-6)) return name;
    }
    return null;
  }

  // Fonds proposés dans la popup (la page avancée propose tous les thèmes).
  const SIMPLE_THEMES = ['none', 'cream', 'yellow', 'blue', 'dark'];

  // Préréglage « recommandé », inspiré du guide de la British Dyslexia Association
  // (valeurs approchées : espacement des lettres ≈ 35 % de la largeur moyenne d'une
  // lettre, des mots ≈ 3,5 × celui des lettres, interligne 1,5, fond pâle) et de
  // l'étude de Schneps et al. (2013) sur les lignes courtes.
  const RECOMMENDED = Object.freeze({
    letterSpacing: 0.12,
    wordSpacing: 0.42,
    lineHeight: 1.5,
    paragraphSpacing: 1,
    lineWidth: 70,
    textAlign: 'left',
    noItalic: true,
    theme: 'cream'
  });

  function defaultState() {
    return {
      version: STATE_VERSION,
      enabled: true, // interrupteur général
      global: { ...DEFAULT_SETTINGS },
      ruler: { ...DEFAULT_RULER },
      // host -> { enabled?: false (désactivé sur ce site), settings?: réglages propres }
      sites: {}
    };
  }

  function isColor(v) {
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  }

  function clamp(v, [min, max], fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // Valide et complète des réglages (données venant du stockage : jamais fiables).
  function sanitizeSettings(input) {
    const s = { ...DEFAULT_SETTINGS };
    if (!input || typeof input !== 'object') return s;
    if (Object.prototype.hasOwnProperty.call(FONTS, input.font)) s.font = input.font;
    if (Object.prototype.hasOwnProperty.call(THEMES, input.theme)) s.theme = input.theme;
    for (const k of ['noItalic', 'linkHighlight', 'linkOutline']) {
      if (typeof input[k] === 'boolean') s[k] = input[k];
    }
    for (const [k, values] of Object.entries(CHOICES)) {
      if (values.includes(input[k])) s[k] = input[k];
    }
    // Anciennes versions : cases « gras » et « aligner à gauche ».
    if (!('fontWeight' in input) && typeof input.bold === 'boolean') s.fontWeight = input.bold ? 'bold' : 'default';
    if (!('textAlign' in input) && typeof input.alignLeft === 'boolean') s.textAlign = input.alignLeft ? 'left' : 'default';
    for (const k of Object.keys(RANGES)) {
      if (k in input) s[k] = clamp(input[k], RANGES[k], DEFAULT_SETTINGS[k]);
    }
    for (const k of ['customText', 'customBg', 'customLink', 'linkHighlightColor']) {
      if (isColor(input[k])) s[k] = input[k];
    }
    return s;
  }

  function sanitizeRuler(input) {
    const r = { ...DEFAULT_RULER };
    if (!input || typeof input !== 'object') return r;
    if (typeof input.enabled === 'boolean') r.enabled = input.enabled;
    if (input.mode === 'band' || input.mode === 'mask') r.mode = input.mode;
    for (const k of Object.keys(RULER_RANGES)) {
      if (k in input) r[k] = clamp(input[k], RULER_RANGES[k], DEFAULT_RULER[k]);
    }
    if (isColor(input.color)) r.color = input.color;
    return r;
  }

  function sanitizeState(input) {
    const st = defaultState();
    if (!input || typeof input !== 'object') return st;
    if (typeof input.enabled === 'boolean') st.enabled = input.enabled;
    st.global = sanitizeSettings(input.global);
    // Version 1 : la règle faisait partie des réglages communs.
    const g = input.global || {};
    st.ruler = sanitizeRuler(
      input.ruler || { enabled: g.ruler, mode: g.rulerMode, height: g.rulerHeight, opacity: g.rulerOpacity, color: g.rulerColor }
    );
    if (input.sites && typeof input.sites === 'object') {
      for (const [host, site] of Object.entries(input.sites)) {
        if (!site || typeof site !== 'object') continue;
        const out = {};
        // Seule l'exception « désactivé » est mémorisée (version 1 : enabled: true possible).
        if (site.enabled === false) out.enabled = false;
        if (site.settings) out.settings = sanitizeSettings(site.settings);
        if (Object.keys(out).length) st.sites[normalizeHost(host)] = out;
      }
    }
    return st;
  }

  function normalizeHost(host) {
    return String(host || '').trim().toLowerCase().replace(/^www\./, '');
  }

  function hostFromURL(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return '';
      return u.protocol === 'file:' ? 'file' : normalizeHost(u.hostname);
    } catch (e) {
      return '';
    }
  }

  // Calcule ce qui s'applique sur un site donné.
  function resolve(state, host) {
    const h = normalizeHost(host);
    const site = (h && state.sites[h]) || {};
    return {
      active: state.enabled && site.enabled !== false,
      custom: Boolean(site.settings),
      settings: site.settings ? site.settings : state.global
    };
  }

  // Couleurs effectives du thème choisi (null si aucun thème).
  function themeColors(s) {
    if (s.theme === 'custom') return { bg: s.customBg, text: s.customText, link: s.customLink };
    return THEMES[s.theme] || null;
  }

  // Retire les entrées de site devenues vides.
  function pruneSite(state, host) {
    const site = state.sites[host];
    if (site && site.enabled !== false && !site.settings) delete state.sites[host];
  }

  root.Lisible = {
    STORAGE_KEY,
    FONTS,
    THEMES,
    NEUTRAL,
    CHOICES,
    RANGES,
    DEFAULT_SETTINGS,
    DEFAULT_RULER,
    RULER_RANGES,
    RECOMMENDED,
    SPACING_LEVELS,
    SIMPLE_THEMES,
    spacingLevel,
    defaultState,
    sanitizeSettings,
    sanitizeState,
    sanitizeRuler,
    normalizeHost,
    hostFromURL,
    resolve,
    themeColors,
    pruneSite
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
