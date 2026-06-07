const express = require('express')
const router  = express.Router()
const axios   = require('axios')

const HC_URL = process.env.HOMECONTROL_URL || 'http://localhost:5000'
const HC_KEY = process.env.HOMECONTROL_KEY || ''

function hc(path, method = 'GET', data = null) {
  return axios({
    method,
    url: `${HC_URL}${path}`,
    headers: { 'X-API-Key': HC_KEY },
    data: data || undefined,
    timeout: 8000
  }).then(r => r.data)
}

// ── Statut global ──────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const [bulbs, presence, robot] = await Promise.all([
      hc('/api/lights/bulbs').catch(() => null),
      hc('/api/presence').catch(() => null),
      hc('/api/robot/status').catch(() => null)
    ])
    res.json({ bulbs, presence, robot })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Lumières ───────────────────────────────────────────────────────────────
router.post('/lights/:action', async (req, res) => {
  try {
    const data = await hc(`/api/lights/${req.params.action}`, 'POST', req.body)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Robot ──────────────────────────────────────────────────────────────────
router.get('/robot/status',  async (req, res) => {
  try { res.json(await hc('/api/robot/status')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})
router.get('/robot/lifespan', async (req, res) => {
  try { res.json(await hc('/api/robot/lifespan')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})
router.post('/robot/:action', async (req, res) => {
  try {
    const data = await hc(`/api/robot/${req.params.action}`, 'POST', req.body)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── PC Wake-on-LAN ─────────────────────────────────────────────────────────
router.post('/pc/wake', async (req, res) => {
  try { res.json(await hc('/api/pc/wake', 'POST')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Présence ───────────────────────────────────────────────────────────────
router.get('/presence', async (req, res) => {
  try { res.json(await hc('/api/presence')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Automations ────────────────────────────────────────────────────────────
router.get('/automations', async (req, res) => {
  try { res.json(await hc('/api/automations')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})
router.post('/automations/:id/toggle', async (req, res) => {
  try { res.json(await hc(`/api/automations/${req.params.id}/toggle`, 'POST')) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
