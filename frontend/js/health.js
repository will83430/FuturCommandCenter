async function renderHealth() {
  const page = document.getElementById('page-health')

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Sport &amp; Santé</h1>
      <div class="health-actions">
        <span id="garminStatus" class="garmin-status"></span>
        <span id="lastSyncLabel" class="sync-label"></span>
        <button class="btn-sync" id="btnSyncGarmin" onclick="syncGarmin()">
          <span class="sync-icon">↻</span> Sync Garmin
        </button>
      </div>
    </div>

    <!-- Aujourd'hui -->
    <div class="today-section" id="todaySection">
      <div class="today-grid" id="todayGrid">
        <div class="skeleton-card"></div><div class="skeleton-card"></div>
        <div class="skeleton-card"></div><div class="skeleton-card"></div>
      </div>
    </div>

    <!-- Body Metrics -->
    <div class="section-title">Poids &amp; Composition corporelle</div>
    <div class="bm-layout">
      <div class="health-panel bm-form-panel">
        <h2 class="panel-title">Saisir une mesure</h2>
        <div class="bm-form">
          <label class="bm-label">Date</label>
          <input type="date" id="bmDate" class="bm-input" value="${new Date().toISOString().slice(0,10)}">
          <label class="bm-label">Poids (kg)</label>
          <input type="number" id="bmWeight" class="bm-input" step="0.1" placeholder="ex: 75.5">
          <label class="bm-label">IMC</label>
          <input type="number" id="bmBmi" class="bm-input" step="0.1" placeholder="calculé auto si vide">
          <label class="bm-label">Masse grasse (%)</label>
          <input type="number" id="bmFat" class="bm-input" step="0.1" placeholder="optionnel">
          <label class="bm-label">Masse musculaire (kg)</label>
          <input type="number" id="bmMuscle" class="bm-input" step="0.1" placeholder="optionnel">
          <button class="btn-sync bm-save" onclick="saveBodyMetric()">💾 Enregistrer</button>
          <div id="bmFeedback" class="bm-feedback"></div>
        </div>
      </div>
      <div class="health-panel bm-chart-panel">
        <h2 class="panel-title">Évolution du poids — 90 jours</h2>
        <div class="chart-container"><canvas id="weightChart"></canvas></div>
      </div>
      <div class="health-panel bm-history-panel">
        <h2 class="panel-title">Historique</h2>
        <div id="bmHistory" class="bm-history"><div class="loading-text">Chargement…</div></div>
      </div>
    </div>

    <!-- Cartes résumé 7j -->
    <div class="section-title">Moyenne 7 derniers jours</div>
    <div class="health-cards" id="healthCards">
      <div class="skeleton-card"></div><div class="skeleton-card"></div>
      <div class="skeleton-card"></div><div class="skeleton-card"></div>
    </div>

    <!-- Grille graphes + activités -->
    <div class="health-bottom">
      <div class="health-charts">
        <div class="health-panel">
          <h2 class="panel-title">Body Battery + Stress — 14 jours</h2>
          <div class="chart-container"><canvas id="wellnessChart"></canvas></div>
        </div>
        <div class="health-panel">
          <h2 class="panel-title">Pas / jour — 30 derniers jours</h2>
          <div class="chart-container"><canvas id="stepsChart"></canvas></div>
        </div>
        <div class="health-panel">
          <h2 class="panel-title">Sommeil — 30 derniers jours</h2>
          <div class="chart-container"><canvas id="sleepChart"></canvas></div>
        </div>
      </div>
      <div class="health-right">
        <div class="health-panel health-panel-activities">
          <h2 class="panel-title">Activités récentes</h2>
          <div id="activitiesList" class="activities-list"><div class="loading-text">Chargement…</div></div>
        </div>
        <div class="health-panel">
          <h2 class="panel-title">Répartition activités (90j)</h2>
          <div id="byTypeList" class="bytype-list"></div>
        </div>
      </div>
    </div>

    <!-- Records personnels -->
    <div class="section-title">Records personnels</div>
    <div id="recordsGrid" class="records-grid"><div class="loading-text">Chargement…</div></div>

    <!-- Progression mensuelle -->
    <div class="section-title">Progression — 12 derniers mois</div>
    <div class="health-panel" style="margin-bottom:20px">
      <div class="chart-container"><canvas id="progressionChart"></canvas></div>
    </div>
  `

  checkGarminStatus()
  loadToday()
  loadHealthSummary()
  loadActivities()
  loadDailyCharts()
  loadByType()
  loadBodyMetrics()
  loadRecords()
  loadProgression()
}

// ── Statut Garmin ─────────────────────────────────────────────────────────
async function checkGarminStatus() {
  try {
    const data = await api.health.garminStatus()
    const el   = document.getElementById('garminStatus')
    el.innerHTML = data.configured
      ? '<span class="status-badge ok">Garmin connecté</span>'
      : '<span class="status-badge warn">Garmin non configuré</span>'
    if (!data.configured) document.getElementById('btnSyncGarmin').disabled = true
    if (data.lastAutoSync) {
      document.getElementById('lastSyncLabel').textContent =
        'Sync auto : ' + new Date(data.lastAutoSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
  } catch {}
}

// ── Aujourd'hui ────────────────────────────────────────────────────────────
async function loadToday() {
  try {
    const d   = await api.health.today()
    const grid = document.getElementById('todayGrid')

    const bb    = d.body_battery_max ?? null
    const steps = d.steps ?? 0
    const goal  = d.steps_goal ?? 10000
    const cal   = d.calories_active ?? null
    const stress= d.avg_stress ?? null
    const hrv   = d.hrv_avg ?? null
    const sleep = d.sleep_duration_s ? formatDuration(d.sleep_duration_s) : null

    grid.innerHTML = `
      <div class="today-card">
        <div class="today-card-title">Body Battery</div>
        ${bbGauge(bb)}
      </div>
      <div class="today-card">
        <div class="today-card-title">Pas aujourd'hui</div>
        <div class="today-big">${steps.toLocaleString('fr-FR')}</div>
        <div class="today-sub">Objectif : ${goal.toLocaleString('fr-FR')}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, (steps/goal)*100).toFixed(0)}%"></div></div>
      </div>
      <div class="today-card">
        <div class="today-card-title">Sommeil dernière nuit</div>
        <div class="today-big">${sleep ?? '—'}</div>
        ${d.deep_sleep_s || d.rem_sleep_s ? `
          <div class="sleep-mini">
            <span class="sleep-deep">Profond ${formatDuration(d.deep_sleep_s||0)}</span>
            <span class="sleep-rem">REM ${formatDuration(d.rem_sleep_s||0)}</span>
            <span class="sleep-light">Léger ${formatDuration(d.light_sleep_s||0)}</span>
          </div>` : ''}
      </div>
      <div class="today-card">
        <div class="today-card-title">Stress &amp; HRV</div>
        <div class="today-stress">
          <div>
            <div class="today-big">${stress !== null ? stress + '<span class="today-unit">/100</span>' : '—'}</div>
            <div class="today-sub">Stress moy.</div>
          </div>
          <div>
            <div class="today-big">${hrv !== null ? Math.round(hrv) + '<span class="today-unit">ms</span>' : '—'}</div>
            <div class="today-sub">HRV nuit</div>
          </div>
        </div>
      </div>
    `
  } catch {
    document.getElementById('todayGrid').innerHTML = '<div class="no-data">Aucune donnée — synchronise Garmin</div>'
  }
}

function bbGauge(val) {
  if (val === null) return '<div class="bb-gauge-empty">—</div>'
  const pct   = val
  const color = pct >= 70 ? '#00d4ff' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const deg   = -135 + (pct / 100) * 270
  return `
    <div class="bb-gauge">
      <svg viewBox="0 0 100 60" class="bb-arc">
        <path d="M10,55 A45,45 0 1,1 90,55" fill="none" stroke="#ffffff11" stroke-width="8" stroke-linecap="round"/>
        <path d="M10,55 A45,45 0 1,1 90,55" fill="none" stroke="${color}" stroke-width="8"
              stroke-linecap="round" stroke-dasharray="${(pct/100)*226} 226"
              style="transition:stroke-dasharray .8s ease"/>
      </svg>
      <div class="bb-value" style="color:${color}">${val}</div>
      <div class="bb-label">/ 100</div>
    </div>
  `
}

// ── Résumé 7j ─────────────────────────────────────────────────────────────
async function loadHealthSummary() {
  try {
    const data      = document.getElementById('healthCards')
    const s         = await api.health.summary()
    const w         = s.weekStats || {}
    const m         = s.monthActivity || {}

    const cards = [
      { icon:'👟', val: Math.round(w.avg_steps||0).toLocaleString('fr-FR'), label:'Pas/jour moy.' },
      { icon:'😴', val: w.avg_sleep_s ? formatDuration(w.avg_sleep_s) : '—', label:'Sommeil moy.' },
      { icon:'❤️', val: w.avg_rest_hr ? Math.round(w.avg_rest_hr)+' <span class="card-unit">bpm</span>' : '—', label:'FC repos moy.' },
      { icon:'⚡', val: w.avg_body_battery ? Math.round(w.avg_body_battery)+' <span class="card-unit">/100</span>' : '—', label:'Body Battery moy.' },
      { icon:'🧘', val: w.avg_stress ? Math.round(w.avg_stress)+' <span class="card-unit">/100</span>' : '—', label:'Stress moy.' },
      { icon:'💓', val: w.avg_hrv ? Math.round(w.avg_hrv)+' <span class="card-unit">ms</span>' : '—', label:'HRV moy.' },
      { icon:'🏃', val: m.nb_activities||0, label:'Activités (30j)' },
      { icon:'📍', val: m.total_distance_m ? (m.total_distance_m/1000).toFixed(1)+' <span class="card-unit">km</span>' : '—', label:'Distance (30j)' },
    ]

    document.getElementById('healthCards').innerHTML = cards.map(c => `
      <div class="health-card">
        <div class="card-icon">${c.icon}</div>
        <div class="card-value">${c.val}</div>
        <div class="card-label">${c.label}</div>
      </div>
    `).join('')

    if (s.lastActivity) {
      document.getElementById('healthCards').insertAdjacentHTML('beforeend', `
        <div class="health-card wide">
          <div class="card-icon">⚡</div>
          <div class="card-label-top">Dernière activité</div>
          <div class="card-value-sm">${activityIcon(s.lastActivity.type)} ${s.lastActivity.name || s.lastActivity.type} — ${formatDate(s.lastActivity.date)}</div>
        </div>
      `)
    }
  } catch {
    document.getElementById('healthCards').innerHTML = '<div class="error-text">Erreur chargement</div>'
  }
}

// ── Activités ─────────────────────────────────────────────────────────────
async function loadActivities() {
  try {
    const data = await api.health.activities({ limit: 15 })
    const list = document.getElementById('activitiesList')
    if (!data.activities.length) {
      list.innerHTML = '<div class="no-data">Aucune activité</div>'
      return
    }
    list.innerHTML = data.activities.map(a => `
      <div class="activity-row" onclick="openActivityModal('${a.id}')" style="cursor:pointer" title="Voir les détails">
        <div class="activity-icon">${activityIcon(a.type)}</div>
        <div class="activity-info">
          <span class="activity-name">${a.name || a.type}</span>
          <span class="activity-date">${formatDate(a.date)}</span>
        </div>
        <div class="activity-stats">
          ${a.distance_m ? `<span>${(a.distance_m/1000).toFixed(2)} km</span>` : ''}
          ${a.duration_s ? `<span>${formatDuration(a.duration_s)}</span>` : ''}
          ${a.calories   ? `<span>${a.calories} kcal</span>` : ''}
          ${a.avg_hr     ? `<span>❤️ ${a.avg_hr} bpm</span>` : ''}
        </div>
        <div class="activity-detail-arrow">›</div>
      </div>
    `).join('')
  } catch {
    document.getElementById('activitiesList').innerHTML = '<div class="error-text">Erreur</div>'
  }
}

// ── Répartition par type ──────────────────────────────────────────────────
async function loadByType() {
  try {
    const rows  = await api.health.byType()
    const list  = document.getElementById('byTypeList')
    const total = rows.reduce((s, r) => s + parseInt(r.nb), 0)
    list.innerHTML = rows.map(r => {
      const pct = ((r.nb / total) * 100).toFixed(0)
      return `
        <div class="bytype-row">
          <span class="bytype-icon">${activityIcon(r.type)}</span>
          <span class="bytype-name">${r.type}</span>
          <div class="bytype-bar-wrap">
            <div class="bytype-bar" style="width:${pct}%"></div>
          </div>
          <span class="bytype-count">${r.nb}×</span>
        </div>
      `
    }).join('') || '<div class="no-data">Aucune activité</div>'
  } catch {}
}

// ── Graphes ───────────────────────────────────────────────────────────────
const chartInstances = {}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id] }
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, padding: 12 } },
    tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 10 }
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 7, maxRotation: 0 }, grid: { color: '#ffffff06' }, border: { display: false } },
    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#ffffff08' }, border: { display: false } }
  }
}

async function loadDailyCharts() {
  const fmt = d => { const dt = new Date(d); return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}` }

  const [dailyRes, wellnessRes] = await Promise.allSettled([
    api.health.daily(30),
    api.health.wellness(14)
  ])
  const daily   = dailyRes.status   === 'fulfilled' ? dailyRes.value   : []
  const wellness = wellnessRes.status === 'fulfilled' ? wellnessRes.value : []

  try {

    if (wellness.length) {
      destroyChart('wellnessChart')
      const wLabels = wellness.map(d => fmt(d.date))
      chartInstances['wellnessChart'] = new Chart(document.getElementById('wellnessChart'), {
        type: 'bar',
        data: {
          labels: wLabels,
          datasets: [
            { type: 'bar',  label: 'Body Battery', data: wellness.map(d => d.body_battery_max ?? null), backgroundColor: '#00d4ff28', borderColor: '#00d4ff', borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
            { type: 'line', label: 'Stress',        data: wellness.map(d => d.avg_stress ?? null),      borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, pointBackgroundColor: '#f59e0b', borderWidth: 2, yAxisID: 'y2' }
          ]
        },
        options: {
          ...CHART_DEFAULTS,
          scales: {
            x:  { ...CHART_DEFAULTS.scales.x },
            y:  { ...CHART_DEFAULTS.scales.y, position: 'left',  min: 0, max: 100 },
            y2: { ...CHART_DEFAULTS.scales.y, position: 'right', min: 0, max: 100, grid: { display: false }, border: { display: false } }
          }
        }
      })
    }

    if (daily.length) {
      destroyChart('stepsChart')
      const dLabels = daily.map(d => fmt(d.date))
      chartInstances['stepsChart'] = new Chart(document.getElementById('stepsChart'), {
        type: 'bar',
        data: { labels: dLabels, datasets: [{ label: 'Pas', data: daily.map(d => d.steps || 0), backgroundColor: '#00d4ff28', borderColor: '#00d4ff', borderWidth: 1, borderRadius: 4 }] },
        options: { ...CHART_DEFAULTS, plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } } }
      })

      const hasSleep = daily.some(d => d.sleep_duration_s)
      if (hasSleep) {
        destroyChart('sleepChart')
        chartInstances['sleepChart'] = new Chart(document.getElementById('sleepChart'), {
          type: 'bar',
          data: {
            labels: dLabels,
            datasets: [
              { label: 'Profond', data: daily.map(d => d.deep_sleep_s  ? +(d.deep_sleep_s /3600).toFixed(2) : null), backgroundColor: '#6366f1cc', borderRadius: 2, stack: 'sleep' },
              { label: 'REM',     data: daily.map(d => d.rem_sleep_s   ? +(d.rem_sleep_s  /3600).toFixed(2) : null), backgroundColor: '#a78bfacc', borderRadius: 2, stack: 'sleep' },
              { label: 'Léger',   data: daily.map(d => d.light_sleep_s ? +(d.light_sleep_s/3600).toFixed(2) : null), backgroundColor: '#c4b5fdcc', borderRadius: 2, stack: 'sleep' },
              { label: 'Éveillé', data: daily.map(d => d.awake_sleep_s ? +(d.awake_sleep_s/3600).toFixed(2) : null), backgroundColor: '#475569cc', borderRadius: 2, stack: 'sleep' }
            ]
          },
          options: {
            ...CHART_DEFAULTS,
            scales: {
              x:  { ...CHART_DEFAULTS.scales.x },
              y:  { ...CHART_DEFAULTS.scales.y, title: { display: true, text: 'h', color: '#64748b', font: { size: 10 } } }
            }
          }
        })
      } else {
        document.getElementById('sleepChart').parentElement.innerHTML = '<div class="no-data" style="padding:60px 0">Pas de données de sommeil</div>'
      }
    }
  } catch (e) { console.error('loadDailyCharts:', e) }
}

