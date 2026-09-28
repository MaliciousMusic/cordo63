#!/usr/bin/env node
// Change le code de l'atelier (6 chiffres) : il plante les clous de la carte fidélité et ouvre l'espace atelier.
// Usage : node tools/set-pin.mjs 482193
// Le code n'est jamais stocké en clair : seule son empreinte SHA-256 est écrite dans js/co-clous.js.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pin = process.argv[2];
if (!/^\d{6}$/.test(pin || '')) {
  console.error('Usage : node tools/set-pin.mjs <code à 6 chiffres>');
  process.exit(1);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'co-clous.js');
const src = readFileSync(file, 'utf8');
const salt = (src.match(/salt:\s*'([^']+)'/) || [])[1];
if (!salt) {
  console.error('Sel introuvable dans js/co-clous.js');
  process.exit(1);
}
const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
writeFileSync(file, src.replace(/pinHash:\s*'[0-9a-f]*'/, `pinHash: '${hash}'`));
console.log('Code équipe mis à jour. Pensez à publier la modification.');
