const express  = require('express')
const router   = express.Router()
const axios    = require('axios')
const dgram    = require('dgram')
const multer   = require('multer')
const pool     = require('../database/db')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
const WHISPER_URL = 'http://127.0.0.1:8766'

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b'
const HC_URL = process.env.HOMECONTROL_URL || 'http://localhost:5000'
const HC_KEY = process.env.HOMECONTROL_KEY || ''

// Avertissement si Ollama n'est pas sur localhost (les données financières seraient envoyées à un serveur externe)
try {
  const ollamaHost = new URL(OLLAMA_URL).hostname
  if (!/^(localhost|127\.0\.0\.1|::1)$/.test(ollamaHost)) {
    console.warn(`[AI] ⚠️  AVERTISSEMENT SÉCURITÉ : OLLAMA_URL pointe vers ${ollamaHost} (hors localhost). Les données financières et de santé seront envoyées à ce serveur externe.`)
  }
} catch {}

function sanitizePromptField(s, maxLen = 60) {
  return String(s || '').replace(/[\r\n\t]/g, ' ').slice(0, maxLen)
}

// IPs des ampoules WiZ (configurées via .env)
const BULBS = { salon: process.env.WIZ_SALON_IP || '', chambre: process.env.WIZ_CHAMBRE_IP || '' }

// Couleurs nommées → RGB
const COLOR_MAP = {
  rouge: [255,0,0], vert: [0,255,0], bleu: [0,0,255], blanc: [255,255,255],
  jaune: [255,255,0], orange: [255,100,0], violet: [148,0,211], mauve: [180,0,180],
  rose: [255,20,147], cyan: [0,255,255], turquoise: [0,206,209], indigo: [75,0,130],
  noir: [0,0,0], chaud: [255,180,60], froid: [200,220,255]
}

function hc(path, method = 'GET', data = null) {
  return axios({ method, url: `${HC_URL}${path}`, headers: { 'X-API-Key': HC_KEY }, data: data || undefined, timeout: 8000 }).then(r => r.data)
}

function wizSend(ip, params) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4')
    const msg  = Buffer.from(JSON.stringify({ method: 'setPilot', params }))
    sock.send(msg, 38899, ip, err => { sock.close(); err ? reject(err) : resolve() })
  })
}

const TOOLS = [
  { type: 'function', function: { name: 'lights_on',         description: 'Allumer les lumières. Pièces disponibles : Salon, Chambre. Laisser room vide pour toutes.', parameters: { type: 'object', properties: { room: { type: 'string', description: 'Salon ou Chambre. Vide = toutes.' } } } } },
  { type: 'function', function: { name: 'lights_off',        description: 'Éteindre les lumières. Pièces disponibles : Salon, Chambre. Laisser room vide pour toutes.', parameters: { type: 'object', properties: { room: { type: 'string', description: 'Salon ou Chambre. Vide = toutes.' } } } } },
  { type: 'function', function: { name: 'lights_color',      description: 'Changer la couleur des lumières. Utilise color_name pour les couleurs courantes (rouge, vert, bleu, jaune, violet, rose, orange, cyan, blanc, chaud, froid) ou r/g/b pour du RGB précis.', parameters: { type: 'object', properties: { color_name: { type: 'string', description: 'Nom de couleur : rouge, vert, bleu, jaune, violet, rose, orange, cyan, blanc, chaud, froid' }, r: { type: 'integer' }, g: { type: 'integer' }, b: { type: 'integer' }, room: { type: 'string' } } } } },
  { type: 'function', function: { name: 'lights_brightness', description: 'Régler la luminosité (intensité) des lumières. Utiliser pour : augmente, baisse, tamise, luminosité, intensité. level = 0 à 100.', parameters: { type: 'object', properties: { level: { type: 'integer', description: 'Luminosité de 0 (éteint) à 100 (max). Augmenter = 80-100, tamiser = 20-40, moyen = 50.' }, room: { type: 'string', description: 'Salon ou Chambre. Vide = toutes.' } }, required: ['level'] } } }
]