function _legacy_drawWellnessChart(canvasId, labels, data) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w   = canvas.offsetWidth || 600
  const h   = canvas.offsetHeight || 180
  canvas.width  = w
  canvas.height = h

  const padL = 40, padB = 30, chartH = h - padB - 10
  const barW = (w - padL) / labels.length - 2

  ctx.clearRect(0, 0, w, h)

  // Grille
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = 10 + (chartH / 4) * i
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Barres body battery (bleu)
  data.forEach((d, i) => {
    const val = d.body_battery_max || 0
    const x   = padL + i * (barW + 2)
    const bh  = (val / 100) * chartH
    const y   = 10 + chartH - bh
    ctx.fillStyle = '#00d4ff22'
    ctx.fillRect(x, y, barW, bh)
    ctx.fillStyle = '#00d4ff'
    ctx.fillRect(x, y, barW, 2)
  })

  // Ligne stress (orange)
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  data.forEach((d, i) => {
    if (d.avg_stress == null) return
    const x = padL + i * (barW + 2) + barW / 2
    const y = 10 + chartH - (d.avg_stress / 100) * chartH
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  labels.forEach((lbl, i) => {
    if (i % 3 === 0) {
      const x = padL + i * (barW + 2) + barW / 2
      ctx.fillText(lbl, x, h - 8)
    }
  })

  // Légende
  ctx.fillStyle = '#00d4ff'; ctx.fillRect(padL, 6, 10, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px sans-serif'
  ctx.textAlign = 'left'; ctx.fillText('Body Battery', padL + 14, 11)
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(padL + 90, 8); ctx.lineTo(padL + 100, 8); ctx.stroke()
  ctx.fillText('Stress', padL + 104, 11)
}

function _legacy_drawSleepStackedChart(canvasId, data) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w   = canvas.offsetWidth || 600
  const h   = canvas.offsetHeight || 220
  canvas.width  = w
  canvas.height = h

  const padL = 44, padB = 30, chartH = h - padB - 14
  const barW = (w - padL) / data.length - 2

  const maxSleep = Math.max(...data.map(d =>
    (d.deep_sleep_s||0)+(d.light_sleep_s||0)+(d.rem_sleep_s||0)+(d.awake_sleep_s||0) || d.sleep_duration_s || 0
  ), 1)

  ctx.clearRect(0, 0, w, h)

  // Grille + labels gauche (heures)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const y  = 14 + (chartH / 4) * i
    const hr = ((maxSleep / 3600) * (1 - i / 4)).toFixed(0)
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w, y); ctx.stroke()
    ctx.fillText(hr + 'h', padL - 4, y + 3)
  }

  const colors = { deep:'#6366f1', rem:'#a78bfa', light:'#c4b5fd', awake:'#4b5563' }

  data.forEach((d, i) => {
    const total = (d.deep_sleep_s||0)+(d.light_sleep_s||0)+(d.rem_sleep_s||0)+(d.awake_sleep_s||0) || d.sleep_duration_s || 0
    if (!total) return
    const x = padL + i * (barW + 2)
    let yPos = 14 + chartH

    const segments = d.deep_sleep_s
      ? [
          { s: d.deep_sleep_s||0,  c: colors.deep },
          { s: d.rem_sleep_s||0,   c: colors.rem  },
          { s: d.light_sleep_s||0, c: colors.light },
          { s: d.awake_sleep_s||0, c: colors.awake }
        ]
      : [{ s: total, c: colors.light }]

    segments.forEach(({ s, c }) => {
      if (!s) return
      const bh = (s / maxSleep) * chartH
      yPos -= bh
      ctx.fillStyle = c
      ctx.fillRect(x, yPos, barW, bh)
    })
  })

  // Labels X
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  data.forEach((d, i) => {
    if (i % 5 === 0) {
      const dt = new Date(d.date)
      const lbl = `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}`
      ctx.fillText(lbl, padL + i * (barW + 2) + barW / 2, h - 8)
    }
  })

  // Légende
  const legend = [['Profond', colors.deep], ['REM', colors.rem], ['Léger', colors.light], ['Éveillé', colors.awake]]
  let lx = padL
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'left'
  legend.forEach(([label, color]) => {
    ctx.fillStyle = color; ctx.fillRect(lx, 2, 8, 6)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(label, lx + 11, 9)
    lx += label.length * 5 + 22
  })
}

