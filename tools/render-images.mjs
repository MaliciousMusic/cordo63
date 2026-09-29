#!/usr/bin/env node
// Les images pré-rendues de l'appli : ce qui était calculé à chaque visite (le WebGL de l'enseigne, le rendu pixel
// par pixel du décor de l'établi) est rendu ici une fois pour toutes, par Chrome sans tête.
//   assets/img/enseigne-jour.webp, enseigne-nuit.webp   les planches de l'enseigne (tools/render/enseigne.html)
//   assets/img/etabli-fond.webp                          le décor de l'établi (tools/render/etabli.html)
// Il faut le serveur local : python tools/dev-server.py (port 5193), puis : node tools/render-images.mjs [enseigne|etabli]
// Chrome : variable d'environnement CHROME (sinon celui de Windows) ; WebGL : un GPU, ou SwiftShader (drapeaux ci-dessous).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:5193';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const quoi = process.argv[2] || 'tout';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(url, expression, attente = 600000) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'co-rendu-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-accelerated-2d-canvas',
    ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []), // (Linux, en root : un conteneur)
    'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 200 && !target; i++) {
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { // la page chargée, ses scripts prêts
    const r = await send('Runtime.evaluate', { expression: 'typeof window.rendre === "function" && document.readyState === "complete"', returnByValue: true });
    if (r.result && r.result.result && r.result.result.value) break;
    await sleep(200);
  }
  const r = await Promise.race([
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    sleep(attente).then(() => ({ error: { message: 'trop long' } })),
  ]);
  ws.close();
  proc.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier */ }
  if (r.error || (r.result && r.result.exceptionDetails)) throw new Error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 800));
  return r.result.result.value;
}
const ecrire = (nom, dataUrl) => {
  const b = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(ROOT, 'assets', 'img', nom), b);
  console.log(nom.padEnd(20), (b.length / 1024).toFixed(0).padStart(5), 'Ko');
};

if (quoi === 'tout' || quoi === 'enseigne') {
  const t0 = Date.now();
  const v = await page(`${BASE}/tools/render/enseigne.html`, 'rendre()');
  ecrire('enseigne-jour.webp', v.jour);
  ecrire('enseigne-nuit.webp', v.nuit);
  console.log(`enseigne : ${v.n} poses de ${v.l} × ${v.h} px (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (quoi === 'tout' || quoi === 'etabli') {
  const t0 = Date.now();
  const v = await page(`${BASE}/tools/render/etabli.html`, 'rendre()');
  ecrire('etabli-fond.webp', v.image);
  console.log(`établi : ${v.l} × ${v.h} px (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
process.exit(0);
