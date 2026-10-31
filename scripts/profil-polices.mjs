/*
 * Profil de configuration iPhone / iPad (.mobileconfig) qui installe les polices de
 * Lisible dans le système, pour les utiliser dans les autres apps (Pages, Keynote,
 * Word, Mail…). L'extension Safari n'en a pas besoin : elle embarque ses polices.
 *
 * Les fichiers viennent de assets/polices-ios/ (TTF / OTF originaux, voir le README
 * de ce dossier) : un profil n'accepte pas le format WOFF2 de l'extension.
 * Le profil n'est pas signé : iOS l'affiche comme « Non signé », ce qui est normal.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const IDENTIFIER = 'lisible-extension.polices';

// Identifiant stable (même UUID d'un build à l'autre) : iOS remplace alors le profil
// déjà installé au lieu d'en ajouter un second.
function uuid(name) {
  const h = createHash('sha1').update(`${IDENTIFIER}/${name}`).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16), ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20), h.slice(20, 32)]
    .join('-')
    .toUpperCase();
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plist(value, indent) {
  const pad = '\t'.repeat(indent);
  if (typeof value === 'string') return `${pad}<string>${esc(value)}</string>`;
  if (typeof value === 'number') return `${pad}<integer>${value}</integer>`;
  if (typeof value === 'boolean') return `${pad}<${value}/>`;
  if (Buffer.isBuffer(value)) {
    const lines = value.toString('base64').match(/.{1,76}/g);
    return `${pad}<data>\n${lines.map((l) => pad + l).join('\n')}\n${pad}</data>`;
  }
  if (Array.isArray(value)) return `${pad}<array>\n${value.map((v) => plist(v, indent + 1)).join('\n')}\n${pad}</array>`;
  const entries = Object.entries(value).map(([k, v]) => `${pad}\t<key>${esc(k)}</key>\n${plist(v, indent + 1)}`);
  return `${pad}<dict>\n${entries.join('\n')}\n${pad}</dict>`;
}

/** Contenu du fichier .mobileconfig, construit à partir de `fontsDir`. */
export function fontProfile(fontsDir, version) {
  const files = readdirSync(fontsDir)
    .filter((f) => ['.ttf', '.otf'].includes(extname(f).toLowerCase()))
    .sort();
  if (!files.length) throw new Error(`Aucune police TTF / OTF dans ${fontsDir}`);

  const fonts = files.map((file) => ({
    PayloadType: 'com.apple.font',
    PayloadVersion: 1,
    PayloadIdentifier: `${IDENTIFIER}.${file}`,
    PayloadUUID: uuid(file),
    PayloadDisplayName: file.replace(/\.(ttf|otf)$/i, ''),
    Name: file,
    Font: readFileSync(join(fontsDir, file))
  }));

  const profile = {
    PayloadType: 'Configuration',
    PayloadVersion: 1,
    PayloadIdentifier: IDENTIFIER,
    PayloadUUID: uuid('profil'),
    PayloadDisplayName: 'Lisible – polices / fonts',
    PayloadOrganization: 'Lisible',
    PayloadDescription:
      'Installe OpenDyslexic, Atkinson Hyperlegible, Lexend et Andika pour les utiliser dans les apps ' +
      '(Pages, Keynote, Word…). Polices sous licence SIL Open Font License 1.1.\n\n' +
      'Installs OpenDyslexic, Atkinson Hyperlegible, Lexend and Andika for use in apps ' +
      '(Pages, Keynote, Word…). Fonts licensed under the SIL Open Font License 1.1.\n\n' +
      `Lisible ${version}`,
    PayloadRemovalDisallowed: false,
    PayloadContent: fonts
  };

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    plist(profile, 0) +
    '\n</plist>\n'
  );
}
