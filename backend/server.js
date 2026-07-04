require('dotenv').config({ path: process.env.DOTENV_PATH || require('path').join(__dirname, '../.env') })
const express = require('express')
const cors    = require('cors')
const fs      = require('fs')
const path    = require('path')
const pool    = require('./database/db')

const financesRoutes   = require('./routes/finances')
const aiRoutes         = require('./routes/ai')
const healthRoutes     = require('./routes/health')
const domotiqueRoutes  = require('./routes/domotique')
const axios            = require('axios')

const WEATHER_LAT = process.env.WEATHER_LAT || '50.85'
const WEATHER_LNG = process.env.WEATHER_LNG || '4.35'
const WMO = {0:['☀️','Ensoleillé'],1:['🌤️','Peu nuageux'],2:['⛅','Partiellement nuageux'],3:['🌥️','Couvert'],45:['🌫️','Brouillard'],48:['🌫️','Brouillard givrant'],51:['🌦️','Bruine légère'],53:['🌦️','Bruine'],55:['🌧️','Bruine forte'],61:['🌧️','Pluie légère'],63:['🌧️','Pluie'],65:['🌧️','Pluie forte'],71:['🌨️','Neige légère'],73:['🌨️','Neige'],75:['❄️','Neige forte'],80:['🌦️','Averses légères'],81:['🌧️','Averses'],82:['⛈️','Averses fortes'],95:['⛈️','Orage'],99:['⛈️','Orage violent']}
let weatherCache = null, weatherCacheTs = 0

const app  = express()
const PORT = process.env.BACKEND_PORT || 3737
const BACKEND_TOKEN = process.env.BACKEND_TOKEN || ''

// Restreindre CORS aux origines Electron (null/file:) et localhost
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^(null|file:|http:\/\/localhost(:\d+)?)/.test(origin)) cb(null, true)
    else cb(new Error('Origin non autorisée'))
  }
}))
app.use(express.json())

// Auth : toutes les routes /api/ sauf /api/ping exigent le token
app.use('/api', (req, res, next) => {
  if (req.path === '/ping') return next()
  if (!BACKEND_TOKEN || req.headers['x-app-token'] !== BACKEND_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' })
  }
  next()
})

app.use('/api/finances',   financesRoutes)
app.use('/api/ai',         aiRoutes)
app.use('/api/health',     healthRoutes)
app.use('/api/domotique',  domotiqueRoutes)

app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date() }))

app.get('/api/weather', async (req, res) => {
  try {
    if (weatherCache && Date.now() - weatherCacheTs < 600_000) return res.json(weatherCache)
    const r = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
      params: { latitude: WEATHER_LAT, longitude: WEATHER_LNG, current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m', wind_speed_unit: 'kmh', timezone: 'auto' },
      timeout: 5000
    })
    const c = r.data.current
    const [icon, label] = WMO[c.weather_code] || ['🌡️', 'Inconnu']
    weatherCache = { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), icon, label }
    weatherCacheTs = Date.now()
    res.json(weatherCache)
  } catch { res.json(null) }
})

async function initDatabase() {
  for (const file of ['001_init.sql', '002_health.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, 'database/migrations', file), 'utf8')
    await pool.query(sql)
  }
  console.log('[DB] Tables initialisées')
}

app.listen(PORT, async () => {
  await initDatabase()
  await autoImportMoncompte()
  console.log(`[Server] FuturCommandCenter backend → http://localhost:${PORT}`)
  if (process.send) process.send('ready')
})

async function autoImportMoncompte() {
  try {
    const home = require('os').homedir()
    const dirs = [path.join(home, 'FuturCommandCenter', 'exports'), path.join(home, 'Téléchargements'), path.join(home, 'Downloads'), home]
    let latest = null, latestTime = 0
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('moncarnetcompte_') || !f.endsWith('.json')) continue
        const full = path.join(dir, f)
        const t = fs.statSync(full).mtimeMs
        if (t > latestTime) { latestTime = t; latest = full }
      }
    }
    if (!latest) return
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'))
    if (!data.txs?.length) return

    // Comptes
    for (const acc of data.accounts || []) {
      await pool.query(`INSERT INTO accounts (id,name,icon,type,color,mensualite,plafond) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET name=$2,icon=$3,color=$5`,
        [acc.id, acc.name, acc.icon||'', acc.type||'checking', acc.color||'#ffffff', acc.mensualite||0, acc.plafond||0])
    }
    // Transactions
    for (const tx of data.txs) {
      await pool.query(`INSERT INTO transactions (id,account_id,date,amount_cents,kind,cat,description,planned,recurring)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET
        planned=$8,amount_cents=$4,cat=$6,description=$7,date=$3,kind=$5`,
        [tx.id, tx.accountId, tx.date, tx.amountCents, tx.kind, tx.cat||'autre', tx.desc||'', tx.planned||false, tx.recurring||false])
    }
    // Purge — scoper aux comptes importés + filtrer les ids null
    const ids = data.txs.map(t => t.id).filter(id => id != null)
    const accountIds = [...new Set(data.txs.map(t => t.accountId).filter(Boolean))]
    if (ids.length && accountIds.length) {
      const idPH  = ids.map((_,i) => `$${i+1}`).join(',')
      const accPH = accountIds.map((_,i) => `$${ids.length+i+1}`).join(',')
      await pool.query(
        `DELETE FROM transactions WHERE id NOT IN (${idPH}) AND account_id IN (${accPH})`,
        [...ids, ...accountIds]
      )
    }
    // Anchors
    for (const a of data.anchors || []) {
      await pool.query(`INSERT INTO anchors (account_id,month,amount_cents,set_at) VALUES ($1,$2,$3,$4)
        ON CONFLICT (account_id,month) DO UPDATE SET amount_cents=$3,set_at=$4`,
        [a.accountId, a.month, a.amountCents, a.setAt||null])
    }
    console.log(`[Import] ${data.txs.length} transactions depuis ${path.basename(latest)}`)
  } catch (e) {
    console.warn('[Import] Échec auto-import MonCompte:', e.message)
  }
}
