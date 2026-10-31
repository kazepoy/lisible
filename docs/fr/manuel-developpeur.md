# Manuel développeur

*[English](../en/developer-guide.md) · Français*

## 1. Vue d'ensemble

Lisible est une **Web Extension Manifest V3**, sans dépendance. Un seul code source (`extension/`) sert à tous les navigateurs ; `scripts/build.mjs` en dérive une version par navigateur dans `dist/` (ignoré par git).

Pour Safari, l'extension doit être livrée dans une **app conteneur** (macOS, iOS), générée par l'outil d'Apple `safari-web-extension-converter` et non versionnée (dossier `xcode/`, ignoré par git).

```
extension/
  manifest.json
  shared/settings.js   modèle de réglages (sans DOM, testable sous Node)
  shared/style.js      génération du CSS (fonctions pures)
  content/content.js   injecté dans chaque page et iframe (document_start)
  shared/ui.js         outils d'interface communs (stockage, traductions, liaison des contrôles)
  shared/ui.css        styles communs (couleurs, interrupteurs, curseurs, pastilles)
  popup/               popup : réglages simples, onglets « Tous les sites » / site
  options/             page « Plus de réglages » : réglages fins, Mes sites, À propos
  background.js        raccourcis clavier (module ES)
  fonts/               WOFF2 latin 400/700 (+ italique) et licences OFL
  icons/               icônes de l'extension et de la barre d'outils
  _locales/fr|en/      textes de l'interface (fr par défaut)
scripts/build.mjs      builds Chrome / Firefox / Safari + zips (dist/)
scripts/creer-projet-xcode.sh
tests/                 node:test + Playwright
LICENSE                PolyForm Noncommercial 1.0.0 (le code) ; polices sous OFL
assets/app-icon-1024.png
```

## 2. Architecture

```
popup.js ───┐
options.js ─┼─écrit──▶ storage.local["lisible"] ──onChanged──▶ content.js ──▶ <style> + règle de lecture
background.js ┘ (raccourcis)                                    (toutes les pages et iframes)
```

- **Source unique de vérité** : l'objet `storage.local["lisible"]`. La popup, la page de réglages et le background ne parlent jamais directement aux pages : ils écrivent l'état, et chaque content script réagit à `storage.onChanged`. La popup et la page de réglages se tiennent aussi à jour entre elles par ce biais (`createStore` dans `shared/ui.js`).
- **Espace de noms global** `Lisible` : `shared/settings.js` le crée, `shared/style.js` lui ajoute `Lisible.style` et `shared/ui.js` (interfaces seulement) `Lisible.ui`. Ce sont des scripts classiques, pour pouvoir les charger à la fois en content script, avec `<script>` dans la popup, par `import` dans le background (module) et par `require` dans les tests.
- **Seul message échangé** : `{ type: 'lisible:getHost' }`. La popup et le background demandent le site courant à la page principale quand `tab.url` n'est pas disponible (selon les permissions accordées dans Safari).

### Modèle de données

```js
{
  version: 2,
  enabled: true,          // interrupteur général
  global: { ...settings },  // réglages de texte communs
  ruler: { enabled, mode, height, opacity, color },  // règle de lecture, commune
  sites: {
    'exemple.fr': { enabled?: false, settings?: { ...settings } }
  }
}
```

- `Lisible.resolve(state, host)` renvoie `{ active, custom, settings }`. C'est la seule logique de décision « actif ou non sur ce site ».
- Les noms de site sont normalisés par `normalizeHost` : minuscules, sans `www.`. Les pages `file://` ont le site `file`.
- Dans une iframe, le site retenu est celui de l'onglet, pour que les exceptions par site s'appliquent aussi aux cadres intégrés (voir la partie 6 pour Firefox).
- Tout ce qui est lu du stockage passe par `sanitizeState` / `sanitizeSettings` / `sanitizeRuler` : valeurs bornées, listes fermées, couleurs `#rrggbb`.
- **Migration de la version 1** : les anciens champs `bold` / `alignLeft` sont convertis ; la règle (`global.ruler*`) passe dans `state.ruler` ; le mode « sites choisis » (`scope`) et l'exception « Toujours » (`enabled: true`) sont abandonnés.
- **Niveaux d'espacement** (`SPACING_LEVELS`) : *Normal / Large / Très large* règlent ensemble lettres, mots, interligne et paragraphes. `spacingLevel(s)` retrouve le niveau, ou `null` après un réglage fin.

### Génération du CSS (`shared/style.js`)

- `buildCSS(settings, urlFor, root)` produit tout le CSS. `root` vaut `html.lisible-on body` sur les pages et `#preview` dans l'aperçu de la page « Plus de réglages » : **l'aperçu utilise exactement le même code que les pages**.
- **Valeur neutre** : une propriété n'est émise que si sa valeur diffère de `Lisible.NEUTRAL` (ou de `'default'` pour les choix fixes). Une page n'est donc jamais modifiée pour rien.
- Toutes les déclarations sont en `!important` pour passer devant le CSS des sites.
- **Exclusions de police** (`FONT_EXCLUDE`) : code, formules, SVG, éléments `:empty` (presque toujours des icônes dessinées en `::before`) et classes d'icônes courantes.
- **Polices** : `@font-face` générés avec `runtime.getURL` ; les fichiers sont listés dans `web_accessible_resources`.
- **Règle de lecture** : elle est attachée à `<html>`, hors de `<body>`, pour ne subir ni le `zoom` de la taille du texte ni les thèmes. Son conteneur porte `mix-blend-mode: multiply` pour que le texte sous la bande garde son contraste.