function _legacy_drawBarChart(canvasId, labels, data, color, label) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const max = Math.max(...data, 1)
  const w   = canvas.offsetWidth || 600
  const h   = canvas.offsetHeight || 180
  canvas.width  = w
  canvas.height = h

  const barW  = (w - 40) / labels.length - 2
  const padL  = 40, padB = 30, chartH = h - padB - 10

  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = 10 + (chartH / 4) * i
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w, y); ctx.stroke()
  }
  data.forEach((val, i) => {
    const x  = padL + i * (barW + 2)
    const bh = (val / max) * chartH
    const y  = 10 + chartH - bh
    ctx.fillStyle = color + '33'; ctx.fillRect(x, y, barW, bh)
    ctx.fillStyle = color;        ctx.fillRect(x, y, barW, 2)
  })
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  labels.forEach((lbl, i) => {
    if (i % 5 === 0) ctx.fillText(lbl, padL + i * (barW + 2) + barW / 2, h - 8)
  })
}

// ── Sync manuel ───────────────────────────────────────────────────────────
async function syncGarmin() {
  const btn = document.getElementById('btnSyncGarmin')
  btn.disabled = true
  btn.innerHTML = '<span class="sync-icon spinning">↻</span> Sync…'
  try {
    const result = await api.health.sync(7)
    btn.innerHTML = `✓ ${result.activities} activités, ${result.dailyStats} jours`
    setTimeout(() => renderHealth(), 1500)
  } catch (err) {
    const msg = err.message?.includes('rate') || err.message?.includes('429') || err.message?.includes('Rate')
      ? '✗ Rate limit — réessaie dans 10 min'
      : '✗ Erreur sync'
    btn.innerHTML = msg
    setTimeout(() => { btn.innerHTML = '<span class="sync-icon">↻</span> Sync Garmin'; btn.disabled = false }, 5000)
  }
}

