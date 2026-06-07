const express = require('express')
const router  = express.Router()
const pool    = require('../database/db')
const path    = require('path')
const fs      = require('fs')

const GARMIN_EMAIL    = process.env.GARMIN_EMAIL
const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD
const GC_API          = 'https://connectapi.garmin.com'
const TOKEN_DIR       = process.env.GARMIN_TOKEN_DIR || path.join(__dirname, '../../.garmin-session')

let garminClient   = null
let displayName    = null
let lastAutoSync   = null
let autoSyncTimer  = null
const activityCache = new Map() // activityId → { data, ts }
const trackCache    = new Map() // activityId → { coords, ts }
let lastTodaySync  = null
let loginBackoff   = null

const TODAY_COOLDOWN_MS = 5 * 60 * 1000
const BACKOFF_MS        = 90 * 1000

async function getClient() {
  if (garminClient) return garminClient
  if (!GARMIN_EMAIL || !GARMIN_PASSWORD) throw new Error('Garmin non configuré')
  if (loginBackoff && Date.now() < loginBackoff) {
    const wait = Math.round((loginBackoff - Date.now()) / 1000)
    throw new Error(`Rate-limited par Garmin, réessai dans ${wait}s`)
  }

  const { GarminConnect } = require('garmin-connect')
  const client = new GarminConnect({ username: GARMIN_EMAIL, password: GARMIN_PASSWORD })

  // Essayer de restaurer la session depuis le dossier token
  if (fs.existsSync(TOKEN_DIR)) {
    try {
      client.loadTokenByFile(TOKEN_DIR)
      const profile = await client.getUserProfile()
      displayName   = profile.displayName
      garminClient  = client
      console.log('[garmin] Session restaurée (token local)')
      return client
    } catch {
      console.log('[garmin] Token expiré, reconnexion SSO...')
      fs.rmSync(TOKEN_DIR, { recursive: true, force: true })
    }
  }

  // Login complet via SSO (une seule fois)
  try {
    await client.login()
    const profile = await client.getUserProfile()
    displayName   = profile.displayName
    garminClient  = client
    loginBackoff  = null
    fs.mkdirSync(TOKEN_DIR, { recursive: true })
    client.exportTokenToFile(TOKEN_DIR)
    console.log('[garmin] Connecté et token sauvegardé')
    return client
  } catch (err) {
    if (err.message?.includes('429') || err.message?.includes('rate')) {
      let retryAfter = BACKOFF_MS
      try {
        const parsed = JSON.parse(err.message.replace(/^ERROR: \(\d+\), [^,]+, /, ''))
        if (parsed.retry_after) retryAfter = (parsed.retry_after + 10) * 1000
      } catch {}
      loginBackoff = Date.now() + retryAfter
      garminClient = null
      console.warn(`[garmin] Rate-limited, retry dans ${Math.round(retryAfter/1000)}s`)
    }
    throw err
  }
}

