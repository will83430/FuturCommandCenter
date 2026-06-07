-- Activités sportives (depuis Garmin)
CREATE TABLE IF NOT EXISTS activities (
  id            BIGINT PRIMARY KEY,
  name          VARCHAR(200),
  type          VARCHAR(50),
  date          TIMESTAMP NOT NULL,
  duration_s    INTEGER,
  distance_m    FLOAT,
  calories      INTEGER,
  avg_hr        INTEGER,
  max_hr        INTEGER,
  avg_pace      FLOAT,
  elevation_m   FLOAT,
  steps         INTEGER,
  raw           JSONB,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Stats journalières (pas, sommeil, stress, SpO2...)
CREATE TABLE IF NOT EXISTS daily_stats (
  date              DATE PRIMARY KEY,
  steps             INTEGER,
  steps_goal        INTEGER,
  distance_m        FLOAT,
  calories_active   INTEGER,
  calories_total    INTEGER,
  floors_up         INTEGER,
  avg_stress        INTEGER,
  rest_hr           INTEGER,
  sleep_duration_s  INTEGER,
  sleep_score       INTEGER,
  spo2_avg          FLOAT,
  body_battery_max  INTEGER,
  body_battery_min  INTEGER,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- Métriques corporelles (poids, IMC...)
CREATE TABLE IF NOT EXISTS body_metrics (
  id         SERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  weight_kg  FLOAT,
  bmi        FLOAT,
  fat_pct    FLOAT,
  muscle_kg  FLOAT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ancres de solde (Mon Carnet de Compte)
CREATE TABLE IF NOT EXISTS anchors (
  account_id   VARCHAR(50) REFERENCES accounts(id),
  month        VARCHAR(7) NOT NULL,
  amount_cents INTEGER NOT NULL,
  set_at       TIMESTAMP,
  PRIMARY KEY (account_id, month)
);

CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_body_metrics_date ON body_metrics(date DESC);
