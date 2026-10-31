/*
 * Popup : réglages simples. Deux onglets choisissent ce qui est modifié :
 * les réglages de tous les sites, ou ceux du site ouvert (en violet).
 * Les pages se mettent à jour d'elles-mêmes via storage.onChanged.
 */
(function () {
  'use strict';

  const L = globalThis.Lisible;
  const U = L.ui;
  const t = U.t;
  const $ = (sel) => document.querySelector(sel);

  const store = U.createStore({ onExternalChange: render });
  let host = '';
  let tab = 'global';

  // ---- Ce qui est modifié ---------------------------------------------------------

  function siteEntry() {
    return (host && store.state.sites[host]) || {};
  }

  function editingSite() {
    return tab === 'site' && Boolean(siteEntry().settings);
  }

  function target() {
    return editingSite() ? siteEntry().settings : store.state.global;
  }

  function ensureSite() {
    if (!store.state.sites[host]) store.state.sites[host] = {};
    return store.state.sites[host];
  }

  // ---- Annuler --------------------------------------------------------------------

  let snapshot = '';
  let undoState = null;
  let toastTimer = null;

  function remember() {
    // Plusieurs changements rapprochés (un curseur qu'on fait glisser) = une seule annulation.
    if (!toastTimer) undoState = snapshot;
  }

  function showToast(text) {
    $('#toast-text').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    undoState = null;
    $('#toast').hidden = true;
  }

  function undo() {
    if (!undoState) return;
    store.state = L.sanitizeState(JSON.parse(undoState));
    hideToast();
    store.save();
    render();
  }

  // Modification avec possibilité d'annuler.
  function mutate(message, fn) {
    remember();
    fn();
    store.save();
    render();
    showToast(message);
  }

  // ---- Affichage ------------------------------------------------------------------

  function render() {
    const st = store.state;
    const site = siteEntry();
    const custom = Boolean(site.settings);
    const onSiteTab = tab === 'site';
    const s = target();

    document.body.classList.toggle('off', !st.enabled);
    document.body.classList.toggle('editing-site', editingSite());
    $('#enabled').checked = st.enabled;
    $('#master-label').textContent = st.enabled ? t('masterOn', 'Activé') : t('masterOff', 'Désactivé partout');

    // Onglets
    $('#tab-site-name').textContent = host || t('noSite', 'Page non prise en charge');
    $('#tab-site').disabled = !host;
    $('#tab-global').setAttribute('aria-selected', String(!onSiteTab));
    $('#tab-site').setAttribute('aria-selected', String(onSiteTab));

    // Onglet du site
    $('#site-banner').hidden = !onSiteTab;
    $('#site-info').hidden = !onSiteTab || custom;
    $('#site-back').hidden = !onSiteTab || !custom;
    $('#controls').hidden = onSiteTab && !custom;
    $('#reset').hidden = onSiteTab && !custom;
    if (onSiteTab) {
      const enabled = site.enabled !== false;
      $('#site-enabled').checked = enabled;
      $('#site-title').textContent = custom
        ? `${t('siteOwnTitle', 'Réglages propres à')} ${host}`
        : `${t('siteOnTitle', 'Lisible sur')} ${host}`;
      $('#site-hint').textContent = !enabled
        ? t('siteOffHint', 'Lisible est désactivé sur ce site : il s’affiche tel quel.')
        : custom
          ? t('siteOwnHint', 'Ces réglages ne s’appliquent qu’à ce site.')
          : t('siteOnHint', 'Désactivez pour voir ce site tel quel.');
    }

    // Onglet « Tous les sites » alors que le site ouvert a ses propres réglages
    $('#global-note').hidden = onSiteTab || !custom;
    if (!onSiteTab && custom) {
      $('#global-note').textContent = `${host} ${t('globalNote', 'a ses propres réglages : ce que vous changez ici ne modifie pas cette page.')}`;
    }

    // Réglages
    U.renderControls(document.body, s, st.ruler);
    const level = L.spacingLevel(s);
    for (const el of document.querySelectorAll('input[name="spacing"]')) el.checked = el.value === level;
    $('#spacing-custom').hidden = level !== null;
    $('#bg-custom').hidden = L.SIMPLE_THEMES.includes(s.theme);

    snapshot = JSON.stringify(st);
  }

  // ---- Événements -----------------------------------------------------------------

  function bind() {
    $('#enabled').addEventListener('change', (e) => {
      mutate(e.target.checked ? t('toastOn', 'Lisible activé') : t('toastOff', 'Lisible désactivé partout'), () => {
        store.state.enabled = e.target.checked;
      });
    });

    $('#tab-global').addEventListener('click', () => {
      tab = 'global';
      render();
    });
    $('#tab-site').addEventListener('click', () => {
      tab = 'site';
      render();
    });

    $('#site-enabled').addEventListener('change', (e) => {
      mutate(e.target.checked ? t('toastSiteOn', 'Activé sur ce site') : t('toastSiteOff', 'Désactivé sur ce site'), () => {
        const entry = ensureSite();
        if (e.target.checked) delete entry.enabled;
        else entry.enabled = false;
        L.pruneSite(store.state, host);
      });
    });

    $('#site-customize').addEventListener('click', () => {
      mutate(t('toastCustomized', 'Réglages propres créés'), () => {
        ensureSite().settings = { ...store.state.global };
      });
    });

    $('#site-revert').addEventListener('click', () => {
      mutate(t('toastReverted', 'Ce site suit les réglages de tous les sites'), () => {
        delete ensureSite().settings;
        L.pruneSite(store.state, host);
      });
    });

    // Réglages : contrôles liés automatiquement (data-key / data-ruler).
    // La photo pour « Annuler » est prise avant que bindControls modifie l'état.
    document.body.addEventListener('input', remember, true);
    document.body.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('[data-step]')) remember();
      },
      true
    );
    U.bindControls(document.body, {
      settings: target,
      ruler: () => store.state.ruler,
      changed() {
        store.save();
        render();
        showToast(t('toastChanged', 'Réglage modifié'));
      }
    });

    // Espacement : un niveau règle lettres, mots, interligne et paragraphes.
    for (const el of document.querySelectorAll('input[name="spacing"]')) {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        mutate(t('toastChanged', 'Réglage modifié'), () => Object.assign(target(), L.SPACING_LEVELS[el.value]));
      });
    }

    $('#undo').addEventListener('click', undo);

    $('#more').addEventListener('click', async () => {
      // La page de réglages s'ouvre sur le site ouvert s'il a ses propres réglages.
      const hash = editingSite() ? `#site=${encodeURIComponent(host)}` : '';
      try {
        await U.api.tabs.create({ url: U.api.runtime.getURL(`options/options.html${hash}`) });
      } catch (e) {
        await U.api.runtime.openOptionsPage();
      }
      window.close();
    });

    U.confirmButton($('#reset'), {
      label: () => t('reset', 'Réinitialiser'),
      confirmLabel: () => t('resetConfirm', 'Confirmer ?'),
      action: () =>
        mutate(t('toastReset', 'Réglages par défaut rétablis'), () => {
          Object.assign(target(), L.DEFAULT_SETTINGS);
        })
    });
  }

  async function init() {
    U.applyI18n();
    U.fillFontSelect($('#font'));
    U.fillThemeSwatches($('#bg-swatches'), L.SIMPLE_THEMES);
    bind();
    [host] = await Promise.all([U.activeTabHost(), store.load()]);
    // On ouvre directement l'onglet du site s'il a ses propres réglages.
    if (host && siteEntry().settings) tab = 'site';
    render();
  }

  init();
})();
