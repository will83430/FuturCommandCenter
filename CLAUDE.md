# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes essentielles

```bash
npm start                          # Lancer l'application Electron (production)
npm run dev                        # Lancer avec DevTools ouverts
npm run server                     # Backend Express seul (sans Electron)
npm run build                      # Build AppImage Linux → dist-electron/
npm run import:moncompte           # Import manuel MonCompte PC (JSON)
node scripts/garmin-login.js       # Authentification Garmin (première fois / token expiré)
```

**Lancer sous Claude Code (VSCode Electron) :**
La variable `ELECTRON_RUN_AS_NODE=1` héritée de VSCode casse l'API Electron. Toujours la désactiver :

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

Ou utiliser le driver Playwright du projet :
```bash
node --experimental-vm-modules .claude/skills/run-fcc/test-once.mjs
```

**Base de données — initialisation :**
```bash
psql -U postgres -c "CREATE DATABASE futur_command_center;"
psql -U postgres -d futur_command_center -f backend/database/migrations/001_init.sql
psql -U postgres -d futur_command_center -f backend/database/migrations/002_health.sql
```

## Architecture

**Electron app** — `main.js` fork le backend Express comme processus enfant (`fork()`). Le backend envoie `process.send('ready')` une fois les tables initialisées et l'auto-import terminé, ce qui déclenche la création de la fenêtre `BrowserWindow`.

**Sécurité inter-processus** — À chaque démarrage, `main.js` génère un token aléatoire (`crypto.randomBytes(32)`). Il est transmis au backend via `env.BACKEND_TOKEN` et au renderer via IPC (`ipcMain.handle('get-backend-token')`). Toutes les routes `/api/*` (sauf `/api/ping`) exigent ce token dans le header `X-App-Token`.

**Frontend — SPA sans framework** — `index.html` charge les scripts en ordre. `app.js` orchestre la navigation : `navigate(pageId)` affiche la page CSS et appelle la fonction `renderXxx()` correspondante. Chaque page est un fichier JS autonome (ex : `dashboard.js` → `renderDashboard()`). Pas de bundler, pas de framework JS.

**API frontend** — `api.js` expose `window.api` avec toutes les routes groupées. La fonction `apiFetch()` attend que le token IPC soit résolu avant chaque requête. Pour les SSE (chat IA), utiliser `waitApiToken()` + `getApiToken()` puis un `fetch()` manuel.

**Graphiques** — `charts.js` expose `createMonthlyChart(canvasId, rows)` et `createSparkline(canvasId, values, color)`. Les IDs canvas sont créés dans le HTML injecté par chaque `renderXxx()`, donc les appels aux fonctions graphiques doivent toujours être **après** l'assignation à `el.innerHTML`.

**Assistant IA** — `backend/routes/ai.js` utilise Ollama (local) avec tool calling pour contrôler les ampoules WiZ via UDP (port 38899). Le contexte financier (soldes, dépenses du mois) est injecté dans le system prompt à chaque message. Les champs DB insérés dans le prompt sont sanitisés via `sanitizePromptField()` (protection injection de prompt).

**Import financier** — Au démarrage du backend, `autoImportMoncompte()` scanne `~/FuturCommandCenter/exports/` puis `~/Téléchargements/` pour le JSON MonCompte PC le plus récent (`moncarnetcompte_*.json`). L'import est idempotent (UPSERT). La purge des transactions supprimées est scopée par `account_id` pour éviter de toucher d'autres comptes. Les montants sont toujours en **centimes** en base.

**Garmin** — La session est persistée dans `.garmin-session/` (dossier, plusieurs fichiers). `health.js` route `/sync` déclenche la synchronisation. Si la session expire, relancer `node scripts/garmin-login.js`.

## Variables d'environnement (.env)

```
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
BACKEND_PORT=3737
GARMIN_EMAIL / GARMIN_PASSWORD
OLLAMA_URL=http://localhost:11434   # doit rester localhost
OLLAMA_MODEL=llama3.1:8b
HOMECONTROL_URL / HOMECONTROL_KEY   # domotique optionnel
WEATHER_LAT / WEATHER_LNG           # coordonnées météo
ANTHROPIC_API_KEY                   # si migration vers Claude API
```

Le fichier `.env` est exclu du git. Ne jamais committer les credentials.

## Schéma de base de données

**Tables finances** (`001_init.sql`) : `accounts`, `transactions`, `anchors`, `recurrences`, `budget`, `goals`, `ai_messages`

**Tables santé** (`002_health.sql`) : `activities`, `daily_stats`, `body_metrics`, `hrv_data`

Les migrations utilisent `CREATE TABLE IF NOT EXISTS` — elles sont ré-exécutées à chaque démarrage sans danger.

Les soldes de comptes sont calculés dynamiquement : `ancre + transactions depuis l'ancre`. Pour les comptes de type `credit`, la logique est inversée (dépenses = remboursements). Voir `backend/routes/finances.js` route `/balance`.

## Contraintes importantes

- **Ne pas modifier HomeControl** — projet séparé, intégration en lecture seule via API HTTP.
- **Toutes les données financières restent 100% locales** — pas de service externe pour les finances.
- **`OLLAMA_URL` doit pointer sur localhost** — le backend lève un avertissement si ce n'est pas le cas (les données seraient envoyées à un serveur externe).
- Ne pas ajouter de fonctionnalités de gestion budgétaire, objectifs récurrents ou budget par catégorie — ces fonctionnalités existent dans MonCompte PC et ne doivent pas être dupliquées ici.
