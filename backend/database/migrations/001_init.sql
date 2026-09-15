-- Comptes bancaires
CREATE TABLE IF NOT EXISTS accounts (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(10),
  type        VARCHAR(20),
  color       VARCHAR(20),
  mensualite  INTEGER DEFAULT 0,
  plafond     INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Transactions financières
CREATE TABLE IF NOT EXISTS transactions (
  id           VARCHAR(100) PRIMARY KEY,
  account_id   VARCHAR(50) REFERENCES accounts(id),
  date         DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  kind         VARCHAR(20) NOT NULL,
  cat          VARCHAR(50),
  description  TEXT,
  planned      BOOLEAN DEFAULT false,
  recurring    BOOLEAN DEFAULT false,
  neutral      BOOLEAN DEFAULT false,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Ajout rétroactif de la colonne neutral (déjà exécuté ci-dessus pour les nouvelles installs)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS neutral BOOLEAN DEFAULT false;

-- Récurrences
CREATE TABLE IF NOT EXISTS recurrences (
  id           VARCHAR(100) PRIMARY KEY,
  account_id   VARCHAR(50),
  label        TEXT,
  amount_cents INTEGER,
  kind         VARCHAR(20),
  cat          VARCHAR(50),
  day_of_month INTEGER,
  active       BOOLEAN DEFAULT true
);

-- Budget par catégorie
CREATE TABLE IF NOT EXISTS budget (
  cat          VARCHAR(50) PRIMARY KEY,
  amount_cents INTEGER NOT NULL
);

-- Objectifs d'épargne
CREATE TABLE IF NOT EXISTS goals (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100),
  target_cents INTEGER,
  current_cents INTEGER DEFAULT 0,
  deadline     DATE,
  color        VARCHAR(20)
);

-- Messages IA (historique chat)
CREATE TABLE IF NOT EXISTS ai_messages (
  id         SERIAL PRIMARY KEY,
  role       VARCHAR(10) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index performance
CREATE INDEX IF NOT EXISTS idx_txs_date       ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_txs_account    ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_txs_cat        ON transactions(cat);
