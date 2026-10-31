/*
 * Content script : applique les réglages à la page et gère la règle de lecture.
 * Les réglages sont relus à chaque modification du stockage (popup, raccourcis).
 */
(function () {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const L = globalThis.Lisible;
  const isTop = window === window.top;

  let state = L.defaultState();
  let styleEl = null;
  let ruler = null;

  // Dans une iframe, on suit le site de l'onglet (origine de la page principale).
  function currentHost() {
    if (isTop) return L.hostFromURL(location.href);
    // Safari et Chrome : liste des origines parentes.
    const ao = location.ancestorOrigins;
    if (ao && ao.length) return L.hostFromURL(ao[ao.length - 1]);
    // Firefox n'a pas ancestorOrigins : page principale si même origine…
    try {
      return L.hostFromURL(window.top.location.href);
    } catch (e) {
      // … sinon la page qui a chargé le cadre (approximation).
      return L.hostFromURL(document.referrer) || L.hostFromURL(location.href);
    }
  }

  const host = currentHost();

  function ensureStyle() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'lisible-style';
    }
    // Ajouté à <html> (et non <head>) pour être présent dès document_start
    // et résister aux sites qui réécrivent le <head>.
    if (!styleEl.isConnected) document.documentElement.appendChild(styleEl);
    return styleEl;
  }

  function apply() {
    const doc = document.documentElement;
    // Très tôt (document_start), <html> peut ne pas encore exister.
    if (!doc) {
      new MutationObserver((_, obs) => {
        if (document.documentElement) {
          obs.disconnect();
          apply();
        }
      }).observe(document, { childList: true });
      return;
    }
    const r = L.resolve(state, host);
    if (!r.active) {
      doc.classList.remove('lisible-on');
      if (styleEl) styleEl.textContent = '';
      removeRuler();
      return;
    }
    const s = r.settings;
    ensureStyle().textContent =
      L.style.buildCSS(s, (p) => api.runtime.getURL(p)) + (isTop && state.ruler.enabled ? L.style.rulerCSS(state.ruler) : '');
    doc.classList.add('lisible-on');
    if (isTop && state.ruler.enabled) addRuler(state.ruler);
    else removeRuler();
  }

  // ---- Règle de lecture -------------------------------------------------------

  let pointerY = null;
  let rafPending = false;

  function addRuler(r) {
    if (!ruler) {
      ruler = document.createElement('div');
      ruler.id = 'lisible-ruler';
      ruler.setAttribute('aria-hidden', 'true');
      for (const cls of ['lisible-top', 'lisible-band', 'lisible-bottom']) {
        const d = document.createElement('div');
        d.className = cls;
        ruler.appendChild(d);
      }
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerdown', onPointer, { passive: true });
      window.addEventListener('touchmove', onTouch, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
    }
    ruler.dataset.height = String(r.height);
    if (!ruler.isConnected) document.documentElement.appendChild(ruler);
    schedule();
  }

  function removeRuler() {
    if (!ruler) return;
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('touchmove', onTouch);
    window.removeEventListener('resize', schedule);
    ruler.remove();
    ruler = null;
  }

  function onPointer(e) {
    pointerY = e.clientY;
    schedule();
  }

  function onTouch(e) {
    if (e.touches && e.touches[0]) {
      pointerY = e.touches[0].clientY;
      schedule();
    }
  }

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(position);
  }

  function position() {
    rafPending = false;
    if (!ruler) return;
    const h = Number(ruler.dataset.height) || 48;
    const vh = window.innerHeight;
    const y = pointerY === null ? vh / 3 : pointerY;
    const top = Math.max(0, Math.min(vh - h, Math.round(y - h / 2)));
    const [above, band, below] = ruler.children;
    above.style.setProperty('height', `${top}px`, 'important');
    band.style.setProperty('top', `${top}px`, 'important');
    band.style.setProperty('height', `${h}px`, 'important');
    below.style.setProperty('top', `${top + h}px`, 'important');
  }

  // ---- Synchronisation --------------------------------------------------------

  async function load() {
    const data = await api.storage.local.get(L.STORAGE_KEY);
    state = L.sanitizeState(data[L.STORAGE_KEY]);
    apply();
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[L.STORAGE_KEY]) return;
    state = L.sanitizeState(changes[L.STORAGE_KEY].newValue);
    apply();
  });

  // La popup et le background demandent le site courant à la page principale.
  if (isTop) {
    api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'lisible:getHost') {
        sendResponse({ host });
      }
    });
  }

  if (host) load();
})();
