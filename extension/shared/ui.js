/*
 * Outils d'interface communs à la popup et à la page « Plus de réglages ».
 * Exposés sur globalThis.Lisible.ui.
 *
 * Liaison automatique des contrôles :
 *   data-key="<réglage>"   un réglage de texte (réglages communs ou du site édité)
 *   data-ruler="<champ>"   un champ de la règle de lecture (commune à tous les sites)
 *   <output data-for="…">  affiche la valeur d'un curseur (même nom que data-key / data-ruler)
 */
(function (root) {
  'use strict';

  const L = root.Lisible;
  const api = root.browser || root.chrome;

  function t(key, fallback) {
    const msg = api && api.i18n ? api.i18n.getMessage(key) : '';
    return msg || fallback || key;
  }

  function applyI18n(scope = document) {
    if (scope === document) document.documentElement.lang = t('@@ui_locale', 'fr').slice(0, 2);
    for (const el of scope.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, el.textContent);
    for (const el of scope.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle, el.title);
    for (const el of scope.querySelectorAll('[data-i18n-label]')) {
      el.setAttribute('aria-label', t(el.dataset.i18nLabel, el.getAttribute('aria-label') || ''));
    }
  }

  // ---- Stockage -----------------------------------------------------------------

  /**
   * État partagé avec le stockage. `onExternalChange` est appelé quand une autre vue
   * (popup, page de réglages, raccourci clavier) modifie l'état.
   */
  function createStore({ onExternalChange }) {
    const store = {
      state: L.defaultState(),
      async load() {
        const data = await api.storage.local.get(L.STORAGE_KEY);
        store.state = L.sanitizeState(data[L.STORAGE_KEY]);
      },
      save() {
        clearTimeout(timer);
        timer = setTimeout(flush, 120);
      }
    };
    let timer = null;
    let lastWritten = '';

    function flush() {
      timer = null;
      lastWritten = JSON.stringify(store.state);
      api.storage.local.set({ [L.STORAGE_KEY]: store.state });
    }

    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[L.STORAGE_KEY]) return;
      const incoming = changes[L.STORAGE_KEY].newValue;
      // Nos propres écritures, ou une écriture en attente : on garde l'état local.
      if (timer || JSON.stringify(incoming) === lastWritten) return;
      store.state = L.sanitizeState(incoming);
      onExternalChange();
    });
    return store;
  }

  // ---- Libellés -----------------------------------------------------------------

  function fontLabel(id) {
    return id === 'none' ? t('fontNone', 'Police du site') : L.FONTS[id].label;
  }

  function fontCSS(id) {
    const f = L.FONTS[id];
    return f && f.family ? `"${f.family}", ${f.fallback}` : '';
  }

  const DEFAULT_LABEL = () => t('default', 'inchangé');
  const FORMAT = {
    fontScale: (v) => `${v} %`,
    letterSpacing: (v) => (v === L.NEUTRAL.letterSpacing ? DEFAULT_LABEL() : `${v.toFixed(2)} em`),
    wordSpacing: (v) => (v === L.NEUTRAL.wordSpacing ? DEFAULT_LABEL() : `${v.toFixed(2)} em`),
    lineHeight: (v) => (v === L.NEUTRAL.lineHeight ? DEFAULT_LABEL() : `× ${v.toFixed(1)}`),
    paragraphSpacing: (v) => (v === L.NEUTRAL.paragraphSpacing ? DEFAULT_LABEL() : `${v.toFixed(2)} em`),
    lineWidth: (v) => (v === L.NEUTRAL.lineWidth ? DEFAULT_LABEL() : `${v} ${t('chars', 'caractères')}`),
    height: (v) => `${v} px`,
    opacity: (v) => `${v} %`
  };

  // ---- Construction des contrôles -----------------------------------------------

  function fillFontSelect(select) {
    for (const id of Object.keys(L.FONTS)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = fontLabel(id);
      select.appendChild(opt);
    }
  }

  // Pastilles de couleur de fond (boutons radio data-key="theme").
  function fillThemeSwatches(box, themes) {
    for (const id of themes) {
      const c = L.THEMES[id];
      const name = t(`theme_${id}`, id);
      const label = document.createElement('label');
      label.className = 'swatch';
      label.title = name;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `theme-${box.id}`;
      input.value = id;
      input.dataset.key = 'theme';
      input.setAttribute('aria-label', name);
      const dot = document.createElement('span');
      if (c) {
        dot.style.background = c.bg;
        dot.style.color = c.text;
        dot.textContent = 'Aa';
      } else if (id === 'custom') {
        dot.style.background = 'conic-gradient(#f66, #fd5, #6d6, #6cf, #a7f, #f66)';
      } else {
        dot.className = 'none';
        dot.textContent = 'Aa';
      }
      label.append(input, dot);
      box.appendChild(label);
    }
  }

  // ---- Lecture / écriture des contrôles -----------------------------------------

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range') return Number(el.value);
    return el.value;
  }

  function writeValue(el, v) {
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (el.type === 'radio') el.checked = el.value === String(v);
    else el.value = v;
  }

  /**
   * Relie les contrôles d'un conteneur.
   * @param {Element} scope
   * @param {{ settings(): object, ruler(): object, changed(kind: string, key: string): void }} hooks
   */
  function bindControls(scope, hooks) {
    function onInput(e) {
      const el = e.target;
      if (el.type === 'radio' && !el.checked) return;
      if (el.dataset.key) {
        const s = hooks.settings();
        Object.assign(s, L.sanitizeSettings({ ...s, [el.dataset.key]: readValue(el) }));
        hooks.changed('settings', el.dataset.key);
      } else if (el.dataset.ruler) {
        const r = hooks.ruler();
        Object.assign(r, L.sanitizeRuler({ ...r, [el.dataset.ruler]: readValue(el) }));
        hooks.changed('ruler', el.dataset.ruler);
      }
    }
    scope.addEventListener('input', onInput);
    scope.addEventListener('change', onInput);

    // Boutons « pas à pas » : data-step="fontScale" data-delta="10".
    scope.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-step]');
      if (!btn) return;
      const s = hooks.settings();
      const key = btn.dataset.step;
      Object.assign(s, L.sanitizeSettings({ ...s, [key]: s[key] + Number(btn.dataset.delta) }));
      hooks.changed('settings', key);
    });
  }

  function renderControls(scope, s, r) {
    for (const el of scope.querySelectorAll('[data-key]')) {
      if (el.dataset.key in s) writeValue(el, s[el.dataset.key]);
    }
    for (const el of scope.querySelectorAll('[data-ruler]')) writeValue(el, r[el.dataset.ruler]);
    for (const out of scope.querySelectorAll('output[data-for]')) {
      const k = out.dataset.for;
      const v = k in s ? s[k] : r[k];
      out.textContent = FORMAT[k] ? FORMAT[k](v) : String(v);
    }
    for (const btn of scope.querySelectorAll('[data-step]')) {
      const [min, max] = L.RANGES[btn.dataset.step];
      const next = s[btn.dataset.step] + Number(btn.dataset.delta);
      btn.disabled = next < min || next > max;
    }
    for (const el of scope.querySelectorAll('.font-sample')) el.style.fontFamily = fontCSS(s.font);
    for (const el of scope.querySelectorAll('[data-show-if-ruler]')) {
      el.classList.toggle('dim', !r.enabled);
    }
    for (const el of scope.querySelectorAll('[data-show-if-band]')) el.hidden = r.mode !== 'band';
  }

  // Bouton qui demande confirmation au premier clic (confirm() n'est pas fiable
  // dans les popups d'extension).
  function confirmButton(btn, { label, confirmLabel, action }) {
    let timer = null;
    const reset = () => {
      clearTimeout(timer);
      btn.classList.remove('confirm');
      btn.textContent = label();
    };
    btn.addEventListener('click', () => {
      if (!btn.classList.contains('confirm')) {
        btn.classList.add('confirm');
        btn.textContent = confirmLabel();
        timer = setTimeout(reset, 3000);
        return;
      }
      reset();
      action();
    });
  }

  // Applique au conteneur d'aperçu le CSS réellement injecté dans les pages.
  function renderPreview(styleEl, s, rootSelector) {
    styleEl.textContent = L.style.buildCSS(s, (p) => api.runtime.getURL(p), rootSelector);
  }

  // Une ligne de crédits par police embarquée, avec un lien vers sa licence.
  function fillCredits(list) {
    for (const f of Object.values(L.FONTS)) {
      if (!f.file) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = api.runtime.getURL(`fonts/licenses/${f.file}-OFL.txt`);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = f.label;
      li.append(a, ` — © ${f.author} — SIL OFL 1.1`);
      list.appendChild(li);
    }
  }

  async function activeTabHost() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return '';
    const fromURL = tab.url ? L.hostFromURL(tab.url) : '';
    if (fromURL) return fromURL;
    try {
      const res = await api.tabs.sendMessage(tab.id, { type: 'lisible:getHost' });
      return (res && res.host) || '';
    } catch (e) {
      return '';
    }
  }

  root.Lisible.ui = Object.freeze({
    api,
    t,
    applyI18n,
    createStore,
    fontLabel,
    fontCSS,
    FORMAT,
    fillFontSelect,
    fillThemeSwatches,
    bindControls,
    renderControls,
    confirmButton,
    renderPreview,
    fillCredits,
    activeTabHost
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
