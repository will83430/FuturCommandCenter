import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR  = '/home/will/FuturCommandCenter';
const SHOT_DIR = '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

console.log('Lancement Electron…');
// ELECTRON_RUN_AS_NODE est hérité de l'env Claude Code (lui-même Electron)
// Il faut le désactiver pour que require('electron') retourne l'API built-in
const { ELECTRON_RUN_AS_NODE: _removed, ...cleanEnv } = process.env;
const app = await electron.launch({
  executablePath: electronBin,
  args: [APP_DIR],
  env: { ...cleanEnv, DISPLAY: ':1' },
  timeout: 40_000,
});

console.log('En attente du backend (12s)…');
await new Promise(r => setTimeout(r, 12_000));

const page = app.windows().find(w => !w.url().startsWith('devtools://'))
    ?? await app.firstWindow();

const urls = app.windows().map(w => w.url());
console.log('Fenêtres:', urls.join(', '));

await page.screenshot({ path: '/tmp/shots/01-launch.png' });
console.log('screenshot: /tmp/shots/01-launch.png');

const status = await page.evaluate(() => ({
  active: document.querySelector('.page.active')?.id || 'aucun',
  statusText: document.querySelector('.status-text')?.textContent || '',
  navItems: [...document.querySelectorAll('.nav-item')].map(n => n.dataset.page),
}));
console.log('Statut:', JSON.stringify(status));

// Page IA
await page.evaluate(() => typeof navigate === 'function' && navigate('ai'));
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: '/tmp/shots/02-ai.png' });
console.log('screenshot: /tmp/shots/02-ai.png');

// Page Transactions
await page.evaluate(() => typeof navigate === 'function' && navigate('transactions'));
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: '/tmp/shots/03-transactions.png' });
console.log('screenshot: /tmp/shots/03-transactions.png');

await app.close();
console.log('Test terminé.');
