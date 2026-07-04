const API = 'http://localhost:3737/api'

// Token initialisé via IPC Electron au démarrage
let _token = ''
const _tokenReady = window.electronAPI?.getBackendToken
  ? window.electronAPI.getBackendToken().then(t => { _token = t || '' })
  : Promise.resolve()

async function apiFetch(path, options = {}) {
  await _tokenReady
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (_token) headers['X-App-Token'] = _token
  const res = await fetch(API + path, { ...options, headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Exposé pour ai.js (fetch SSE manuel)
function getApiToken() { return _token }
function waitApiToken() { return _tokenReady }

window.api = {
  finances: {
    summary:    ()       => apiFetch('/finances/summary'),
    monthly:    ()       => apiFetch('/finances/monthly'),
    byCategory: (from, to) => apiFetch(`/finances/by-category?from=${from||''}&to=${to||''}`),
    transactions: (params) => {
      const q = new URLSearchParams(params).toString()
      return apiFetch(`/finances/transactions?${q}`)
    },
    balance:  () => apiFetch('/finances/balance'),
    forecast: () => apiFetch('/finances/forecast')
  },
  ai: {
    history: ()      => apiFetch('/ai/history'),
    chat:    (msg)   => apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ message: msg }) }),
    clear:   ()      => apiFetch('/ai/history', { method: 'DELETE' })
  },
  weather: () => apiFetch('/weather'),
  domotique: {
    status:           ()       => apiFetch('/domotique/status'),
    presence:         ()       => apiFetch('/domotique/presence'),
    lightsAction:     (a, b)   => apiFetch(`/domotique/lights/${a}`, { method:'POST', body: JSON.stringify(b||{}) }),
    lightsRgb:        (b)      => apiFetch('/domotique/lights/rgb',  { method:'POST', body: JSON.stringify(b||{}) }),
    robotAction:      (a)      => apiFetch(`/domotique/robot/${a}`, { method:'POST' }),
    robotStatus:      ()       => apiFetch('/domotique/robot/status'),
    wakePC:           ()       => apiFetch('/domotique/pc/wake', { method:'POST' }),
    automations:      ()       => apiFetch('/domotique/automations'),
    toggleAutomation: (id)     => apiFetch(`/domotique/automations/${id}/toggle`, { method:'POST' })
  },
  health: {
    summary:      ()       => apiFetch('/health/summary'),
    activities:   (params) => apiFetch(`/health/activities?${new URLSearchParams(params)}`),
    activityDetail: (id)  => apiFetch(`/health/activities/${id}`),
    activityTrack:  (id)  => apiFetch(`/health/activities/${id}/track`),
    daily:        (days)   => apiFetch(`/health/daily?days=${days || 30}`),
    wellness:     (days)   => apiFetch(`/health/wellness?days=${days || 14}`),
    today:        ()       => apiFetch('/health/today'),
    byType:       ()       => apiFetch('/health/by-type'),
    garminStatus:  ()      => apiFetch('/health/garmin-status'),
    records:       ()      => apiFetch('/health/records'),
    progression:   (m)     => apiFetch(`/health/progression?months=${m||12}`),
    bodyMetrics:   (days)  => apiFetch(`/health/body-metrics?days=${days||90}`),
    addBodyMetric: (data)  => apiFetch('/health/body-metrics', { method:'POST', body: JSON.stringify(data) }),
    delBodyMetric: (id)    => apiFetch(`/health/body-metrics/${id}`, { method:'DELETE' }),
    sync:         (days)   => apiFetch(`/health/sync?days=${days || 30}`, { method: 'POST' })
  }
}
