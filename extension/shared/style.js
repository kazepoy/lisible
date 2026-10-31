/*
 * Génération de la feuille de style appliquée aux pages.
 * Fonctions pures (testables hors navigateur) exposées sur globalThis.Lisible.style.
 */
(function (root) {
  'use strict';

  const L = root.Lisible;
  const ON = 'html.lisible-on';
  const PAGE_ROOT = `${ON} body`;

  // Éléments dont on ne touche pas la police : code, formules, SVG et polices d'icônes.
  // Les éléments vides (:empty) n'ont pas de texte : ce sont presque toujours des icônes
  // dessinées via ::before/::after avec une police dédiée.
  const FONT_EXCLUDE = [
    'pre', 'pre *', 'code', 'kbd', 'samp', 'tt', 'var', 'math', 'math *',
    'svg', 'svg *', ':empty',
    '[class*="icon" i]', '[class*="fa-"]', '.fa', '.fas', '.far', '.fab', '.fal', '.fad',
    '[class*="material-icons"]', '[class*="material-symbols"]', '[class*="glyphicon"]',
    '[class*="codicon"]', '[class*="bi-"]', '[data-icon]'
  ].join(', ');

  // Éléments jamais recolorés par un thème (médias).
  const MEDIA = 'img, picture, video, canvas, svg, svg *, iframe, embed, object, audio';

  const TEXT_BLOCKS = 'p, li, dd, dt, blockquote, figcaption, article, section';

  function fontFaces(font, urlFor) {
    if (!font || !font.file) return '';
    const styles = font.italic ? ['normal', 'italic'] : ['normal'];
    let css = '';
    for (const weight of [400, 700]) {
      for (const style of styles) {
        css +=
          `@font-face{font-family:"${font.family}";font-style:${style};font-weight:${weight};` +
          `font-display:swap;src:url("${urlFor(`fonts/${font.file}-latin-${weight}-${style}.woff2`)}") format("woff2");}\n`;
      }
    }
    return css;
  }

  function num(v) {
    return Number(Number(v).toFixed(3));
  }

  /**
   * @param {object} s     réglages assainis
   * @param {(path: string) => string} urlFor  convertit un chemin d'extension en URL
   * @param {string} [root]  élément racine ciblé (par défaut le <body> de la page ;
   *                         la popup passe le sélecteur de son encadré d'aperçu)
   */
  function buildCSS(s, urlFor, root = PAGE_ROOT) {
    const N = L.NEUTRAL;
    const R = root;
    const font = L.FONTS[s.font];
    const textSel = `${R}, ${R} *:not(${FONT_EXCLUDE})`;
    const decl = [];
    let css = fontFaces(font, urlFor);

    if (font && font.family) {
      decl.push(`font-family:"${font.family}", ${font.fallback} !important`);
    }
    if (s.letterSpacing !== N.letterSpacing) decl.push(`letter-spacing:${num(s.letterSpacing)}em !important`);
    if (s.wordSpacing !== N.wordSpacing) decl.push(`word-spacing:${num(s.wordSpacing)}em !important`);
    if (s.lineHeight !== N.lineHeight) decl.push(`line-height:${num(s.lineHeight)} !important`);
    if (s.fontWeight !== 'default') decl.push(`font-weight:${s.fontWeight === 'bold' ? 700 : 400} !important`);
    if (s.textCase !== 'default') decl.push(`text-transform:${s.textCase} !important`);
    if (decl.length) css += `${textSel}{${decl.join(';')}}\n`;

    // L'italique se désactive aussi dans le code / les icônes : sans risque.
    if (s.noItalic) css += `${R}, ${R} *{font-style:normal !important}\n`;

    if (s.fontScale !== N.fontScale) {
      // zoom sur <body> : la règle de lecture, attachée à <html>, n'est pas affectée.
      css += `${R}{zoom:${num(s.fontScale / 100)} !important}\n`;
    }

    if (s.textAlign === 'left') {
      // Gauche = début de ligne (respecte les langues écrites de droite à gauche), sans césure.
      css += `${R} :is(${TEXT_BLOCKS}){text-align:start !important;hyphens:manual !important}\n`;
    } else if (s.textAlign !== 'default') {
      css += `${R} :is(${TEXT_BLOCKS}){text-align:${s.textAlign} !important}\n`;
    }

    if (s.lineWidth !== N.lineWidth) {
      css += `${R} :is(p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6){max-width:${num(s.lineWidth)}ch !important}\n`;
    }

    if (s.paragraphSpacing !== N.paragraphSpacing) {
      css += `${R} :is(p, li){margin-bottom:${num(s.paragraphSpacing)}em !important}\n`;
    }

    const c = L.themeColors(s);
    if (c) {
      css +=
        `${R === PAGE_ROOT ? 'html.lisible-on, ' : ''}${R}{background-color:${c.bg} !important;color:${c.text} !important}\n` +
        `${R} *:not(${MEDIA}){background-color:${c.bg} !important;color:${c.text} !important;` +
        `border-color:color-mix(in srgb, ${c.text} 30%, transparent) !important}\n` +
        `${R} a, ${R} a *:not(${MEDIA}){color:${c.link} !important}\n` +
        `${R} ::placeholder{color:color-mix(in srgb, ${c.text} 60%, transparent) !important}\n`;
    }

    // Après le thème : a[href] est plus spécifique que ses règles.
    if (s.linkHighlight) {
      const ink = isLight(s.linkHighlightColor) ? '#1A1A1A' : '#FFFFFF';
      css += `${R} a[href]{background-color:${s.linkHighlightColor} !important;color:${ink} !important}\n`;
      css += `${R} a[href] *:not(${MEDIA}){background-color:transparent !important;color:inherit !important}\n`;
    }
    if (s.linkOutline) {
      css += `${R} a[href]{outline:2px solid currentColor !important;outline-offset:2px !important;border-radius:2px !important}\n`;
    }

    return css;
  }

  // Texte noir ou blanc selon la clarté du fond (luminance relative WCAG).
  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum > 0.179;
  }

  function hexToRgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  // Styles de la règle de lecture (éléments attachés à <html>, hors <body>).
  // @param {object} r  règle de lecture assainie (state.ruler)
  function rulerCSS(r) {
    const a = num(r.opacity / 100);
    const base =
      '#lisible-ruler, #lisible-ruler *{all:initial;box-sizing:border-box;pointer-events:none !important}\n' +
      '#lisible-ruler{position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important}\n' +
      '#lisible-ruler > div{position:absolute !important;left:0 !important;right:0 !important;display:block !important}\n';
    if (r.mode === 'mask') {
      const shade = `rgba(0, 0, 0, ${a})`;
      return (
        base +
        `#lisible-ruler .lisible-top{top:0 !important;background:${shade} !important}\n` +
        `#lisible-ruler .lisible-bottom{bottom:0 !important;background:${shade} !important}\n` +
        '#lisible-ruler .lisible-band{display:none !important}\n'
      );
    }
    return (
      base +
      '#lisible-ruler .lisible-top, #lisible-ruler .lisible-bottom{display:none !important}\n' +
      // multiply (sur le conteneur, qui crée le contexte d'empilement) :
      // le texte sous la bande garde son contraste.
      '#lisible-ruler{mix-blend-mode:multiply !important}\n' +
      `#lisible-ruler .lisible-band{background:${hexToRgba(r.color, a)} !important;` +
      `border-top:2px solid ${hexToRgba(r.color, Math.min(1, a + 0.4))} !important;` +
      `border-bottom:2px solid ${hexToRgba(r.color, Math.min(1, a + 0.4))} !important}\n`
    );
  }

  root.Lisible.style = Object.freeze({ buildCSS, rulerCSS, fontFaces });
})(typeof globalThis !== 'undefined' ? globalThis : this);
