/*
 * Page « Plus de réglages » : tous les réglages fins, la règle de lecture,
 * et la liste des sites particuliers. Le sélecteur « Vous modifiez » choisit
 * entre les réglages de tous les sites et ceux d'un site (en violet).
 */
(function () {
  'use strict';

  const L = globalThis.Lisible;
  const U = L.ui;
  const t = U.t;
  const $ = (sel) => document.querySelector(sel);

  const store = U.createStore({ onExternalChange: render });
  let editing = ''; // '' = tous les sites, sinon le site dont on modifie les réglages

  function target() {
    const site = editing && store.state.sites[editing];
    return site && site.settings ? site.settings : store.state.global;
  }

  function changed() {
    store.save();
    render();
  }

  // ---- Affichage ------------------------------------------------------------------

  function renderTargetSelect() {
    const select = $('#target');
    const hosts = Object.keys(store.state.sites)
      .filter((h) => store.state.sites[h].settings)
      .sort();
    if (editing && !hosts.includes(editing)) editing = '';
    select.textContent = '';
    const all = new Option(t('tabGlobal', 'Tous les sites'), '');
    select.add(all);
    for (const h of hosts) select.add(new Option(`📍 ${h}`, h));
    select.value = editing;
    $('#target-hint').textContent = editing
      ? t('editingSiteHint', 'Ces réglages ne s’appliquent qu’à ce site.')
      : hosts.length
        ? t('editingGlobalHintSites', 'Les sites qui ont leurs propres réglages ne sont pas concernés.')
        : '';
  }

  function siteRow(host, site) {
    const tr = document.createElement('tr');

    const tdHost = document.createElement('td');
    tdHost.className = 'host';
    tdHost.textContent = host;

    const tdOn = document.createElement('td');
    const sw = document.createElement('label');
    sw.className = 'switch small';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = site.enabled !== false;
    input.setAttribute('aria-label', `${t('colLisible', 'Lisible')} — ${host}`);
    input.addEventListener('change', () => {
      if (input.checked) delete site.enabled;
      else site.enabled = false;
      L.pruneSite(store.state, host);
      changed();
    });
    sw.append(input, document.createElement('span'));
    tdOn.appendChild(sw);

    const tdSettings = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${site.settings ? 'own' : 'common'}`;
    badge.textContent = site.settings ? t('settingsOwn', 'Propres au site') : t('settingsCommon', 'Communs');
    tdSettings.appendChild(badge);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'link';
    edit.textContent = site.settings ? t('edit', 'Modifier') : t('siteCustomizeShort', 'Personnaliser');
    edit.addEventListener('click', () => {
      if (!site.settings) site.settings = { ...store.state.global };
      editing = host;
      changed();
      $('#text').scrollIntoView({ behavior: 'smooth' });
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link remove';
    remove.textContent = t('remove', 'Retirer');
    remove.title = t('removeHint', 'Ce site suivra à nouveau les réglages de tous les sites.');
    remove.addEventListener('click', () => {
      delete store.state.sites[host];
      changed();
    });
    tdActions.append(edit, remove);

    tr.append(tdHost, tdOn, tdSettings, tdActions);
    return tr;
  }

  function renderSites() {
    const body = $('#sites-body');
    body.textContent = '';
    const hosts = Object.keys(store.state.sites).sort();
    for (const h of hosts) body.appendChild(siteRow(h, store.state.sites[h]));
    $('#sites-empty').hidden = hosts.length > 0;
    $('#sites-table').hidden = hosts.length === 0;
  }

  function render() {
    const st = store.state;
    renderTargetSelect();
    const s = target();

    document.body.classList.toggle('editing-site', Boolean(editing));
    $('#enabled').checked = st.enabled;
    $('#master-label').textContent = st.enabled ? t('masterOn', 'Activé') : t('masterOff', 'Désactivé partout');

    U.renderControls(document.body, s, st.ruler);
    const level = L.spacingLevel(s);
    for (const el of document.querySelectorAll('input[name="o-spacing"]')) el.checked = el.value === level;
    $('#custom-colors').classList.toggle('show', s.theme === 'custom');
    $('#o-link-color').hidden = !s.linkHighlight;
    U.renderPreview($('#preview-style'), s, '#preview');
    renderSites();
  }

  // ---- Événements -----------------------------------------------------------------

  function bind() {
    $('#enabled').addEventListener('change', (e) => {
      store.state.enabled = e.target.checked;
      changed();
    });

    $('#target').addEventListener('change', (e) => {
      editing = e.target.value;
      render();
    });

    U.bindControls($('main'), { settings: target, ruler: () => store.state.ruler, changed });

    for (const el of document.querySelectorAll('input[name="o-spacing"]')) {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        Object.assign(target(), L.SPACING_LEVELS[el.value]);
        changed();
      });
    }

    $('#recommended').addEventListener('click', () => {
      Object.assign(target(), L.RECOMMENDED);
      changed();
    });

    U.confirmButton($('#reset-target'), {
      label: () => t('resetTarget', 'Réinitialiser ces réglages'),
      confirmLabel: () => t('resetConfirm', 'Confirmer ?'),
      action: () => {
        Object.assign(target(), L.DEFAULT_SETTINGS);
        changed();
      }
    });

    U.confirmButton($('#reset-all'), {
      label: () => t('resetAll', 'Tout réinitialiser (y compris les sites)'),
      confirmLabel: () => t('resetAllConfirm', 'Confirmer : tout effacer ?'),
      action: () => {
        store.state = L.defaultState();
        editing = '';
        changed();
      }
    });
  }

  async function init() {
    U.applyI18n();
    U.fillFontSelect($('#o-font'));
    U.fillThemeSwatches($('#o-themes'), Object.keys(L.THEMES));
    U.fillCredits($('#credits-list'));
    $('#version').textContent = U.api.runtime.getManifest().version;
    bind();
    await store.load();
    // options.html#site=exemple.fr : ouvre directement les réglages de ce site.
    const m = /site=([^&]+)/.exec(location.hash);
    if (m) editing = L.normalizeHost(decodeURIComponent(m[1]));
    render();
  }

  init();
})();
