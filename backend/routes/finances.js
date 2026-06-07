const express = require('express')
const router  = express.Router()
const pool    = require('../database/db')

// Résumé global
router.get('/summary', async (req, res) => {
  try {
    const accounts = await pool.query('SELECT * FROM accounts ORDER BY name')
    const totals   = await pool.query(`
      SELECT account_id,
             SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END) AS total_income,
             SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END) AS total_expense
      FROM transactions
      GROUP BY account_id
    `)
    res.json({ accounts: accounts.rows, totals: totals.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Transactions paginées + filtres
router.get('/transactions', async (req, res) => {
  try {
    const { account, cat, from, to, limit = 50, offset = 0 } = req.query
    let where = []
    let params = []
    let i = 1

    if (account) { where.push(`account_id = $${i++}`); params.push(account) }
    if (cat)     { where.push(`cat = $${i++}`);         params.push(cat)     }
    if (from)    { where.push(`date >= $${i++}`);       params.push(from)    }
    if (to)      { where.push(`date <= $${i++}`);       params.push(to)      }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const rows = await pool.query(
      `SELECT * FROM transactions ${whereClause} ORDER BY date DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    )
    const count = await pool.query(`SELECT COUNT(*) FROM transactions ${whereClause}`, params)
    res.json({ transactions: rows.rows, total: parseInt(count.rows[0].count) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Dépenses par catégorie (mois courant ou période)
router.get('/by-category', async (req, res) => {
  try {
    const { from, to } = req.query
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const dateTo   = to   || new Date().toISOString().slice(0, 10)

    const rows = await pool.query(`
      SELECT cat, kind,
             SUM(amount_cents) AS total,
             COUNT(*) AS nb
      FROM transactions
      WHERE date BETWEEN $1 AND $2
      GROUP BY cat, kind
      ORDER BY total DESC
    `, [dateFrom, dateTo])
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Évolution mensuelle
router.get('/monthly', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month,
             SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END) AS income,
             SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END) AS expense
      FROM transactions
      GROUP BY month
      ORDER BY month DESC
      LIMIT 24
    `)
    res.json(rows.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Solde réel par compte (ancre + logique MoncomptePc exacte)
router.get('/balance', async (req, res) => {
  try {
    const rows = await pool.query(`
      WITH latest_anchor AS (
        SELECT DISTINCT ON (account_id)
          account_id, month, amount_cents
        FROM anchors
        ORDER BY account_id, month DESC
      )
      SELECT
        a.id, a.name, a.icon, a.color, a.type,
        anc.month AS anchor_month,
        anc.amount_cents AS anchor_amount,
        CASE
          -- Compte crédit : logique inversée (dépenses = remboursements)
          WHEN a.type = 'credit' THEN
            GREATEST(0,
              COALESCE(anc.amount_cents, 0)
              - COALESCE(SUM(CASE WHEN t.kind IN ('expense','transfer_in') THEN t.amount_cents ELSE 0 END), 0)
              + COALESCE(SUM(CASE WHEN t.kind IN ('income','transfer_out') THEN t.amount_cents ELSE 0 END), 0)
            )
          -- Compte courant / épargne : logique normale
          ELSE
            COALESCE(anc.amount_cents, 0)
            + COALESCE(SUM(CASE WHEN t.kind IN ('income','transfer_in')  THEN t.amount_cents ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.kind IN ('expense','transfer_out') THEN t.amount_cents ELSE 0 END), 0)
        END AS balance_cents
      FROM accounts a
      LEFT JOIN latest_anchor anc ON anc.account_id = a.id
      LEFT JOIN transactions t ON t.account_id = a.id
        AND t.planned = false
        AND t.date >= (TO_DATE(anc.month, 'YYYY-MM') + INTERVAL '1 month')::date
      GROUP BY a.id, a.name, a.icon, a.color, a.type, anc.amount_cents, anc.month
      ORDER BY a.name
    `)
    // Le total exclut les dettes crédit (ce n'est pas de l'argent dispo)
    const total = rows.rows
      .filter(r => r.type !== 'credit')
      .reduce((s, r) => s + parseInt(r.balance_cents), 0)
    res.json({ accounts: rows.rows, total_cents: total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Prévision fin de mois
router.get('/forecast', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    // Transactions réelles du mois (déjà passées)
    const done = await pool.query(`
      SELECT
        SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END) AS income,
        SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END) AS expense
      FROM transactions
      WHERE planned = false AND date BETWEEN $1 AND $2
    `, [monthStart, today])

    // Transactions planifiées restantes ce mois (pas encore passées)
    const planned = await pool.query(`
      SELECT date, description, amount_cents, kind, cat
      FROM transactions
      WHERE planned = true AND date BETWEEN $1 AND date_trunc('month', NOW()) + INTERVAL '1 month - 1 day'
      ORDER BY date ASC
    `, [today])

    const doneIncome  = parseInt(done.rows[0].income  || 0)
    const doneExpense = parseInt(done.rows[0].expense || 0)

    const plannedIncome  = planned.rows.filter(r => r.kind === 'income' ).reduce((s, r) => s + parseInt(r.amount_cents), 0)
    const plannedExpense = planned.rows.filter(r => r.kind === 'expense').reduce((s, r) => s + parseInt(r.amount_cents), 0)

    res.json({
      done: { income: doneIncome, expense: doneExpense },
      planned: {
        income: plannedIncome,
        expense: plannedExpense,
        items: planned.rows
      },
      forecast: {
        income:  doneIncome  + plannedIncome,
        expense: doneExpense + plannedExpense,
        balance: (doneIncome + plannedIncome) - (doneExpense + plannedExpense)
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
