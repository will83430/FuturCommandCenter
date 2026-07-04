// Driver Playwright pour FuturCommandCenter (Electron).
// Conçu pour agents : lancer dans tmux, send-keys commandes, capture-pane résultat.
// Usage : DISPLAY=:1 node .claude/skills/run-fcc/driver.mjs

import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR   = path.resolve(__dirname, '../../..');
const SHOT_DIR  = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

let app  = null;
let page = null;

const COMMANDS = {
  async launch() {
    if (app) return console.log('déjà lancé');
    app = await electron.launch({
      executablePath: electronBin,
      args: ['--no-sandbox', APP_DIR],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' },
      timeout: 40_000,
    });
    // Attendre que le backend soit prêt (signal 'ready' via process.send)
    await new Promise(r => setTimeout(r, 10_000));
    page = app.windows().find(w => !w.url().startsWith('devtools://'))
        ?? await app.firstWindow();
    console.log('lancé.', app.windows().length, 'fenêtre(s) :');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async ss(name) {
    if (!page) return console.log('ERREUR: lancer d\'abord (launch)');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f, fullPage: false });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERREUR: lancer d\'abord (launch)');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"], .nav-item')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName + ' / ' + el.className;
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  async navigate(page_id) {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    const r = await page.evaluate(id => {
      if (typeof navigate === 'function') { navigate(id); return 'OK' }
      return 'navigate() introuvable'
    }, page_id);
    console.log('navigate', page_id, '→', r);
    await new Promise(r => setTimeout(r, 1500));
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('trouvé:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERREUR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    const t = await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText?.slice(0, 500) ?? '(null)',
      sel || null);
    console.log(t);
  },

  async windows() {
    if (!app) return console.log('ERREUR: lancer d\'abord');
    for (const w of app.windows()) console.log(' ', w.url());
    try {
      const wcs = await app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() })));
      console.log('webContents:');
      for (const w of wcs) console.log(` [${w.id}] ${w.type}: ${w.url}`);
    } catch(e) { console.log('webContents error:', e.message); }
  },

  async status() {
    if (!page) return console.log('ERREUR: lancer d\'abord');
    const r = await page.evaluate(() => ({
      title: document.title,
      active_page: document.querySelector('.page.active')?.id,
      nav_items: [...document.querySelectorAll('.nav-item')].map(n => n.dataset.page),
      status: document.querySelector('.status-text')?.textContent,
    }));
    console.log(JSON.stringify(r, null, 2));
  },

  async quit() { if (app) await app.close().catch(()=>{}); app = null; page = null; },
  help() { console.log('commandes:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'fcc> ' });

rl.on('line', async line => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('inconnu:', cmd, '— essaie: help'); return rl.prompt(); }
  try { await fn(rest.join(' ')); } catch (e) { console.log('ERREUR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('FuturCommandCenter driver — "help" pour les commandes, "launch" pour démarrer');
rl.prompt();
