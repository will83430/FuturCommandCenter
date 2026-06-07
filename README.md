# ⚡ FuturCommandCenter

> Dashboard personnel futuriste — Finances · Domotique · IA · Santé

**Stack** : Electron · Node.js · Express · PostgreSQL · Ollama

---

## Prérequis

- Node.js 18+
- PostgreSQL 14+
- Ollama (`ollama pull llama3.2`)

## Installation

```bash
cd FuturCommandCenter
cp .env.example .env
# Éditer .env avec tes identifiants PostgreSQL

npm install
```

## Créer la base de données

```bash
psql -U postgres -c "CREATE DATABASE futur_command_center;"
```

## Importer les données Moncompte

```bash
npm run import:moncompte
# Ou avec un chemin personnalisé :
node scripts/import-moncompte.js /chemin/vers/backup.json
```

## Lancer l'application

```bash
npm start
```

## Développement (DevTools ouvert)

```bash
npm run dev
```
