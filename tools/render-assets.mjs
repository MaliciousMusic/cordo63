#!/usr/bin/env node
// Icônes d'appli (écran d'accueil, PWA, favicon), toile de l'ouverture et image de partage (Open Graph), rendues par Chrome sans tête
// depuis tools/render/icone.html (CORDO puis 63 en cubes de bois lettrés sur le lacet rouge : les perles de
// l'ouverture) et tools/render/og.html. Chaque taille est dessinée pour elle-même (pas une réduction du 512).
// Il faut le serveur local : python tools/dev-server.py (port 5193), puis : node tools/render-assets.mjs
import { capture } from './capture.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:5193';
const out = (...p) => path.join(ROOT, ...p);
const icone = (taille, opts = '') => `${BASE}/tools/render/icone.html?taille=${taille}${opts}`;

const jobs = [
  ['apple-touch-icon.png', 180, ''],
  ['icon-192.png', 192, ''],
  ['icon-512.png', 512, ''],
  ['icon-maskable-512.png', 512, '&masque'], // les cubes recentrés dans la zone sûre (le cercle de 80 %)
];
for (const [name, taille, opts] of jobs) {
  await capture(icone(taille, opts), out('assets', 'icons', name), { w: taille, h: taille, scale: 1, wait: 1800, selector: '#ic' });
  console.log('icône', name);
}
// le favicon : « 63 » seul, deux cubes, sans fond ; une image de 64 px dans un SVG (les navigateurs la réduisent)
const tmp = path.join(os.tmpdir(), 'co-favicon-64.png');
await capture(icone(64, '&forme=signe'), tmp, { w: 64, h: 64, scale: 1, wait: 1800, selector: '#ic' });
const b64 = fs.readFileSync(tmp).toString('base64');
fs.writeFileSync(out('assets', 'icons', 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CORDO 63"><image width="64" height="64" href="data:image/png;base64,${b64}"/></svg>\n`);
console.log('favicon assets/icons/favicon.svg');
// la toile de l'ouverture au repos : le fond de #splash (le premier état de l'écran, avant tout script), et sa
// miniature floue écrite dans css/co-splash.css (elle paraît tout de suite, avant l'image)
// (exportées par le canevas même : transparentes entre les mailles, où l'établi sombre du fond se voit)
const [image, mini] = JSON.parse(await capture(`${BASE}/tools/render/lacis.html`, path.join(os.tmpdir(), 'co-lacis.png'), { w: 640, h: 1000, scale: 1.5, wait: 2500, selector: '#ic', lire: 'JSON.stringify([window.image, window.miniature])' }));
fs.writeFileSync(out('assets', 'img', 'lacis.webp'), Buffer.from(image.split(',')[1], 'base64'));
const cssSplash = out('css', 'co-splash.css');
fs.writeFileSync(cssSplash, fs.readFileSync(cssSplash, 'utf8').replace(/--toile-mini: url\([^)]*\);/, `--toile-mini: url(${mini});`));
console.log('toile assets/img/lacis.webp (+ miniature dans css/co-splash.css)');
await capture(`${BASE}/tools/render/og.html`, out('assets', 'img', 'og-cordo63.jpg'), { w: 1200, h: 630, scale: 1, wait: 6000, format: 'jpeg', quality: 86 });
console.log('image de partage assets/img/og-cordo63.jpg');
process.exit(0);
