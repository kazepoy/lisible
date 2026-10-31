// Simule l'API WebExtension (storage, runtime, tabs, i18n) dans une page de test.
(function () {
  const store = {};
  const listeners = [];
  const base = window.__LISIBLE_EXT_BASE__;
  const tabURL = window.__LISIBLE_TAB_URL__ || 'https://exemple.fr/article';
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  window.browser = {
    storage: {
      local: {
        async get(key) {
          return key in store ? { [key]: clone(store[key]) } : {};
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) {
            const oldValue = store[k];
            store[k] = clone(v);
            for (const fn of listeners) fn({ [k]: { oldValue, newValue: clone(v) } }, 'local');
          }
        }
      },
      onChanged: { addListener: (fn) => listeners.push(fn) }
    },
    runtime: {
      getURL: (p) => base + p,
      getManifest: () => ({ version: '1.0.0' }),
      async openOptionsPage() {
        window.__lisibleOpened = 'options';
      },
      onMessage: { addListener() {} }
    },
    tabs: {
      async query() {
        return [{ id: 1, url: tabURL }];
      },
      async create({ url }) {
        window.__lisibleOpened = url;
      },
      async sendMessage() {
        return {};
      }
    },
    i18n: { getMessage: () => '' }
  };
  window.__lisibleStore = store;
})();
