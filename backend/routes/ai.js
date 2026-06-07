const express = require('express')
const router  = express.Router()
const axios   = require('axios')
const pool    = require('../database/db')

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b'

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
    const [statsRow, balanceRow, forecastRow, healthRow, lastActivityRow] = await Promise.all([
      pool.query(`
        SELECT
          SUM(CASE WHEN kind='income'  AND date >= date_trunc('month', NOW()) AND planned=false THEN amount_cents END) AS income_month,
          SUM(CASE WHEN kind='expense' AND date >= date_trunc('month', NOW()) AND planned=false THEN amount_cents END) AS expense_month
        FROM transactions
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
          AND t.date >= (TO_DATE(anc.month,'YYYY-MM') + INTERVAL '1 month')::date
        GROUP BY a.id, a.name, a.type, anc.amount_cents, anc.month
        ORDER BY a.name
      `),
      pool.query(`
        SELECT
          SUM(CASE WHEN kind='income'  AND planned=true THEN amount_cents END) AS planned_income,
          SUM(CASE WHEN kind='expense' AND planned=true THEN amount_cents END) AS planned_expense
        FROM transactions
        WHERE date BETWEEN NOW() AND date_trunc('month', NOW()) + INTERVAL '1 month - 1 day'
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
        FROM activities ORDER BY date DESC LIMIT 1
      `)
    ])

    const fmt = c => (parseInt(c || 0) / 100).toFixed(2)
    const income_month   = parseInt(statsRow.rows[0].income_month   || 0)
    const expense_month  = parseInt(statsRow.rows[0].expense_month  || 0)
    const planned_income  = parseInt(forecastRow.rows[0].planned_income  || 0)
    const planned_expense = parseInt(forecastRow.rows[0].planned_expense || 0)

    const balancesText = balanceRow.rows
      .map(r => `- ${r.name} (${r.type}) : ${fmt(r.balance_cents)}€`)
      .join('\n')

    const totalDisponible = balanceRow.rows
      .filter(r => r.type !== 'credit')
      .reduce((s, r) => s + parseInt(r.balance_cents || 0), 0)

    const h  = healthRow.rows[0] || {}
    const la = lastActivityRow.rows[0]
    const fmtMin = s => s ? `${Math.floor(s/3600)}h${String(Math.floor((s%3600)/60)).padStart(2,'0')}` : '—'

    const healthContext = h.avg_steps ? `
SPORT & SANTÉ (moyennes 7 derniers jours) :
- Pas/jour : ${Math.round(h.avg_steps || 0).toLocaleString('fr-FR')}
- FC repos : ${h.avg_rest_hr ? Math.round(h.avg_rest_hr) + ' bpm' : '—'}
- Stress moyen : ${h.avg_stress ? Math.round(h.avg_stress) + '/100' : '—'}
- Sommeil moyen : ${fmtMin(h.avg_sleep_s)}
- Body Battery moy : ${h.avg_body_battery ? Math.round(h.avg_body_battery) + '/100' : '—'}
- HRV nuit moy : ${h.avg_hrv ? Math.round(h.avg_hrv) + ' ms' : '—'}
- SpO2 moy : ${h.avg_spo2 ? Math.round(h.avg_spo2) + '%' : '—'}
${la ? `Dernière activité : ${la.name} (${la.type}) le ${new Date(la.date).toLocaleDateString('fr-FR')} — ${la.distance_m ? (la.distance_m/1000).toFixed(2)+'km' : ''} ${la.duration_s ? fmtMin(la.duration_s) : ''}` : ''}` : ''

    const systemPrompt = `Tu es l'assistant IA de FuturCommandCenter, le dashboard personnel de l'utilisateur.
Tu as accès aux données financières et sportives en temps réel. Sois concis et utile. Réponds en français.

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
- Solde prévu total : ${fmt(((income_month||0) + (planned_income||0)) - ((expense_month||0) + (planned_expense||0)))}€
${healthContext}`

    // Historique récent
    const history = await pool.query(
      'SELECT role, content FROM ai_messages ORDER BY created_at DESC LIMIT 10'
    )
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.rows.reverse(),
      { role: 'user', content: message }
    ]

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const ollamaRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      messages,
      stream: true
    }, { responseType: 'stream' })

    let fullReply = ''
    ollamaRes.data.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const json = JSON.parse(line)
          const token = json.message?.content || ''
          if (token) {
            fullReply += token
            res.write(`data: ${JSON.stringify({ token })}\n\n`)
          }
          if (json.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
          }
        } catch {}
      }
    })

    ollamaRes.data.on('end', async () => {
      if (fullReply) {
        await pool.query(
          'INSERT INTO ai_messages (role, content) VALUES ($1, $2)',
          ['assistant', fullReply]
        )
      }
      res.end()
    })

    ollamaRes.data.on('error', () => res.end())

  } catch (err) {
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

module.exports = router
