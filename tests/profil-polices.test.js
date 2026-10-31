'use strict';

// Profil de polices iPhone / iPad : une entrée par fichier, polices intactes, UUID stables.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const FONTS = path.join(__dirname, '..', 'assets', 'polices-ios');

test('profil de polices : une police par fichier, contenu intact, UUID stables', async () => {
  const { fontProfile } = await import('../scripts/profil-polices.mjs');
  const xml = fontProfile(FONTS, '9.9.9');
  const files = fs.readdirSync(FONTS).filter((f) => /\.(ttf|otf)$/i.test(f)).sort();
  assert.ok(files.length >= 4);

  const names = [...xml.matchAll(/<key>Name<\/key>\n\t*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  assert.deepEqual(names, files);

  const datas = [...xml.matchAll(/<data>\n([^<]+)<\/data>/g)].map((m) => Buffer.from(m[1].replace(/\s/g, ''), 'base64'));
  datas.forEach((d, i) => assert.ok(d.equals(fs.readFileSync(path.join(FONTS, files[i]))), files[i]));

  const uuids = [...xml.matchAll(/<key>PayloadUUID<\/key>\n\t*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  assert.equal(new Set(uuids).size, files.length + 1);
  for (const u of uuids) assert.match(u, /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  assert.equal(fontProfile(FONTS, '9.9.9'), xml);
  assert.match(xml, /Lisible 9\.9\.9/);
});