async function executeTool(name, args) {
  const room = args.room?.toLowerCase()
  const ips  = room ? (BULBS[room] ? [BULBS[room]] : Object.values(BULBS)) : Object.values(BULBS)

  if (name === 'lights_on') {
    await Promise.all(ips.map(ip => wizSend(ip, { state: true })))
    return { ok: true }
  }
  if (name === 'lights_off') {
    await Promise.all(ips.map(ip => wizSend(ip, { state: false })))
    return { ok: true }
  }
  if (name === 'lights_color') {
    let [r, g, b] = args.color_name ? (COLOR_MAP[args.color_name.toLowerCase()] || [255,255,255]) : [args.r||0, args.g||0, args.b||0]
    await Promise.all(ips.map(ip => wizSend(ip, { r, g, b, state: true })))
    return { ok: true, r, g, b }
  }
  if (name === 'lights_brightness') {
    const dimming = Math.max(0, Math.min(100, parseInt(args.level) || 50))
    await Promise.all(ips.map(ip => wizSend(ip, { dimming, state: dimming > 0 })))
    return { ok: true, dimming }
  }
  throw new Error(`Outil inconnu : ${name}`)
}

async function streamOllama(messages, tools, res) {
  const reqBody = { model: OLLAMA_MODEL, messages, stream: true, options: { num_ctx: 8192 } }
  if (tools) reqBody.tools = tools
  const ollamaRes = await axios.post(`${OLLAMA_URL}/api/chat`, reqBody, { responseType: 'stream' })
  let fullReply = '', toolCalls = null
  await new Promise((resolve, reject) => {
    ollamaRes.data.on('data', chunk => {
      chunk.toString().split('\n').filter(Boolean).forEach(line => {
        try {
          const json = JSON.parse(line)
          const token = json.message?.content || ''
          if (token) { fullReply += token; res.write(`data: ${JSON.stringify({ token })}\n\n`) }
          if (json.message?.tool_calls?.length) toolCalls = json.message.tool_calls
          if (json.done) resolve()
        } catch {}
      })
    })
    ollamaRes.data.on('end', resolve)
    ollamaRes.data.on('error', reject)
  })
  return { fullReply, toolCalls }
}

