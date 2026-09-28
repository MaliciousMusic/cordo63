#!/usr/bin/env node
// Capture d'écran d'une page locale avec Chrome sans tête (protocole DevTools, sans dépendance).
// Sert aux icônes, à l'image de partage et aux contrôles visuels.
// Usage : node tools/capture.mjs <url> <sortie.png> [largeur] [hauteur] [échelle] [attente_ms] [sélecteur]
//   ex. : node tools/capture.mjs "http://localhost:5190/tools/render/og.html" assets/img/og.png 1200 630 1 2500
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function capture(url, out, { w = 400, h = 800, scale = 1, wait = 1500, selector = null, before = null, format = 'png', quality = 90 } = {}) {
  const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'co-capture-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 200 && !target; i++) {
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: w < 700 });
  await send('Page.navigate', { url });
  await sleep(wait);
  if (before) await ev(before);
  let clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
  if (selector) {
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()`);
    if (r) clip = { x: r[0], y: r[1], width: r[2], height: r[3], scale: 1 };
  }
  const s = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined, clip, captureBeyondViewport: true });
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  ws.close();
  proc.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier */ }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('capture.mjs')) {
  const [url, out, w, h, scale, wait, selector] = process.argv.slice(2);
  if (!url || !out) {
    console.error('Usage : node tools/capture.mjs <url> <sortie.png> [largeur] [hauteur] [échelle] [attente_ms] [sélecteur]');
    process.exit(1);
  }
  await capture(url, out, { w: +w || 400, h: +h || 800, scale: +scale || 1, wait: +wait || 1500, selector: selector || null, format: out.endsWith('.jpg') ? 'jpeg' : 'png' });
  console.log('capture →', out);
  process.exit(0);
}