async function syncDay(client, dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')

  const [wellness, sleepData] = await Promise.all([
    displayName
      ? client.get(`${GC_API}/usersummary-service/usersummary/daily/${displayName}?calendarDate=${dateStr}`).catch(() => null)
      : null,
    client.getSleepData(d).catch(() => null)
  ])

  const sleepDto = sleepData?.dailySleepDTO

  const row = {
    date:             dateStr,
    steps:            wellness?.totalSteps          ?? 0,
    steps_goal:       wellness?.dailyStepGoal        ?? null,
    distance_m:       wellness?.totalDistanceMeters  ?? null,
    calories_active:  wellness?.activeKilocalories   ?? null,
    calories_total:   wellness?.totalKilocalories    ?? null,
    floors_up:        wellness?.floorsAscended != null ? Math.round(wellness.floorsAscended) : null,
    avg_stress:       wellness?.averageStressLevel   ?? null,
    rest_hr:          wellness?.restingHeartRate     ?? sleepData?.restingHeartRate ?? null,
    sleep_duration_s: sleepDto?.sleepTimeSeconds     ?? null,
    sleep_score:      sleepDto?.sleepScore           ?? null,
    spo2_avg:         wellness?.averageSpo2          ?? null,
    body_battery_max: wellness?.bodyBatteryHighestValue  ?? null,
    body_battery_min: wellness?.bodyBatteryLowestValue   ?? null,
    deep_sleep_s:     sleepDto?.deepSleepSeconds    ?? null,
    light_sleep_s:    sleepDto?.lightSleepSeconds   ?? null,
    rem_sleep_s:      sleepDto?.remSleepSeconds     ?? null,
    awake_sleep_s:    sleepDto?.awakeSleepSeconds   ?? null,
    hrv_avg:          sleepData?.avgOvernightHrv    ?? null
  }

  const empty = row.steps === 0 && row.sleep_duration_s === null && row.rest_hr === null
  if (empty) return false

  await pool.query(`
    INSERT INTO daily_stats
      (date, steps, steps_goal, distance_m, calories_active, calories_total, floors_up,
       avg_stress, rest_hr, sleep_duration_s, sleep_score, spo2_avg,
       body_battery_max, body_battery_min,
       deep_sleep_s, light_sleep_s, rem_sleep_s, awake_sleep_s, hrv_avg)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (date) DO UPDATE SET
      steps=$2, steps_goal=$3, distance_m=$4, calories_active=$5, calories_total=$6,
      floors_up=$7, avg_stress=$8, rest_hr=$9, sleep_duration_s=$10, sleep_score=$11,
      spo2_avg=$12, body_battery_max=$13, body_battery_min=$14,
      deep_sleep_s=$15, light_sleep_s=$16, rem_sleep_s=$17, awake_sleep_s=$18, hrv_avg=$19
  `, [
    row.date, row.steps, row.steps_goal, row.distance_m,
    row.calories_active, row.calories_total, row.floors_up,
    row.avg_stress, row.rest_hr, row.sleep_duration_s, row.sleep_score, row.spo2_avg,
    row.body_battery_max, row.body_battery_min,
    row.deep_sleep_s, row.light_sleep_s, row.rem_sleep_s, row.awake_sleep_s, row.hrv_avg
  ])
  return true
}

// ── Auto-sync toutes les 60 min ────────────────────────────────────────────
function startAutoSync() {
  if (autoSyncTimer || !GARMIN_EMAIL || !GARMIN_PASSWORD) return
  autoSyncTimer = setInterval(async () => {
    try {
      const client = await getClient()
      const today  = new Date().toISOString().slice(0, 10)
      const yest   = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      await syncDay(client, today)
      await syncDay(client, yest)
      lastAutoSync = new Date().toISOString()
      lastTodaySync = Date.now()
    } catch { /* silencieux */ }
  }, 60 * 60 * 1000)
}
startAutoSync()

// ── Sync manuel (30 jours) ─────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  if (!GARMIN_EMAIL || !GARMIN_PASSWORD)
    return res.status(503).json({ error: 'Garmin non configuré' })
  try {
    const client = await getClient()
    const days   = parseInt(req.query.days) || 30

    const activities = await client.getActivities(0, 50)
    let actImported  = 0
    for (const a of activities) {
      await pool.query(`
        INSERT INTO activities (id, name, type, date, duration_s, distance_m, calories, avg_hr, max_hr, avg_pace, elevation_m, steps, raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO UPDATE SET name=$2, calories=$7, avg_hr=$8, raw=$13
      `, [
        a.activityId, a.activityName, a.activityType?.typeKey || 'unknown',
        a.startTimeLocal, Math.round(a.duration || 0),
        a.distance || 0, a.calories || 0,
        a.averageHR || null, a.maxHR || null,
        a.averageSpeed || null, a.elevationGain || null,
        a.steps || null, JSON.stringify(a)
      ])
      actImported++
    }

    const today = new Date()
    let statsImported = 0
    for (let i = 0; i < days; i++) {
      const d       = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      try {
        const ok = await syncDay(client, dateStr)
        if (ok) statsImported++
      } catch { /* jour sans données */ }
      // Pause entre chaque jour pour éviter le rate-limit Garmin
      if (i < days - 1) await new Promise(r => setTimeout(r, 1200))
    }

    lastAutoSync = new Date().toISOString()
    res.json({ ok: true, activities: actImported, dailyStats: statsImported })
  } catch (err) {
    if (err.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Garmin inaccessible' })
    res.status(500).json({ error: err.message })
  }
})