// Historique des messages
router.get('/history', async (req, res) => {
  try {
    const rows = await pool.query(
      'SELECT * FROM ai_messages ORDER BY created_at ASC LIMIT 100'
    )
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Envoyer un message
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'Message requis' })

    await pool.query(
      'INSERT INTO ai_messages (role, content) VALUES ($1, $2)',
      ['user', message]
    )

    // Contexte financier + santé
    const [statsRow, balanceRow, forecastRow, healthRow, lastActivityRow, weightRow] = await Promise.all([
      pool.query(`
        SELECT
          SUM(CASE WHEN kind='income'  AND date >= date_trunc('month', NOW()) AND planned=false THEN amount_cents END) AS income_month,
          SUM(CASE WHEN kind='expense' AND date >= date_trunc('month', NOW()) AND planned=false THEN amount_cents END) AS expense_month
        FROM transactions
        WHERE neutral = false
      `),
      pool.query(`
        WITH latest_anchor AS (
          SELECT DISTINCT ON (account_id) account_id, month, amount_cents
          FROM anchors ORDER BY account_id, month DESC
        )
        SELECT
          a.name, a.type,
          CASE
            WHEN a.type = 'credit' THEN
              GREATEST(0, COALESCE(anc.amount_cents,0)
                - COALESCE(SUM(CASE WHEN t.kind IN ('expense','transfer_in') THEN t.amount_cents ELSE 0 END),0)
                + COALESCE(SUM(CASE WHEN t.kind IN ('income','transfer_out') THEN t.amount_cents ELSE 0 END),0))
            ELSE
              COALESCE(anc.amount_cents,0)
              + COALESCE(SUM(CASE WHEN t.kind IN ('income','transfer_in') THEN t.amount_cents ELSE 0 END),0)
              - COALESCE(SUM(CASE WHEN t.kind IN ('expense','transfer_out') THEN t.amount_cents ELSE 0 END),0)
          END AS balance_cents
        FROM accounts a
        LEFT JOIN latest_anchor anc ON anc.account_id = a.id
        LEFT JOIN transactions t ON t.account_id = a.id AND t.planned=false
          AND (anc.month IS NULL OR t.date >= (TO_DATE(anc.month,'YYYY-MM') + INTERVAL '1 month')::date)
        GROUP BY a.id, a.name, a.type, anc.amount_cents, anc.month
        ORDER BY a.name
      `),
      pool.query(`
        SELECT
          SUM(CASE WHEN kind='income'  AND planned=true THEN amount_cents END) AS planned_income,
          SUM(CASE WHEN kind='expense' AND planned=true THEN amount_cents END) AS planned_expense
        FROM transactions
        WHERE neutral = false AND date BETWEEN NOW() AND date_trunc('month', NOW()) + INTERVAL '1 month - 1 day'
      `),
      pool.query(`
        SELECT
          AVG(steps)            AS avg_steps,
          AVG(rest_hr)          AS avg_rest_hr,
          AVG(avg_stress)       AS avg_stress,
          AVG(sleep_duration_s) AS avg_sleep_s,
          AVG(body_battery_max) AS avg_body_battery,
          AVG(hrv_avg)          AS avg_hrv,
          AVG(spo2_avg)         AS avg_spo2
        FROM daily_stats
        WHERE date >= NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT name, type, date, duration_s, distance_m, calories, avg_hr
        FROM activities ORDER BY date DESC LIMIT 10
      `),
      pool.query(`
        SELECT date, weight_kg, fat_pct, muscle_kg
        FROM body_metrics
        ORDER BY date DESC LIMIT 5
      `)
    ])

    const fmt = c => (parseInt(c || 0) / 100).toFixed(2)
    const income_month   = parseInt(statsRow.rows[0].income_month   || 0)
    const expense_month  = parseInt(statsRow.rows[0].expense_month  || 0)
    const planned_income  = parseInt(forecastRow.rows[0].planned_income  || 0)
    const planned_expense = parseInt(forecastRow.rows[0].planned_expense || 0)

    const balancesText = balanceRow.rows
      .map(r => `- ${sanitizePromptField(r.name)} (${sanitizePromptField(r.type, 20)}) : ${fmt(r.balance_cents)}€`)
      .join('\n')

    const totalDisponible = balanceRow.rows
      .filter(r => r.type !== 'credit')
      .reduce((s, r) => s + parseInt(r.balance_cents || 0), 0)

    const h           = healthRow.rows[0] || {}
    const activities  = lastActivityRow.rows
    const fmtMin = s => s ? `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}` : '—'

    const weightMeasures = weightRow.rows
    const weightContext = weightMeasures.length ? (() => {
      const first = weightMeasures[weightMeasures.length - 1]
      const last  = weightMeasures[0]
      const trend = (last.weight_kg - first.weight_kg).toFixed(1)
      const lines = weightMeasures.map((r, i) => {
        const prev = weightMeasures[i + 1]
        const diff = prev ? ` (${(r.weight_kg - prev.weight_kg) >= 0 ? '+' : ''}${(r.weight_kg - prev.weight_kg).toFixed(1)} kg)` : ' (mesure la plus ancienne)'
        return `- ${new Date(r.date).toLocaleDateString('fr-FR')} : ${r.weight_kg} kg${diff}${r.fat_pct ? ` — graisse ${r.fat_pct.toFixed(1)}%` : ''}${r.muscle_kg ? ` — muscle ${r.muscle_kg.toFixed(1)} kg` : ''}`
      })
      return `
POIDS (${weightMeasures.length} mesures disponibles) :
${lines.join('\n')}
Tendance globale sur la période : ${trend >= 0 ? '+' : ''}${trend} kg`
    })() : ''

    const activitiesContext = activities.length ? `
ACTIVITÉS RÉCENTES (${activities.length} dernières) :
${activities.map(a => `- ${new Date(a.date).toLocaleDateString('fr-FR')} : ${sanitizePromptField(a.name)} (${sanitizePromptField(a.type, 20)})${a.distance_m ? ' — ' + (a.distance_m/1000).toFixed(2) + ' km' : ''}${a.duration_s ? ' — ' + fmtMin(a.duration_s) : ''}${a.calories ? ' — ' + a.calories + ' kcal' : ''}${a.avg_hr ? ' — FC moy ' + a.avg_hr + ' bpm' : ''}`).join('\n')}` : ''

    const healthContext = h.avg_steps ? `
SPORT & SANTÉ (moyennes 7 derniers jours) :
- Pas/jour : ${Math.round(h.avg_steps || 0).toLocaleString('fr-FR')}
- FC repos : ${h.avg_rest_hr ? Math.round(h.avg_rest_hr) + ' bpm' : '—'}
- Stress moyen : ${h.avg_stress ? Math.round(h.avg_stress) + '/100' : '—'}
- Sommeil moyen : ${fmtMin(h.avg_sleep_s)}
- Body Battery moy : ${h.avg_body_battery ? Math.round(h.avg_body_battery) + '/100' : '—'}
- HRV nuit moy : ${h.avg_hrv ? Math.round(h.avg_hrv) + ' ms' : '—'}
- SpO2 moy : ${h.avg_spo2 ? Math.round(h.avg_spo2) + '%' : '—'}` : ''

    const HEALTH_KEYWORDS  = /poids|sport|santé|activité|course|vélo|cardio|sommeil|stress|pas|calories|muscle|graisse|bpm|hrv|spo2|body.?battery|forme/i
    const FINANCE_KEYWORDS = /solde|compte|argent|dépens|revenu|budget|virement|prévision|fin de mois|économi|dépense/i

    const isHealth  = HEALTH_KEYWORDS.test(message)
    const isFinance = FINANCE_KEYWORDS.test(message)
    const isLight   = /lumi[eè]re|lampe|ampoule|allume|éteins|éteint|couleur|salon|chambre|bleu|rouge|vert|violet|rose|jaune|orange|cyan|blanc/i.test(message)
    const isGeneral = !isHealth && !isFinance && !isLight

    const financeContext = `
SOLDES ACTUELS :
${balancesText}
Total disponible (hors crédit) : ${fmt(totalDisponible)}€

MOIS EN COURS :
- Revenus encaissés : +${fmt(income_month)}€
- Dépenses réelles : -${fmt(expense_month)}€
- Solde du mois : ${fmt((income_month || 0) - (expense_month || 0))}€

PRÉVISION FIN DE MOIS :
- Revenus prévus : +${fmt(planned_income)}€
- Dépenses prévues : -${fmt(planned_expense)}€
- Solde prévu total : ${fmt(((income_month||0) + (planned_income||0)) - ((expense_month||0) + (planned_expense||0)))}€`

    const contextBlock = isHealth  ? `${healthContext}${activitiesContext}${weightContext}`
                       : isFinance ? financeContext
                       : isLight   ? ''
                       : `${financeContext}${healthContext}${activitiesContext}${weightContext}`

    const systemPrompt = `Tu es l'assistant IA de FuturCommandCenter, le dashboard personnel de l'utilisateur.
Réponds toujours en français. Sois précis et utilise uniquement les données fournies.

OUTILS DISPONIBLES — tu DOIS les utiliser quand l'utilisateur le demande :
- lights_on(room?) : allumer les lumières. Pièces : "Salon", "Chambre". Vide = toutes.
- lights_off(room?) : éteindre les lumières. Pièces : "Salon", "Chambre". Vide = toutes.
- lights_color(r, g, b) : changer la couleur en valeurs RGB (0-255).
Quand on te demande de contrôler les lumières, utilise TOUJOURS l'outil correspondant. Après exécution, réponds en 1 phrase courte uniquement.
${contextBlock}`

    // Historique récent (pas pour les lumières — l'historique perturbe le tool calling)
    const historyRows = isLight ? [] : (await pool.query(
      'SELECT role, content FROM ai_messages ORDER BY created_at DESC LIMIT 10'
    )).rows.reverse()

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyRows,
      { role: 'user', content: message }
    ]

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // N'active les outils que si le message parle de lumières
    const mightUseTool = isLight

    // Appel non-streaming pour détecter les tool_calls de façon fiable
    const detectRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: OLLAMA_MODEL, messages, ...(mightUseTool ? { tools: TOOLS } : {}), stream: false, options: { num_ctx: 8192 }
    })
    const detectMsg = detectRes.data?.message || {}
    const toolCalls = detectMsg.tool_calls?.length ? detectMsg.tool_calls : null

    const ACTION_CONFIRM = {
      lights_on:         (a) => `Lumière${a.room ? ' '+a.room : 's'} allumée${a.room ? '' : 's'}.`,
      lights_off:        (a) => `Lumière${a.room ? ' '+a.room : 's'} éteinte${a.room ? '' : 's'}.`,
      lights_color:      (a) => `Couleur ${a.color_name || `R${a.r} V${a.g} B${a.b}`} appliquée.`,
      lights_brightness: (a) => `Luminosité réglée à ${a.level}%.`
    }

    let savedReply = ''
    if (toolCalls) {
      let confirmParts = []
      for (const tc of toolCalls) {
        let name, args
        try {
          name = tc.function.name
          args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments || {})
        } catch {
          confirmParts.push('Erreur : arguments invalides.')
          continue
        }
        res.write(`data: ${JSON.stringify({ action: name, args })}\n\n`)
        try {
          await executeTool(name, args)
          res.write(`data: ${JSON.stringify({ action_done: name, ok: true })}\n\n`)
          confirmParts.push(ACTION_CONFIRM[name]?.(args) || 'Action effectuée.')
        } catch (e) {
          res.write(`data: ${JSON.stringify({ action_done: name, ok: false })}\n\n`)
          confirmParts.push(`Erreur : ${e.message}`)
        }
      }
      // Confirmation directe, sans appeler le modèle
      savedReply = confirmParts.join(' ')
      res.write(`data: ${JSON.stringify({ token: savedReply })}\n\n`)
    } else {
      // Pas d'outil → stream direct
      const { fullReply } = await streamOllama(messages, null, res)
      savedReply = fullReply
    }

    if (savedReply) {
      await pool.query('INSERT INTO ai_messages (role, content) VALUES ($1, $2)', ['assistant', savedReply])
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()

  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Erreur interne' })}\n\n`)
      res.end()
      return
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'Ollama non disponible. Lance : ollama serve' })
    }
    res.status(500).json({ error: err.message })
  }
})

// Effacer l'historique
router.delete('/history', async (req, res) => {
  await pool.query('DELETE FROM ai_messages')
  res.json({ ok: true })
})

// Transcription vocale via Whisper local
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier audio' })
    const FormData = require('form-data')
    const form = new FormData()
    form.append('audio', req.file.buffer, { filename: 'audio.webm', contentType: req.file.mimetype })
    const response = await axios.post(`${WHISPER_URL}/transcribe`, form, {
      headers: form.getHeaders(), timeout: 30000
    })
    res.json(response.data)
  } catch (err) {
    const msg = err.code === 'ECONNREFUSED' ? 'Serveur Whisper non démarré' : err.message
    res.status(503).json({ error: msg })
  }
})

module.exports = router
