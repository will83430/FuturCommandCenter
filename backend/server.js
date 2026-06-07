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

app.use(cors())
app.use(express.json())

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
  console.log(`[Server] FuturCommandCenter backend → http://localhost:${PORT}`)
  if (process.send) process.send('ready')
})
