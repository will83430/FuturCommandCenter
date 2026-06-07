const API = 'http://localhost:3737/api'

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

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
    bodyMetrics:   (days)  => apiFetch(`/health/body-metrics?days=${days||90}`),
    addBodyMetric: (data)  => apiFetch('/health/body-metrics', { method:'POST', body: JSON.stringify(data) }),
    delBodyMetric: (id)    => apiFetch(`/health/body-metrics/${id}`, { method:'DELETE' }),
    sync:         (days)   => apiFetch(`/health/sync?days=${days || 30}`, { method: 'POST' })
  }
}
