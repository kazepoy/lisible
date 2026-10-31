/*
 * Background : raccourcis clavier (macOS).
 *   - toggle-site  : active / désactive Lisible sur le site courant
 *   - toggle-ruler : affiche / masque la règle de lecture
 */
import './shared/settings.js';

const api = globalThis.browser || globalThis.chrome;
const L = globalThis.Lisible;

async function activeHost() {
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

async function update(mutate) {
  const host = await activeHost();
  if (!host) return;
  const data = await api.storage.local.get(L.STORAGE_KEY);
  const state = L.sanitizeState(data[L.STORAGE_KEY]);
  mutate(state, host);
  await api.storage.local.set({ [L.STORAGE_KEY]: state });
}

// Firefox pour Android n'a pas de raccourcis clavier (API commands absente).
api.commands?.onCommand.addListener((command) => {
  if (command === 'toggle-site') {
    update((state, host) => {
      if (!state.enabled) {
        // Interrupteur général coupé : on le rallume et on active ce site.
        state.enabled = true;
        if (state.sites[host]) delete state.sites[host].enabled;
      } else if (L.resolve(state, host).active) {
        state.sites[host] = { ...state.sites[host], enabled: false };
      } else {
        delete state.sites[host].enabled;
      }
      L.pruneSite(state, host);
    });
  } else if (command === 'toggle-ruler') {
    update((state) => {
      state.ruler.enabled = !state.ruler.enabled;
    });
  }
});