// ── Données d'aujourd'hui (live, cooldown 5 min) ──────────────────────────
router.get('/today', async (req, res) => {
  try {
    const today  = new Date().toISOString().slice(0, 10)
    const force  = req.query.force === '1'
    const canSync = !lastTodaySync || (Date.now() - lastTodaySync) > TODAY_COOLDOWN_MS

    // Ne tenter le login que si le token existe déjà OU si c'est un sync forcé (bouton)
    const tokenReady = fs.existsSync(TOKEN_DIR) || garminClient !== null
    if (GARMIN_EMAIL && GARMIN_PASSWORD && (canSync || force) && (tokenReady || force)) {
      lastTodaySync = Date.now()
      try {
        const client = await getClient()
        await syncDay(client, today)
        lastAutoSync = new Date().toISOString()
      } catch (e) {
        const is429 = e.message?.includes('429') || e.message?.includes('Rate-limited') || e.message?.includes('rate')
        if (!is429) console.error('[today] sync failed:', e.message)
      }
    }

    const fresh = await pool.query('SELECT * FROM daily_stats WHERE date = $1', [today])
    res.json({ ...fresh.rows[0], lastSync: lastAutoSync })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Timeline body battery + stress (N jours) ──────────────────────────────
router.get('/wellness', async (req, res) => {
  try {
    const { days = 14 } = req.query
    const rows = await pool.query(`
      SELECT date, body_battery_max, body_battery_min, avg_stress, rest_hr, hrv_avg,
             calories_active, floors_up
      FROM daily_stats
      WHERE date >= NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY date ASC
    `)
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Résumé global ──────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const [lastActivity, weekStats, monthActivity, lastWeight] = await Promise.all([
      pool.query('SELECT * FROM activities ORDER BY date DESC LIMIT 1'),
      pool.query(`
        SELECT
          AVG(steps) AS avg_steps, AVG(avg_stress) AS avg_stress,
          AVG(rest_hr) AS avg_rest_hr, AVG(sleep_duration_s) AS avg_sleep_s,
          AVG(hrv_avg) AS avg_hrv, AVG(body_battery_max) AS avg_body_battery
        FROM daily_stats WHERE date >= NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT COUNT(*) AS nb_activities,
               SUM(duration_s) AS total_duration_s,
               SUM(distance_m) AS total_distance_m,
               SUM(calories) AS total_calories
        FROM activities WHERE date >= NOW() - INTERVAL '30 days'
      `),
      pool.query('SELECT * FROM body_metrics ORDER BY date DESC LIMIT 1')
    ])
    res.json({
      lastActivity:  lastActivity.rows[0]  || null,
      weekStats:     weekStats.rows[0]     || null,
      monthActivity: monthActivity.rows[0] || null,
      lastWeight:    lastWeight.rows[0]    || null,
      lastAutoSync
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Activités paginées ─────────────────────────────────────────────────────
router.get('/activities', async (req, res) => {
  try {
    const { type, limit = 20, offset = 0 } = req.query
    const where  = type ? 'WHERE type = $1' : ''
    const params = type ? [type, limit, offset] : [limit, offset]
    const i      = type ? 3 : 2
    const rows   = await pool.query(
      `SELECT id, name, type, date, duration_s, distance_m, calories, avg_hr, max_hr, elevation_m, steps
       FROM activities ${where} ORDER BY date DESC LIMIT $${i - 1} OFFSET $${i}`,
      params
    )
    const count = await pool.query(`SELECT COUNT(*) FROM activities ${where}`, type ? [type] : [])
    res.json({ activities: rows.rows, total: parseInt(count.rows[0].count) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Détail activité ───────────────────────────────────────────────────────
router.get('/activities/:id', async (req, res) => {
  try {
    const id = req.params.id
    const cached = activityCache.get(id)
    if (cached && Date.now() - cached.ts < 3600_000) return res.json(cached.data)

    const dbRow = await pool.query(
      'SELECT id, name, type, date, duration_s, distance_m, calories, avg_hr, max_hr, elevation_m, steps, raw FROM activities WHERE id = $1',
      [id]
    )
    const base = dbRow.rows[0] || {}

    let garminDetail = null
    const client = garminClient
    if (client) {
      try {
        garminDetail = await client.getActivity({ activityId: id })
      } catch {}
    }

    const data = { ...base, garmin: garminDetail }
    activityCache.set(id, { data, ts: Date.now() })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Track GPS enrichi (élévation, vitesse, FC par point) ─────────────────
router.get('/activities/:id/track', async (req, res) => {
  try {
    const id = req.params.id
    const cached = trackCache.get(id)
    if (cached && Date.now() - cached.ts < 86400_000) return res.json(cached.data)

    const client = garminClient
    if (!client) return res.json({ coords: [], meta: {} })

    const gpxText = await client.client.get(client.url.DOWNLOAD_GPX + id, { responseType: 'text' })

    const trkRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g
    const raw = []
    let m
    while ((m = trkRe.exec(gpxText)) !== null) {
      const inner = m[3]
      const g = s => { const r = inner.match(new RegExp(`<(?:\\w+:)?${s}>([^<]+)<\\/(?:\\w+:)?${s}>`)); return r ? r[1] : null }
      raw.push({
        lat:   parseFloat(m[1]),
        lng:   parseFloat(m[2]),
        ele:   g('ele')   != null ? parseFloat(g('ele'))   : null,
        ts:    g('time')  != null ? new Date(g('time')).getTime() : null,
        hr:    g('hr')    != null ? parseInt(g('hr'))    : null,
        cad:   g('cad')   != null ? parseInt(g('cad'))   : null,
        speed: g('speed') != null ? parseFloat(g('speed')) : null
      })
    }

    // Calcul vitesse via Haversine si absente
    const havDist = (a, b) => {
      const R = 6371000, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180
      const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h))
    }
    let cumDist = 0
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) {
        const d = havDist(raw[i-1], raw[i])
        const dt = raw[i].ts && raw[i-1].ts ? (raw[i].ts - raw[i-1].ts) / 1000 : 0
        cumDist += d
        if (!raw[i].speed && dt > 0) raw[i].speed = d / dt
      }
      raw[i].dist = cumDist
    }

    // Sous-échantillonnage max 600 points
    const step = Math.max(1, Math.floor(raw.length / 600))
    const pts = raw.filter((_, i) => i % step === 0)
    if (pts[pts.length-1] !== raw[raw.length-1] && raw.length) pts.push(raw[raw.length-1])

    const hasEle   = pts.some(p => p.ele   != null)
    const hasHR    = pts.some(p => p.hr    != null)
    const hasSpeed = pts.some(p => p.speed != null && p.speed > 0)
    const movingSpeeds = pts.map(p => p.speed || 0).filter(s => s > 0.3).sort((a,b) => a-b)
    const pct = (arr, p) => arr[Math.max(0, Math.floor(arr.length * p / 100) - 1)] || 0
    const p5Speed  = movingSpeeds.length ? pct(movingSpeeds,  5) : 0
    const p95Speed = movingSpeeds.length ? pct(movingSpeeds, 95) : 1
    const minSpeed = p5Speed
    const maxSpeed = p95Speed

    const data = { coords: pts, meta: { total: raw.length, hasEle, hasHR, hasSpeed, minSpeed, maxSpeed } }
    trackCache.set(id, { data, ts: Date.now() })
    res.json(data)
  } catch (err) {
    res.json({ coords: [], meta: {} })
  }
})

// ── Stats journalières ─────────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const { days = 30 } = req.query
    const rows = await pool.query(`
      SELECT * FROM daily_stats
      WHERE date >= NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY date ASC
    `)
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Répartition par type ───────────────────────────────────────────────────
router.get('/by-type', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT type, COUNT(*) AS nb,
             SUM(duration_s) AS total_duration_s,
             SUM(distance_m) AS total_distance_m,
             SUM(calories) AS total_calories
      FROM activities WHERE date >= NOW() - INTERVAL '90 days'
      GROUP BY type ORDER BY nb DESC
    `)
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Body metrics ──────────────────────────────────────────────────────────
router.get('/body-metrics', async (req, res) => {
  try {
    const { days = 90 } = req.query
    const rows = await pool.query(
      `SELECT * FROM body_metrics WHERE date >= NOW() - INTERVAL '${parseInt(days)} days' ORDER BY date ASC`
    )
    res.json(rows.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/body-metrics', async (req, res) => {
  try {
    const { date, weight_kg, bmi, fat_pct, muscle_kg } = req.body
    if (!date || !weight_kg) return res.status(400).json({ error: 'date et weight_kg requis' })
    const bmiCalc = bmi ?? (weight_kg && req.body.height_cm
      ? +(weight_kg / Math.pow(req.body.height_cm / 100, 2)).toFixed(1)
      : null)
    const row = await pool.query(`
      INSERT INTO body_metrics (date, weight_kg, bmi, fat_pct, muscle_kg)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date) DO UPDATE SET weight_kg=$2, bmi=$3, fat_pct=$4, muscle_kg=$5
      RETURNING *
    `, [date, weight_kg, bmiCalc, fat_pct || null, muscle_kg || null])
    res.json(row.rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/body-metrics/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM body_metrics WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Records personnels ────────────────────────────────────────────────────
router.get('/records', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        type,
        COUNT(*) AS count,
        SUM(duration_s) AS total_duration,
        SUM(COALESCE(distance_m, 0)) AS total_distance,
        SUM(COALESCE(elevation_m, 0)) AS total_elevation,
        MAX(distance_m) AS max_distance,
        MAX(elevation_m) AS max_elevation,
        MAX(duration_s) AS max_duration,
        MAX(calories) AS max_calories,
        MAX(avg_hr) AS max_avg_hr,
        MIN(NULLIF(avg_pace, 0)) AS best_pace,
        MAX(steps) AS max_steps,
        (SELECT id FROM activities a2 WHERE a2.type = a.type AND a2.distance_m = MAX(a.distance_m) LIMIT 1) AS best_dist_id,
        (SELECT id FROM activities a2 WHERE a2.type = a.type AND a2.elevation_m = MAX(a.elevation_m) LIMIT 1) AS best_elev_id
      FROM activities a
      WHERE type IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
    `)
    res.json(rows.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Progression mensuelle ─────────────────────────────────────────────────
router.get('/progression', async (req, res) => {
  try {
    const months = Math.min(parseInt(req.query.months) || 12, 24)
    const rows = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
        type,
        COUNT(*) AS count,
        SUM(COALESCE(distance_m, 0)) AS total_distance,
        SUM(duration_s) AS total_duration,
        SUM(COALESCE(elevation_m, 0)) AS total_elevation
      FROM activities
      WHERE date >= NOW() - INTERVAL '${months} months'
        AND type IS NOT NULL
      GROUP BY DATE_TRUNC('month', date), type
      ORDER BY 1 ASC, 2
    `)
    res.json(rows.rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Statut Garmin ──────────────────────────────────────────────────────────
router.get('/garmin-status', (req, res) => {
  res.json({ configured: !!(GARMIN_EMAIL && GARMIN_PASSWORD), lastAutoSync })
})

module.exports = router
