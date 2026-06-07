# ⚡ FuturCommandCenter

Dashboard personnel — Finances · Sport & Santé · Assistant IA · Domotique

**Stack** : Electron · Node.js · Express · PostgreSQL · Ollama · Leaflet · Chart.js

---

## Fonctionnalités

### 💳 Finances

- Résumé des comptes (soldes, revenus, dépenses du mois)
- Historique des transactions avec filtres (compte, catégorie, période, recherche)
- Graphiques mensuels et par catégorie
- Prévision de fin de mois basée sur les transactions planifiées
- Import depuis MonCompte PC (JSON)

### 💪 Sport & Santé

- Synchronisation automatique Garmin Connect (activités, wellness, sommeil)
- Historique des activités avec détail au clic :
  - Carte du parcours avec tracé coloré selon la vitesse (fondu dégradé canvas)
  - Profil d'élévation et fréquence cardiaque
  - Stats complètes : D+/D-, allure, cadence, charge d'entraînement, effet aérobie…
- Métriques corporelles (poids, IMC, masse grasse) avec graphique d'évolution
- Tableaux de bord : sommeil, stress, steps, calories

### 🤖 Assistant IA

- Chat avec Ollama (100% local, aucune donnée envoyée à l'extérieur)
- Contexte financier injecté automatiquement (soldes, dépenses du mois, prévisions)
- Historique de conversation persisté en base

### 🏠 Domotique

- Contrôle des lumières Zigbee (via HomeControl)
- Présence, robot aspirateur, réveil PC (Wake-on-LAN)
- Automatisations

---

## Prérequis

| Outil      | Version          |
| ---------- | ---------------- |
| Node.js    | 18+              |
| PostgreSQL | 14+              |
| Ollama     | dernière version |

---

## Installation

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/will83430/FuturCommandCenter.git
cd FuturCommandCenter
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Éditer `.env` :

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=futur_command_center
DB_USER=postgres
DB_PASSWORD=ton_mot_de_passe

BACKEND_PORT=3737

# Garmin Connect
GARMIN_EMAIL=ton@email.com
GARMIN_PASSWORD=ton_mot_de_passe

# Ollama (local)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Domotique (optionnel)
HOMECONTROL_URL=http://localhost:5000
HOMECONTROL_KEY=ta_cle_api
```

### 3. Créer la base de données

```bash
psql -U postgres -c "CREATE DATABASE futur_command_center;"
psql -U postgres -d futur_command_center -f backend/database/migrations/001_init.sql
psql -U postgres -d futur_command_center -f backend/database/migrations/002_health.sql
```

### 4. Installer Ollama et le modèle

```bash
# Installer Ollama : https://ollama.com
ollama pull llama3.1:8b
```

### 5. Connexion Garmin (première fois)

```bash
node scripts/garmin-login.js
```

---

## Lancer l'application

```bash
npm start
```

Mode développement (DevTools ouvert) :

```bash
npm run dev
```

---

## Import des données financières

Depuis un export MonCompte PC (JSON) :

```bash
node scripts/import-moncompte.js /chemin/vers/backup.json
```

---

## Build AppImage (Linux)

```bash
npm run build
# → dist-electron/FuturCommandCenter-1.0.0.AppImage
```

---

## Structure du projet

```text
FuturCommandCenter/
├── backend/
│   ├── database/
│   │   ├── db.js
│   │   └── migrations/
│   ├── routes/
│   │   ├── ai.js          # Chat Ollama + contexte financier
│   │   ├── domotique.js   # API HomeControl / WoL
│   │   ├── finances.js    # Résumé, transactions, prévisions
│   │   └── health.js      # Garmin sync, GPX parsing, body metrics
│   └── server.js
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── scripts/
│   ├── garmin-login.js
│   └── import-moncompte.js
├── main.js                # Electron main process
├── preload.js
└── package.json
```
