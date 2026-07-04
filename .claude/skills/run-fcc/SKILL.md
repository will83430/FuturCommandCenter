---
name: run-fcc
description: Lancer et piloter FuturCommandCenter (Electron) via Playwright
---

# run-fcc — Lancer FuturCommandCenter

Outil de lancement et de pilotage de l'application Electron FuturCommandCenter via Playwright.

## Prérequis

```bash
# Dans le répertoire projet
npm install playwright-core   # déjà installé dans node_modules
# Affichage X11 requis (DISPLAY=:1 ou équivalent)
```

## Gotcha critique : ELECTRON_RUN_AS_NODE

Claude Code (extension VSCode) tourne lui-même dans Electron et hérite la variable
`ELECTRON_RUN_AS_NODE=1`. Cette variable fait que `require('electron')` retourne le
chemin binaire (`"/path/to/electron"`) au lieu de l'API built-in — `ipcMain`, `app`,
`BrowserWindow` deviennent tous `undefined`, l'app crashe silencieusement.

**Il faut impérativement la désactiver avant de lancer Electron :**

```js
// Dans un script .mjs
const { ELECTRON_RUN_AS_NODE: _removed, ...cleanEnv } = process.env;
const app = await electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
  args: [APP_DIR],
  env: { ...cleanEnv, DISPLAY: ':1' },
});
```

Depuis le shell : `env -u ELECTRON_RUN_AS_NODE node --experimental-vm-modules ...`

## Conflit de port

Le backend Express tourne sur le port **3737**. Si une instance est déjà active
(AppImage, processus orphelin), Electron crashe au démarrage (pas de `process.send('ready')`
→ aucune fenêtre). Tuer les processus existants avant de lancer :

```bash
pkill -f "FuturCommandCenter" || true
lsof -ti:3737 | xargs kill -9 2>/dev/null || true
```

(Note : `pkill` peut être bloqué par un hook Claude Code — utiliser `kill PID` avec un PID explicite si besoin.)

## Délai de démarrage

Le backend met ~10–12 s pour démarrer (connexion PG, import auto des transactions,
restauration session Garmin). Attendre 12 s après le lancement avant d'interagir.

## Test rapide (one-shot)

```bash
cd /home/will/FuturCommandCenter
node --experimental-vm-modules .claude/skills/run-fcc/test-once.mjs
# Screenshots dans /tmp/shots/
```

Ce script :
1. Retire `ELECTRON_RUN_AS_NODE` de l'env
2. Lance Electron via Playwright
3. Attend 12 s
4. Prend un screenshot du Dashboard (`01-launch.png`)
5. Navigue vers l'Assistant IA (`02-ai.png`)
6. Navigue vers les Transactions (`03-transactions.png`)
7. Ferme l'app

## Driver interactif

```bash
cd /home/will/FuturCommandCenter
node --experimental-vm-modules .claude/skills/run-fcc/driver.mjs
```

Commandes disponibles dans le REPL :

| Commande | Description |
|----------|-------------|
| `launch` | Lancer l'app Electron |
| `ss [fichier]` | Screenshot (défaut : `/tmp/shots/shot.png`) |
| `click <sélecteur>` | Cliquer sur un élément CSS |
| `click-text <texte>` | Cliquer sur un élément par son texte |
| `navigate <page>` | Naviguer vers une page (dashboard, finances, transactions, ai, health, domotique) |
| `type <sélecteur> <texte>` | Saisir du texte |
| `press <touche>` | Appuyer sur une touche (Enter, Escape, etc.) |
| `wait <ms>` | Attendre N millisecondes |
| `eval <js>` | Évaluer du JS dans la page |
| `text <sélecteur>` | Lire le texte d'un élément |
| `windows` | Lister les fenêtres ouvertes |
| `status` | État de la page active |
| `quit` | Fermer l'app et quitter |
| `help` | Afficher l'aide |

## Architecture de l'app

- **main.js** — Point d'entrée Electron, génère `BACKEND_TOKEN` (64 hex), lance Express en subprocess
- **backend/server.js** — Express sur port 3737, routes `/api/*` protégées par `X-App-Token`
- **preload.js** — `contextBridge` expose `electronAPI.getBackendToken()` au renderer
- **frontend/js/api.js** — `apiFetch()` injecte automatiquement le token dans chaque requête
- **frontend/index.html** — SPA avec navigation via `navigate('page-id')`

## Sécurité

- Toutes les routes `/api/*` (sauf `/api/ping`) exigent le header `X-App-Token`
- Le token est généré aléatoirement à chaque démarrage (`crypto.randomBytes(32)`)
- CORS restreint aux origines localhost/Electron (`null`, `file:`, `http://localhost:*`)
- `.env` contient les credentials DB/Garmin — ne jamais committer

## Vérification de santé rapide

```bash
curl -s http://localhost:3737/api/ping                          # → {"status":"ok"}
curl -s http://localhost:3737/api/finances/summary              # → 401
curl -s -H "X-App-Token: WRONG" http://localhost:3737/api/ai/chat  # → 401
```