// ── Body Metrics ──────────────────────────────────────────────────────────
let weightChartInst = null

async function loadBodyMetrics() {
  try {
    const rows = await api.health.bodyMetrics(90)
    renderWeightChart(rows)
    renderBmHistory(rows)
  } catch {}
}

function renderWeightChart(rows) {
  const canvas = document.getElementById('weightChart')
  if (!canvas || !rows.length) return
  if (weightChartInst) weightChartInst.destroy()
  const labels  = rows.map(r => { const d = new Date(r.date); return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}` })
  const weights = rows.map(r => r.weight_kg)
  const fats    = rows.map(r => r.fat_pct)
  weightChartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Poids (kg)', data: weights, borderColor: '#00d4ff', backgroundColor: '#00d4ff22', tension: 0.3, pointRadius: 4, yAxisID: 'y' },
        { label: 'Masse grasse (%)', data: fats, borderColor: '#f59e0b', backgroundColor: '#f59e0b22', tension: 0.3, pointRadius: 3, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x:  { ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 7, maxRotation: 0 }, grid: { color: '#ffffff08' } },
        y:  { position: 'left',  ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#ffffff08' }, title: { display: true, text: 'kg', color: '#64748b' } },
        y2: { position: 'right', ticks: { color: '#f59e0b', font: { size: 11 } }, grid: { display: false }, title: { display: true, text: '%', color: '#f59e0b' } }
      }
    }
  })
}

function renderBmHistory(rows) {
  const el = document.getElementById('bmHistory')
  if (!rows.length) { el.innerHTML = '<div class="no-data">Aucune mesure</div>'; return }
  el.innerHTML = [...rows].reverse().map(r => `
    <div class="bm-row">
      <span class="bm-row-date">${new Date(r.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'2-digit' })}</span>
      <span class="bm-row-val">${r.weight_kg} kg</span>
      ${r.bmi       ? `<span class="bm-row-tag">IMC ${r.bmi}</span>` : ''}
      ${r.fat_pct   ? `<span class="bm-row-tag">🔥 ${r.fat_pct}%</span>` : ''}
      ${r.muscle_kg ? `<span class="bm-row-tag">💪 ${r.muscle_kg} kg</span>` : ''}
      <button class="bm-del" onclick="delBodyMetric(${r.id})" title="Supprimer">✕</button>
    </div>
  `).join('')
}

async function saveBodyMetric() {
  const fb = document.getElementById('bmFeedback')
  const data = {
    date:      document.getElementById('bmDate').value,
    weight_kg: parseFloat(document.getElementById('bmWeight').value),
    bmi:       parseFloat(document.getElementById('bmBmi').value) || null,
    fat_pct:   parseFloat(document.getElementById('bmFat').value) || null,
    muscle_kg: parseFloat(document.getElementById('bmMuscle').value) || null
  }
  if (!data.date || isNaN(data.weight_kg)) { fb.textContent = '⚠ Date et poids requis'; fb.className = 'bm-feedback err'; return }
  try {
    await api.health.addBodyMetric(data)
    fb.textContent = '✓ Enregistré'; fb.className = 'bm-feedback ok'
    document.getElementById('bmWeight').value = ''
    document.getElementById('bmBmi').value = ''
    document.getElementById('bmFat').value = ''
    document.getElementById('bmMuscle').value = ''
    setTimeout(() => fb.textContent = '', 2000)
    loadBodyMetrics()
  } catch (e) { fb.textContent = '✗ ' + e.message; fb.className = 'bm-feedback err' }
}

async function delBodyMetric(id) {
  if (!confirm('Supprimer cette mesure ?')) return
  await api.health.delBodyMetric(id)
  loadBodyMetrics()
}

// ── Modal détail activité ─────────────────────────────────────────────────
async function openActivityModal(id) {
  const existing = document.getElementById('activityModal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'activityModal'
  overlay.className = 'act-modal-overlay'
  overlay.innerHTML = `
    <div class="act-modal">
      <div class="act-modal-header">
        <div class="act-modal-title">
          <span class="act-modal-icon" id="amIcon">⚡</span>
          <div>
            <div id="amName" class="act-modal-name">Chargement…</div>
            <div id="amDate" class="act-modal-date"></div>
          </div>
        </div>
        <button class="act-modal-close" onclick="document.getElementById('activityModal').remove()">✕</button>
      </div>
      <div id="amBody" class="act-modal-body">
        <div class="act-modal-loading">Récupération des données…</div>
      </div>
    </div>
  `
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)

  try {
    const [d, trackData] = await Promise.all([
      api.health.activityDetail(id),
      api.health.activityTrack(id).catch(() => ({ coords: [], meta: {} }))
    ])
    const track = trackData.coords || []
    const meta  = trackData.meta  || {}

    document.getElementById('amIcon').textContent = activityIcon(d.type)
    document.getElementById('amName').textContent = d.name || d.type
    document.getElementById('amDate').textContent =
      new Date(d.date).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    document.getElementById('amBody').innerHTML = buildActivityDetail(d, track, meta)

    if (track.length > 1) {
      initActivityMap(track, meta)
      if (meta.hasEle || meta.hasHR) initProfileChart(track, meta)
    }
  } catch (e) {
    document.getElementById('amBody').innerHTML = `<div class="error-text">Erreur : ${e.message}</div>`
  }
}

function speedColor(t) {
  if (t < 0) return 'hsl(220,15%,38%)' // arrêt → gris neutre
  const stops = [[240,80,55],[180,85,50],[120,85,48],[60,88,46],[0,88,46]]
  const idx = Math.min(Math.floor(t * 4), 3)
  const s   = (t * 4) - idx
  const [h1,s1,l1] = stops[idx], [h2,s2,l2] = stops[idx+1]
  const h = h1 + (h2-h1)*s, sat = s1+(s2-s1)*s, lig = l1+(l2-l1)*s
  return `hsl(${h},${sat}%,${lig}%)`
}

function initActivityMap(pts, meta) {
  requestAnimationFrame(() => {
    const el = document.getElementById('amMap')
    if (!el || !window.L) return

    const map = L.map(el, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19, opacity: .85
    }).addTo(map)

    const bounds = []

    const latLngs = pts.map(p => [p.lat, p.lng])
    latLngs.forEach(c => bounds.push(c))

    const tOf = spd => {
      if (!spd || spd < 0.3) return -1
      if (meta.maxSpeed <= meta.minSpeed) return 0.5
      return Math.min(1, Math.max(0, (spd - meta.minSpeed) / (meta.maxSpeed - meta.minSpeed)))
    }

    const GradLayer = L.Layer.extend({
      onAdd(map) {
        this._map = map
        this._c = L.DomUtil.create('canvas', '', map.getPanes().overlayPane)
        Object.assign(this._c.style, { position: 'absolute', pointerEvents: 'none' })
        map.on('moveend zoomend resize', this._draw, this)
        this._draw()
      },
      onRemove(map) {
        this._c.remove()
        map.off('moveend zoomend resize', this._draw, this)
      },
      _draw() {
        const map = this._map
        const origin = map.latLngToLayerPoint(map.getBounds().getNorthWest())
        const size = map.getSize()
        const c = this._c
        L.DomUtil.setPosition(c, origin)
        c.width = size.x; c.height = size.y
        const ctx = c.getContext('2d')
        ctx.clearRect(0, 0, size.x, size.y)
        ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'butt'

        const tp = p => {
          const lp = map.latLngToLayerPoint([p.lat, p.lng])
          return [lp.x - origin.x, lp.y - origin.y]
        }

        if (meta.hasSpeed && meta.maxSpeed > meta.minSpeed) {
          for (let i = 0; i < pts.length - 1; i++) {
            const [x1,y1] = tp(pts[i]), [x2,y2] = tp(pts[i+1])
            const g = ctx.createLinearGradient(x1, y1, x2, y2)
            g.addColorStop(0, speedColor(tOf(pts[i].speed || 0)))
            g.addColorStop(1, speedColor(tOf(pts[i+1].speed || 0)))
            ctx.beginPath(); ctx.strokeStyle = g
            ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
          }
        } else {
          ctx.beginPath(); ctx.strokeStyle = '#00d4ff'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
          pts.forEach((p, i) => { const [x,y] = tp(p); i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y) })
          ctx.stroke()
        }
      }
    })
    new GradLayer().addTo(map)

    // Marqueurs départ / arrivée
    const iconStyle = (color, label) => L.divIcon({
      html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
      iconSize: [12,12], iconAnchor: [6,6], className: ''
    })
    L.marker([pts[0].lat, pts[0].lng], { icon: iconStyle('#00ff9d','Départ') })
      .bindTooltip('Départ', { permanent: false }).addTo(map)
    L.marker([pts[pts.length-1].lat, pts[pts.length-1].lng], { icon: iconStyle('#ff4d6d','Arrivée') })
      .bindTooltip('Arrivée', { permanent: false }).addTo(map)

    map.fitBounds(bounds, { padding: [20, 20] })
  })
}

function initProfileChart(pts, meta) {
  requestAnimationFrame(() => {
    const el = document.getElementById('amProfileChart')
    if (!el || !window.Chart) return

    const distKm = pts.map(p => p.dist != null ? +(p.dist / 1000).toFixed(3) : null)
    const datasets = []

    if (meta.hasEle) {
      datasets.push({
        label: 'Élévation (m)', data: pts.map(p => p.ele),
        borderColor: '#f59e0b', backgroundColor: '#f59e0b18',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: 'yEle'
      })
    }
    if (meta.hasHR) {
      datasets.push({
        label: 'FC (bpm)', data: pts.map(p => p.hr),
        borderColor: '#ef4444', backgroundColor: 'transparent',
        fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: 'yHR'
      })
    }

    new Chart(el, {
      type: 'line',
      data: { labels: distKm, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 } },
          tooltip: { mode: 'index', intersect: false, backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, callbacks: { title: items => { const km = distKm[items[0]?.dataIndex]; if (km == null) return ''; const maxKm = distKm[distKm.length-1]||1; return maxKm < 2 ? Math.round(km*1000)+'m' : km.toFixed(2)+'km' } } }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 8, callback: v => { const km = distKm[v]; if (km == null) return ''; const maxKm = distKm[distKm.length-1]||1; return maxKm < 2 ? Math.round(km*1000)+'m' : maxKm < 10 ? km.toFixed(1)+'km' : Math.round(km)+'km' } }, grid: { color: '#ffffff06' }, border: { display: false } },
          yEle: { display: meta.hasEle, position: 'left',  ticks: { color: '#f59e0b', font: { size: 9 } }, grid: { color: '#ffffff08' }, border: { display: false } },
          yHR:  { display: meta.hasHR,  position: 'right', ticks: { color: '#ef4444', font: { size: 9 } }, grid: { display: false }, border: { display: false } }
        }
      }
    })
  })
}

function buildActivityDetail(d, track = [], meta = {}) {
  const g = d.garmin || {}
  const s = g.summaryDTO || {}

  const pace = ms => {
    if (!ms || ms <= 0) return '—'
    const secPerKm = 1000 / ms
    return `${Math.floor(secPerKm/60)}:${String(Math.round(secPerKm%60)).padStart(2,'0')} /km`
  }
  const speed = ms => ms ? (ms * 3.6).toFixed(1) + ' km/h' : '—'
  const elev  = v => v != null ? Math.round(v) + ' m' : '—'
  const hr    = v => v ? Math.round(v) + ' bpm' : '—'
  const cal   = v => v ? Math.round(v) + ' kcal' : '—'
  const dist  = m => m ? (m/1000).toFixed(2) + ' km' : '—'
  const dur   = s => s ? formatDuration(s) : '—'

  const statCard = (icon, label, value) =>
    `<div class="am-stat"><span class="am-stat-icon">${icon}</span><span class="am-stat-val">${value}</span><span class="am-stat-lbl">${label}</span></div>`

  const avgHr  = s.averageHR  || d.avg_hr
  const maxHr  = s.maxHR      || d.max_hr
  const elGain = s.elevationGain != null ? s.elevationGain : d.elevation_m
  const elLoss = s.elevationLoss
  const avgSpd = s.averageSpeed
  const maxSpd = s.maxSpeed
  const avgPace= s.averageMovingSpeed || s.averageSpeed
  const distM  = s.distance || d.distance_m
  const durS   = s.duration || d.duration_s
  const kcal   = s.calories || d.calories

  const type   = d.type || ''
  const isEndurance = ['running','cycling','hiking','trail_running','walking','indoor_cycling'].includes(type)
  const isStrength  = type === 'strength_training'
  const isSwimming  = type === 'swimming'

  const minHr   = s.minHR
  const avgCad  = s.averageRunCadence || s.averageBikingCadenceInRevPerMin
  const maxCad  = s.maxRunCadence     || s.maxBikingCadenceInRevPerMin
  const avgTemp = s.averageTemperature
  const te      = s.trainingEffect
  const teMsg   = s.aerobicTrainingEffectMessage?.replace(/_\d+$/, '').replace(/_/g,' ').toLowerCase()
  const load    = s.activityTrainingLoad
  const modMin  = s.moderateIntensityMinutes
  const vigMin  = s.vigorousIntensityMinutes
  const water   = s.waterEstimated

  let statsHtml = `<div class="am-stats-grid">`
  statsHtml += statCard('⏱', 'Durée', dur(durS))
  if (s.movingDuration && s.movingDuration !== durS) statsHtml += statCard('🏃', 'Temps mouvement', dur(s.movingDuration))
  if (distM) statsHtml += statCard('📍', 'Distance', dist(distM))
  statsHtml += statCard('🔥', 'Calories', cal(kcal))
  if (avgHr) statsHtml += statCard('❤️', 'FC moy.', hr(avgHr))
  if (maxHr) statsHtml += statCard('💓', 'FC max', hr(maxHr))
  if (minHr) statsHtml += statCard('🩶', 'FC min', hr(minHr))
  if (elGain != null) statsHtml += statCard('⬆️', 'D+ cumulé', elev(elGain))
  if (elLoss != null) statsHtml += statCard('⬇️', 'D- cumulé', elev(elLoss))
  if (s.maxElevation != null) statsHtml += statCard('🏔️', 'Alt. max', elev(s.maxElevation))
  if (s.minElevation != null) statsHtml += statCard('🏝️', 'Alt. min', elev(s.minElevation))
  if (isEndurance && avgPace) statsHtml += statCard('⚡', 'Allure moy.', pace(avgPace))
  if (avgSpd) statsHtml += statCard('🚀', 'Vitesse moy.', speed(avgSpd))
  if (maxSpd) statsHtml += statCard('💨', 'Vitesse max', speed(maxSpd))
  if (avgCad) statsHtml += statCard('🔄', 'Cadence moy.', Math.round(avgCad)+' spm')
  if (maxCad) statsHtml += statCard('🔄', 'Cadence max', Math.round(maxCad)+' spm')
  if (d.steps) statsHtml += statCard('👟', 'Pas', d.steps.toLocaleString('fr-FR'))
  if (avgTemp != null) statsHtml += statCard('🌡️', 'Température', Math.round(avgTemp)+'°C')
  if (te) statsHtml += statCard('💡', 'Effet entr.', (+te).toFixed(1)+' – '+(teMsg||''))
  if (load) statsHtml += statCard('📊', 'Charge', Math.round(load))
  if (modMin) statsHtml += statCard('🟡', 'Intensité mod.', Math.round(modMin)+' min')
  if (vigMin) statsHtml += statCard('🔴', 'Intensité élevée', Math.round(vigMin)+' min')
  if (water) statsHtml += statCard('💧', 'Hydratation', Math.round(water)+' ml')
  statsHtml += `</div>`

  let lapsHtml = ''
  const splits = g.splitSummaries || []
  if (splits.length) {
    const lapsByKm = splits.filter(s => s.splitType === 'RUN_SEGMENT_BY_DISTANCE' || s.splitType === 'INTERVAL_SUMMARY' || s.splitType === 'CLIMB_DESCENT' || s.distance > 0)
    const displaySplits = lapsByKm.length ? lapsByKm : splits.slice(0, 20)
    if (displaySplits.length > 1) {
      lapsHtml = `
        <div class="am-section-title">Segments / Kilomètres</div>
        <div class="am-laps">
          <div class="am-lap-header">
            <span>#</span><span>Distance</span><span>Durée</span>
            ${isEndurance ? '<span>Allure</span>' : ''}
            <span>FC moy.</span>
            ${elGain != null ? '<span>D+</span>' : ''}
          </div>
          ${displaySplits.map((lap, i) => `
            <div class="am-lap-row ${i % 2 === 0 ? 'even' : ''}">
              <span class="am-lap-num">${i + 1}</span>
              <span>${lap.distance ? (lap.distance/1000).toFixed(2)+' km' : '—'}</span>
              <span>${lap.duration ? formatDuration(lap.duration) : '—'}</span>
              ${isEndurance ? `<span>${lap.averageMovingSpeed || lap.averageSpeed ? pace(lap.averageMovingSpeed || lap.averageSpeed) : '—'}</span>` : ''}
              <span>${lap.averageHR ? Math.round(lap.averageHR)+' bpm' : '—'}</span>
              ${elGain != null ? `<span>${lap.elevationGain != null ? '+'+Math.round(lap.elevationGain)+'m' : '—'}</span>` : ''}
            </div>
          `).join('')}
        </div>
      `
    }
  }

  let hrZonesHtml = ''
  const zones = g.heartRateZones || []
  if (zones.length) {
    hrZonesHtml = `
      <div class="am-section-title">Zones de fréquence cardiaque</div>
      <div class="am-hr-zones">
        ${zones.map((z, i) => {
          const pct = z.secsInZone && durS ? Math.round((z.secsInZone / durS) * 100) : 0
          const colors = ['#64748b','#3b82f6','#22c55e','#f59e0b','#ef4444']
          return `
            <div class="am-hr-zone">
              <span class="am-zone-name" style="color:${colors[i]||'#94a3b8'}">${z.zoneName || 'Zone '+(i+1)}</span>
              <div class="am-zone-bar-wrap">
                <div class="am-zone-bar" style="width:${pct}%; background:${colors[i]||'#94a3b8'}"></div>
              </div>
              <span class="am-zone-time">${z.secsInZone ? formatDuration(z.secsInZone) : '—'}</span>
              <span class="am-zone-pct">${pct}%</span>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  let mapHtml = ''
  if (track.length > 1) {
    const legend = meta.hasSpeed ? `
      <div class="am-speed-legend">
        <span class="am-legend-label">Lent</span>
        <div class="am-legend-bar"></div>
        <span class="am-legend-label">Rapide</span>
        ${meta.maxSpeed ? `<span class="am-legend-speeds">${(meta.minSpeed*3.6).toFixed(1)} → ${(meta.maxSpeed*3.6).toFixed(1)} km/h</span>` : ''}
      </div>` : ''
    const profileHtml = (meta.hasEle || meta.hasHR) ? `
      <div class="am-section-title" style="margin-top:16px">Profil élévation / FC</div>
      <div class="am-profile-wrap"><canvas id="amProfileChart"></canvas></div>` : ''

    mapHtml = `
      <div class="am-section-title">Carte du parcours</div>
      <div id="amMap" class="am-map"></div>
      ${legend}${profileHtml}
    `
  }

  return statsHtml + mapHtml + lapsHtml + hrZonesHtml
}

// ── Helpers ───────────────────────────────────────────────────────────────
function activityIcon(type) {
  const icons = {
    running:'🏃', cycling:'🚴', swimming:'🏊', walking:'🚶',
    strength_training:'🏋️', yoga:'🧘', hiking:'🥾',
    indoor_cycling:'🚴', trail_running:'⛰️'
  }
  return icons[type] || '⚡'
}
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2,'0')}` : `${m}min`
}
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })
}

