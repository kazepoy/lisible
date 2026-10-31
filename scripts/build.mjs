#!/usr/bin/env node
/*
 * Construit l'extension pour chaque navigateur à partir du dossier extension/.
 *
 *   node scripts/build.mjs            # chrome, firefox, safari et profil de polices
 *   node scripts/build.mjs chrome     # un seul navigateur
 *   node scripts/build.mjs polices    # profil de polices iPhone / iPad seulement
 *
 * Produit dist/<navigateur>/ (dossier à charger « non empaqueté » pour tester),
 * dist/lisible-<navigateur>-<version>.zip (fichier à envoyer au store) et
 * dist/lisible-polices-<version>.mobileconfig (polices pour les apps iPhone / iPad).
 * Aucune dépendance : Node 18 ou plus suffit.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { fontProfile } from './profil-polices.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'extension');
const DIST = join(ROOT, 'dist');

// Identifiant Firefox (obligatoire en Manifest V3). À garder identique d'une version à l'autre.
const GECKO_ID = 'lisible@lisible-extension';

// Le manifest source (extension/manifest.json) est celui de Safari ; on en dérive les autres.
const TARGETS = {
  safari: (m) => m,

  chrome: (m) => ({
    ...m,
    // Chrome n'accepte qu'un service worker comme script d'arrière-plan.
    background: { service_worker: 'background.js', type: 'module' },
    // color-mix() (thèmes de couleur) : Chrome 111+.
    minimum_chrome_version: '111'
  }),

  firefox: (m) => ({
    ...m,
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '140.0',
        // Déclaration de collecte de données exigée par addons.mozilla.org : aucune.
        data_collection_permissions: { required: ['none'] }
      },
      // Firefox pour Android (téléphones et tablettes).
      gecko_android: { strict_min_version: '142.0' }
    }
  })
};

function build(target) {
  const out = join(DIST, target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  cpSync(SRC, out, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') });

  const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
  const result = TARGETS[target](structuredClone(manifest));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');

  const zipPath = join(DIST, `lisible-${target}-${result.version}.zip`);
  writeFileSync(zipPath, zip(out));
  console.log(`${target.padEnd(8)} → ${relative(ROOT, out)}/  +  ${relative(ROOT, zipPath)}`);
}

function buildFontProfile() {
  const { version } = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
  const out = join(DIST, `lisible-polices-${version}.mobileconfig`);
  mkdirSync(DIST, { recursive: true });
  writeFileSync(out, fontProfile(join(ROOT, 'assets', 'polices-ios'), version));
  console.log(`${'polices'.padEnd(8)} → ${relative(ROOT, out)}`);
}

// ---- Écriture d'un zip (méthode deflate), sans dépendance ---------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

function zip(dir) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  // Date fixe (1er janvier 2026) : deux builds identiques donnent le même zip.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const file of listFiles(dir)) {
    const name = Buffer.from(relative(dir, file).split(sep).join('/'));
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version requise
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---- Point d'entrée -----------------------------------------------------------

const asked = process.argv.slice(2);
const choices = [...Object.keys(TARGETS), 'polices'];
const unknown = asked.filter((t) => !choices.includes(t));
if (unknown.length) {
  console.error(`Cible inconnue : ${unknown.join(', ')} (choix : ${choices.join(', ')})`);
  process.exit(1);
}
for (const target of asked.length ? asked : choices) {
  if (target === 'polices') buildFontProfile();
  else build(target);
}
