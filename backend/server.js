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

const app  = express()
const PORT = process.env.BACKEND_PORT || 3737

app.use(cors())
app.use(express.json())

app.use('/api/finances',   financesRoutes)
app.use('/api/ai',         aiRoutes)
app.use('/api/health',     healthRoutes)
app.use('/api/domotique',  domotiqueRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

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