// ── Records personnels ────────────────────────────────────────────────────
const SPORT_META = {
  hiking:            { icon:'🥾', label:'Randonnée' },
  running:           { icon:'🏃', label:'Course' },
  cycling:           { icon:'🚴', label:'Vélo' },
  strength_training: { icon:'🏋️', label:'Musculation' },
  swimming:          { icon:'🏊', label:'Natation' },
  resort_skiing:     { icon:'⛷️', label:'Ski' },
  walking:           { icon:'🚶', label:'Marche' },
  trail_running:     { icon:'🏔️', label:'Trail' },
  indoor_cycling:    { icon:'🚴', label:'Home-trainer' }
}

async function loadRecords() {
  const el = document.getElementById('recordsGrid')
  if (!el) return
  try {
    const records = await api.health.records()
    if (!records.length) { el.innerHTML = '<p class="no-data">Aucune activité</p>'; return }

    el.innerHTML = records.map(r => {
      const meta = SPORT_META[r.type] || { icon:'🏅', label: r.type }
      const distKm = r.max_distance ? (r.max_distance/1000).toFixed(1) : null
      const totalKm = r.total_distance ? (r.total_distance/1000).toFixed(0) : null
      const totalH = r.total_duration ? Math.round(r.total_duration/3600) : null
      const hasDistance = r.max_distance > 0
      const items = []

      items.push({ icon:'🔢', label:'Séances', val: r.count })
      if (totalH)  items.push({ icon:'⏱', label:'Total temps', val: totalH+'h' })
      if (hasDistance && distKm) items.push({ icon:'📍', label:'+ longue', val: distKm+' km' })
      if (hasDistance && totalKm) items.push({ icon:'🗺️', label:'Total distance', val: totalKm+' km' })
      if (r.max_elevation > 0) items.push({ icon:'⬆️', label:'D+ record', val: Math.round(r.max_elevation)+'m' })
      if (r.max_avg_hr) items.push({ icon:'❤️', label:'FC moy. max', val: Math.round(r.max_avg_hr)+' bpm' })
      if (r.best_speed && hasDistance) {
        const spd = parseFloat(r.best_speed)
        const isRunning = ['running','trail_running'].includes(r.type)
        if (isRunning) {
          const sPerKm = 1000 / spd
          items.push({ icon:'⚡', label:'Meilleure allure', val: Math.floor(sPerKm/60)+':'+String(Math.round(sPerKm%60)).padStart(2,'0')+'/km' })
        } else {
          items.push({ icon:'🚀', label:'Vitesse moy. max', val: (spd*3.6).toFixed(1)+' km/h' })
        }
      }

      return `
        <div class="record-card">
          <div class="record-header">
            <span class="record-icon">${meta.icon}</span>
            <span class="record-sport">${meta.label}</span>
          </div>
          <div class="record-items">
            ${items.map(it => `
              <div class="record-item">
                <span class="record-item-icon">${it.icon}</span>
                <span class="record-item-val">${it.val}</span>
                <span class="record-item-lbl">${it.label}</span>
              </div>`).join('')}
          </div>
        </div>`
    }).join('')
  } catch (e) {
    el.innerHTML = '<p class="no-data">Erreur chargement records</p>'
  }
}

