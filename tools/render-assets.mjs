#!/usr/bin/env node
// Icônes d'appli (écran d'accueil, PWA) et image de partage (Open Graph), rendues par Chrome sans tête
// depuis tools/render/icone.html et tools/render/og.html (qui dessinent avec les vrais éléments de la marque).
// Il faut le serveur local : python tools/dev-server.py (port 5193), puis : node tools/render-assets.mjs
import { capture } from './capture.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:5193';
const out = (...p) => path.join(ROOT, ...p);

const jobs = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
];
for (const [name, size, k] of jobs) {
  await capture(`${BASE}/tools/render/icone.html?k=${k}`, out('assets', 'icons', name), { w: 512, h: 512, scale: size / 512, wait: 1200, selector: '#ic' });
  console.log('icône', name);
}
await capture(`${BASE}/tools/render/og.html`, out('assets', 'img', 'og-cordo63.jpg'), { w: 1200, h: 630, scale: 1, wait: 6000, format: 'jpeg', quality: 86 });
console.log('image de partage assets/img/og-cordo63.jpg');
process.exit(0);
