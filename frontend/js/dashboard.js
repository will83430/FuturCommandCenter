async function renderDashboard() {
  const el = document.getElementById('page-dashboard')
  el.innerHTML = '<div class="loading">Chargement du dashboard</div>'

  try {
    const [summary, monthly, cats, balance, forecast, healthSummary, todayHealth, lastActs, domo, weather, daily7] = await Promise.all([
      api.finances.summary(),
      api.finances.monthly(),
      api.finances.byCategory(),
      api.finances.balance(),
      api.finances.forecast(),
      api.health.summary().catch(() => null),
      api.health.today().catch(() => null),
      api.health.activities({ limit: 1 }).catch(() => []),
      api.domotique.status().catch(() => null),
      api.weather().catch(() => null),
      api.health.daily(7).catch(() => []),
    ])
    const lastActivity = (lastActs?.activities || lastActs)?.[0] || null

    const topExpenses = cats
      .filter(c => c.kind === 'expense')
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    const maxExpense = topExpenses[0]?.total || 1

    const fmt = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

    const fc = forecast.forecast
    const fcBalance = fc.balance
    const plannedItems = forecast.planned.items

    // Données sparklines 7j (ordre chronologique = déjà ASC depuis l'API)
    const bb7    = daily7.map(d => parseInt(d.body_battery_max) || 0)
    const steps7 = daily7.map(d => parseInt(d.steps) || 0)
    const sleep7 = daily7.map(d => Math.round((parseInt(d.sleep_duration_s) || 0) / 60))

    el.innerHTML = `
      <div class="page-header">
        <h1>⚡ Dashboard</h1>
        <p>Vue d'ensemble — ${new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      </div>

      <!-- Widgets rapides -->
      <div class="dash-widgets">
        ${weather ? `
          <div class="dash-widget weather-widget">
            <span class="dw-icon">${weather.icon}</span>
            <div class="dw-main">
              <span class="dw-val">${weather.temp}°C</span>
              <span class="dw-label">${weather.label}</span>
            </div>
            <div class="dw-sub">Ressenti ${weather.feels}°C · ${weather.humidity}% · ${weather.wind} km/h</div>
          </div>` : ''}
        ${lastActivity ? `
          <div class="dash-widget activity-widget" onclick="document.querySelector('[data-page=health]').click()">
            <span class="dw-icon">${actIcon(lastActivity.type)}</span>
            <div class="dw-main">
              <span class="dw-val">${lastActivity.name || lastActivity.type}</span>
              <span class="dw-label">Dernière activité · ${new Date(lastActivity.date).toLocaleDateString('fr-FR', {day:'numeric',month:'short'})}</span>
            </div>
            <div class="dw-sub">${lastActivity.distance_m ? (lastActivity.distance_m/1000).toFixed(1)+'km · ' : ''}${lastActivity.duration_s ? fmtDur(lastActivity.duration_s) : ''}</div>
          </div>` : ''}
        ${domo?.bulbs ? `
          <div class="dash-widget lights-widget" onclick="document.querySelector('[data-page=domotique]').click()">
            <span class="dw-icon">💡</span>
            <div class="dw-main">
              <span class="dw-val">Lumières</span>
              <span class="dw-label">${domo.bulbs?.bulbs?.length || 0} ampoule(s)</span>
            </div>
            <div class="dw-sub">Walter · ${domo.robot?.state === 'DOCKED' ? 'Docké 🔋'+domo.robot.battery+'%' : domo.robot?.state || '—'}</div>
          </div>` : ''}
      </div>

      <!-- Santé du jour -->
      ${todayHealth || healthSummary ? `
      <div class="section-title">Santé aujourd'hui</div>
      <div class="dash-health-grid">
        ${dashHealthCard('⚡', 'Body Battery',
            todayHealth?.body_battery_max != null ? bbColor(todayHealth.body_battery_max) : (healthSummary?.weekStats?.avg_body_battery ? Math.round(healthSummary.weekStats.avg_body_battery)+'/100' : '—'),
            todayHealth?.body_battery_max != null ? bbStatus(todayHealth.body_battery_max) : 'moy. 7j',
            bb7.length ? 'spark-bb' : null)}
        ${dashHealthCard('👟', 'Pas',
            (todayHealth?.steps||0).toLocaleString('fr-FR'),
            'aujourd\'hui',
            steps7.length ? 'spark-steps' : null)}
        ${dashHealthCard('😴', 'Sommeil',
            todayHealth?.sleep_duration_s ? fmtDur(todayHealth.sleep_duration_s) : (healthSummary?.weekStats?.avg_sleep_s ? fmtDur(healthSummary.weekStats.avg_sleep_s) : '—'),
            todayHealth?.sleep_duration_s ? 'nuit dernière' : 'moy. 7j',
            sleep7.length ? 'spark-sleep' : null)}
        ${dashHealthCard('🧘', 'Stress', todayHealth?.avg_stress != null ? todayHealth.avg_stress+'/100' : (healthSummary?.weekStats?.avg_stress ? Math.round(healthSummary.weekStats.avg_stress)+'/100' : '—'), todayHealth?.avg_stress != null ? 'aujourd\'hui' : 'moy. 7j')}
        ${dashHealthCard('❤️', 'FC repos', healthSummary?.weekStats?.avg_rest_hr ? Math.round(healthSummary.weekStats.avg_rest_hr)+' bpm' : '—', 'moy. 7j')}
        ${dashHealthCard('💓', 'HRV', healthSummary?.weekStats?.avg_hrv ? Math.round(healthSummary.weekStats.avg_hrv)+' ms' : '—', 'moy. 7j')}
      </div>` : ''}

      <!-- Soldes réels des comptes -->
      <div class="section-title">Solde réel des comptes</div>
      <div class="balance-cards">
        ${balance.accounts.map(acc => `
          <div class="balance-card">
            <div class="balance-card-top">
              <span class="balance-icon">${acc.icon || '🏦'}</span>
              <span class="balance-name">${acc.name}</span>
            </div>
            <div class="balance-amount ${parseInt(acc.balance_cents) >= 0 ? 'green' : 'red'}">
              ${parseInt(acc.balance_cents) >= 0 ? '+' : ''}${fmt(acc.balance_cents)} €
            </div>
          </div>
        `).join('')}
        <div class="balance-card total">
          <div class="balance-card-top">
            <span class="balance-icon">💰</span>
            <span class="balance-name">Total</span>
          </div>
          <div class="balance-amount ${balance.total_cents >= 0 ? 'green' : 'red'}">
            ${balance.total_cents >= 0 ? '+' : ''}${fmt(balance.total_cents)} €
          </div>
        </div>
      </div>

      <!-- Mois en cours + Prévision -->
      <div class="grid-2" style="margin: 16px 0">
        <div class="card">
          <div class="card-title">Ce mois — réalisé</div>
          <div class="month-stats">
            <div class="month-stat">
              <span class="month-label">Revenus encaissés</span>
              <span class="amount-income">+${fmt(forecast.done.income)} €</span>
            </div>
            <div class="month-stat">
              <span class="month-label">Dépenses réelles</span>
              <span class="amount-expense">-${fmt(forecast.done.expense)} €</span>
            </div>
            <div class="month-stat border-top">
              <span class="month-label">Solde actuel</span>
              <span class="${(forecast.done.income - forecast.done.expense) >= 0 ? 'amount-income' : 'amount-expense'}">
                ${(forecast.done.income - forecast.done.expense) >= 0 ? '+' : ''}${fmt(forecast.done.income - forecast.done.expense)} €
              </span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Prévision fin de mois</div>
          <div class="month-stats">
            <div class="month-stat">
              <span class="month-label">Revenus prévus</span>
              <span class="amount-income">+${fmt(fc.income)} €</span>
            </div>
            <div class="month-stat">
              <span class="month-label">Dépenses prévues</span>
              <span class="amount-expense">-${fmt(fc.expense)} €</span>
            </div>
            <div class="month-stat border-top">
              <span class="month-label">Solde prévu</span>
              <span class="${fcBalance >= 0 ? 'amount-income' : 'amount-expense'}" style="font-size:18px;font-weight:700">
                ${fcBalance >= 0 ? '+' : ''}${fmt(fcBalance)} €
              </span>
            </div>
          </div>
          ${plannedItems.length ? `
            <div class="planned-list">
              <div class="planned-title">À venir ce mois</div>
              ${plannedItems.map(p => `
                <div class="planned-row">
                  <span class="planned-date">${new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                  <span class="planned-desc">${p.description}</span>
                  <span class="planned-amount ${p.kind === 'income' ? 'amount-income' : 'amount-expense'}">
                    ${p.kind === 'income' ? '+' : '-'}${fmt(p.amount_cents)} €
                  </span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Top dépenses ce mois</div>
          <div class="bar-chart">
            ${topExpenses.map(c => `
              <div class="bar-row" data-tooltip="${c.nb} transaction${c.nb > 1 ? 's' : ''}">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxExpense*100).toFixed(1)}%;background:${VIZ.expense}"></div></div>
                <div class="bar-value">${fmt(c.total)} €</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Évolution mensuelle — 6 mois</div>
          <div class="chart-wrap" style="height:200px">
            <canvas id="dashMonthlyChart"></canvas>
          </div>
        </div>
      </div>
    `

    // Graphiques (après injection HTML)
    const month6 = [...monthly].slice(0, 6).reverse()
    createMonthlyChart('dashMonthlyChart', month6)

    if (bb7.length)    createSparkline('spark-bb',    bb7,    VIZ.battery)
    if (steps7.length) createSparkline('spark-steps', steps7, VIZ.steps)
    if (sleep7.length) createSparkline('spark-sleep', sleep7, VIZ.sleep)

  } catch (err) {
    el.innerHTML = `<div class="card" style="color:var(--accent-red)">Erreur : ${err.message}</div>`
  }
}

function actIcon(type) {
  const m = { hiking:'🥾', running:'🏃', cycling:'🚴', strength_training:'🏋️', swimming:'🏊', resort_skiing:'⛷️', walking:'🚶', trail_running:'🏔️', indoor_cycling:'🚴' }
  return m[type] || '🏅'
}

function dashHealthCard(icon, label, value, sub, sparkId) {
  return `
    <div class="dash-health-card${sparkId ? ' dhc-spark' : ''}">
      <span class="dhc-icon">${icon}</span>
      <div class="dhc-value">${value}</div>
      <div class="dhc-label">${label}</div>
      <div class="dhc-sub">${sub}</div>
      ${sparkId ? `<canvas id="${sparkId}" class="dhc-sparkline" width="80" height="24"></canvas>` : ''}
    </div>`
}

function bbColor(v) {
  const c = v >= 70 ? '#00d4ff' : v >= 40 ? '#f59e0b' : '#ef4444'
  return `<span style="color:${c};font-weight:700">${v}/100</span>`
}
function bbStatus(v) {
  return v >= 70 ? 'Bonne récupération' : v >= 40 ? 'Récupération partielle' : 'Repos nécessaire'
}
function fmtDur(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60)
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`
}