// ── Progression mensuelle ────────────────────────────────────────────────
async function loadProgression() {
  const el = document.getElementById('progressionChart')
  if (!el || !window.Chart) return
  try {
    const rows = await api.health.progression(12)
    if (!rows.length) return

    const months = [...new Set(rows.map(r => r.month))].sort()
    const types  = [...new Set(rows.map(r => r.type))]
    const COLORS = { hiking:'#22c55e', running:'#3b82f6', cycling:'#f59e0b', strength_training:'#a78bfa', resort_skiing:'#00d4ff', swimming:'#06b6d4', walking:'#94a3b8', trail_running:'#10b981', indoor_cycling:'#f97316' }

    const datasets = types.map(type => {
      const meta = SPORT_META[type] || { label: type }
      const hasDistance = rows.filter(r => r.type === type).some(r => r.total_distance > 0)
      const data = months.map(m => {
        const row = rows.find(r => r.month === m && r.type === type)
        if (!row) return 0
        return hasDistance ? +(row.total_distance/1000).toFixed(1) : +row.count
      })
      return {
        label: meta.label + (hasDistance ? ' (km)' : ' (séances)'),
        data, backgroundColor: (COLORS[type] || '#64748b') + '99',
        borderColor: COLORS[type] || '#64748b',
        borderWidth: 2, borderRadius: 4, borderSkipped: false
      }
    })

    const labels = months.map(m => {
      const [y, mo] = m.split('-')
      return new Date(y, mo-1).toLocaleDateString('fr-FR', { month:'short', year:'2-digit' })
    })

    new Chart(el, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color:'#94a3b8', font:{ size:11 }, boxWidth:12 } },
          tooltip: { backgroundColor:'#1e293b', titleColor:'#e2e8f0', bodyColor:'#94a3b8', borderColor:'#334155', borderWidth:1 }
        },
        scales: {
          x: { ticks:{ color:'#64748b', font:{ size:10 } }, grid:{ color:'#ffffff06' }, border:{ display:false } },
          y: { ticks:{ color:'#94a3b8', font:{ size:10 } }, grid:{ color:'#ffffff08' }, border:{ display:false } }
        }
      }
    })
  } catch (e) { console.error('progression', e) }
}