## 3. Ajouter un réglage

1. **`shared/settings.js`**
   - ajouter la valeur par défaut dans `DEFAULT_SETTINGS` ;
   - selon le type : la borne dans `RANGES` (nombre), la liste dans `CHOICES` (choix fixe), la liste des booléens ou celle des couleurs dans `sanitizeSettings` ;
   - pour un nombre, ajouter la valeur « inchangée » dans `NEUTRAL` si elle existe.
2. **`shared/style.js`** : émettre le CSS dans `buildCSS`, préfixé par `${R}` et seulement hors valeur neutre.
3. **`options/options.html`** (et `popup/popup.html` seulement si c'est un réglage essentiel) : ajouter un contrôle portant `data-key="<nom>"` (`range`, `checkbox`, `radio`, `select` ou `color`). La lecture et l'écriture sont automatiques (`bindControls` / `renderControls` dans `shared/ui.js`). Pour un curseur, ajouter aussi `<output data-for="<nom>">`. Un champ de la règle de lecture utilise `data-ruler` au lieu de `data-key`.
4. **`shared/ui.js`** : pour un curseur, ajouter son format d'affichage dans `FORMAT`.
5. **`_locales/fr` et `_locales/en`** : ajouter les textes (`data-i18n="<clé>"`).
6. **Tests** : assainissement et CSS dans `tests/settings.test.js`, rendu réel dans `tests/e2e.test.js`.

**Organisation de l'interface** :
- **Popup** : en-tête (interrupteur général), règle de lecture (réglages repliés), onglets *Tous les sites / site*, quatre réglages simples (police, taille, espacement, fond), pied (*Plus de réglages*, *Réinitialiser*), et un bandeau *Annuler* après chaque changement. Quand l'onglet du site est actif et qu'il a ses propres réglages, la classe `editing-site` passe l'accent en violet (`--accent: var(--site)`).
- **Page « Plus de réglages »** (`options_ui`, ouverte dans un onglet) : règle de lecture, sélecteur *Vous modifiez*, aperçu, sections de réglages fins, *Mes sites*, *À propos*. `options.html#site=exemple.fr` l'ouvre sur les réglages de ce site.

## 4. Ajouter une police

1. Récupérer les WOFF2 sous licence libre, par exemple `npm pack @fontsource/<police>`, et copier `files/<police>-latin-{400,700}-{normal,italic}.woff2` dans `extension/fonts/`.
2. Copier la licence dans `extension/fonts/licenses/`.
3. Déclarer la police dans `FONTS` (`shared/settings.js`) : `family` (préfixée par `Lisible ` pour éviter un conflit avec une police du site), `file`, `italic`, `fallback` et `author`. La licence doit s'appeler `fonts/licenses/<file>-OFL.txt` : la rubrique *Crédits et licences* de la page « Plus de réglages » la relie automatiquement.
4. Ajouter un `@font-face` dans `shared/ui.css`, pour l'échantillon de police des interfaces.
5. Vérifier la couverture des caractères français (`éèàçœ«»’…`), par exemple avec `fontTools`.

## 5. Traductions

- Les textes sont dans `_locales/<langue>/messages.json`, avec le français par défaut (`default_locale`).
- `applyI18n` (`shared/ui.js`) remplace le contenu des éléments `data-i18n`, le `title` des éléments `data-i18n-title` et l'`aria-label` des éléments `data-i18n-label`. Le texte écrit dans le HTML sert de repli.
- Pour ajouter une langue : créer `_locales/<code>/messages.json` avec **toutes** les clés du français.

## 6. Builds par navigateur

```bash
npm run build            # ou : node scripts/build.mjs chrome|firefox|safari
```

`extension/manifest.json` est le manifest de Safari ; le script en dérive les autres :

| Navigateur | Différences |
|---|---|
| **Chrome / Edge** | `background.service_worker` (Chrome refuse `background.scripts`), `minimum_chrome_version: 111` (pour `color-mix()`) |
| **Firefox** | `browser_specific_settings.gecko` : identifiant `lisible@lisible-extension` (à ne jamais changer une fois publié), version minimale 140, déclaration « aucune donnée collectée » exigée par addons.mozilla.org ; `gecko_android` : Firefox pour Android 142+ |
| **Safari** | aucune ; le projet Xcode utilise directement `extension/` |

Différences gérées dans le code :
- **Iframes** : Firefox n'a pas `location.ancestorOrigins`. Le content script lit alors `window.top.location` quand c'est la même origine, sinon `document.referrer`.
- **Raccourcis** : Firefox pour Android n'a pas l'API `commands`, d'où l'appel `api.commands?.…` dans `background.js`.
- **API** : `globalThis.browser || globalThis.chrome`. Les API utilisées renvoient des promesses dans les trois navigateurs en Manifest V3.

**Essayer sans publier :**
- **Chrome / Edge** : `chrome://extensions`, *Mode développeur*, puis *Charger l'extension non empaquetée* → `dist/chrome`.
- **Firefox** : `about:debugging`, puis *Ce Firefox* → *Charger un module complémentaire temporaire* → `dist/firefox/manifest.json`. Ou `npx web-ext run --source-dir dist/firefox`.
- **Firefox pour Android** : téléphone en débogage USB, puis `npx web-ext run -t firefox-android --source-dir dist/firefox` (voir la documentation de `web-ext` pour les options d'appareil). Pas encore essayé.

## 7. Tests

```bash
npm test              # unitaires + bout en bout + build Chrome réel
npm run test:unit     # unitaires seulement (Node seul)
npm run lint:firefox  # validation du build Firefox par l'outil de Mozilla
```

- `tests/chrome.test.js` construit `dist/chrome` et le **charge réellement dans Chromium** : service worker, content script, polices et popup, avec les vraies API d'extension.

- **Prérequis** : Node 22 ou plus, et Playwright avec Chromium pour les tests de bout en bout (`npm i -D playwright && npx playwright install chromium` s'ils ne sont pas déjà installés).
- `tests/fixtures/browser-shim.js` simule `storage`, `runtime`, `tabs` et `i18n`. Les content scripts sont injectés comme au `document_start`, avec `addInitScript`.
- **Ce que les tests ne couvrent pas** : Safari (permissions par site, CSP des sites, popup iOS), l'exécution réelle dans Firefox et Firefox pour Android, et Edge. À vérifier à la main avant chaque publication.

## 8. Safari : compiler, lancer, déboguer (Mac + Xcode)

```bash
./scripts/creer-projet-xcode.sh fr.mondomaine.lisible
open xcode/Lisible/Lisible.xcodeproj
```

- Le projet **référence** `extension/` sans le copier. Il suffit de relancer *Run* après une modification ; inutile de regénérer.
- Regénérer le projet seulement si la structure change (nouveau dossier à la racine de l'extension, par exemple). L'option `--force` écrase `xcode/`.
- **Signature** : choisir une équipe dans *Signing & Capabilities* pour chaque cible (app et extension, macOS et iOS).
- **Déboguer sur macOS** : activer le menu *Développement* (*Réglages > Avancés*), puis *Développement > Autoriser les extensions non signées* pour un build non signé. L'inspecteur web de la page montre le content script ; le menu *Développement* donne accès au background et à la popup.
- **Déboguer sur iOS** : activer *Réglages > Apps > Safari > Avancé > Inspecteur web* sur l'appareil, le brancher au Mac, puis passer par le menu *Développement* de Safari sur le Mac.
- Si l'outil de conversion refuse une option du script, `xcrun safari-web-extension-converter --help` donne la syntaxe de la version installée.

## 9. Publier

**Tous navigateurs**
1. Mettre à jour `version` dans `extension/manifest.json`, puis lancer `npm run build` et `npm test`.

**Chrome Web Store, Edge Add-ons, addons.mozilla.org** : envoyer le zip correspondant de `dist/` (`lisible-chrome-<version>.zip` pour Chrome et Edge, `lisible-firefox-<version>.zip` pour Firefox). D'après mes informations, à vérifier, la publication est gratuite sur Firefox et Edge, et coûte 5 $ une seule fois sur Chrome. Firefox demandera peut-être le code source : le dépôt suffit, puisqu'il n'y a ni minification ni bundler. Licence : choisir une licence personnalisée et coller le texte de `LICENSE` (PolyForm Noncommercial 1.0.0 n'est pas dans la liste d'AMO).

**App Store (Safari)**
1. Mettre à jour les numéros de version et de build dans Xcode.
2. Lancer `npm test`, puis vérifier à la main sur Mac, iPhone et iPad.
3. *Product > Archive* pour chaque plateforme, puis l'envoyer dans App Store Connect.
4. L'icône de l'app (1024 × 1024) est `assets/app-icon-1024.png`.
5. **Confidentialité** : l'extension ne collecte aucune donnée. Elle demande l'accès à tous les sites pour pouvoir s'appliquer partout ; il faut le justifier dans la fiche App Store.

## 10. Conventions

- **Code** : JavaScript sans framework ni bundler. Commentaires en français ; textes de l'interface en français et en anglais.
- **Documentation** : en français (`README.fr.md`, `docs/fr/`) et en anglais (`README.md`, `docs/en/`). Toute modification doit être reportée dans les deux langues.
- **Stockage** : ne jamais lire le stockage sans passer par `sanitizeState`.
- **CSS** : toute nouvelle règle de page doit être préfixée par la racine `${R}` et ne doit rien émettre à la valeur neutre.
- **Commits** : messages en français, à l'impératif (« Ajoute… », « Corrige… »).
