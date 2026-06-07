async function renderDashboard() {
  const el = document.getElementById('page-dashboard')
  el.innerHTML = '<div class="loading">Chargement du dashboard</div>'

  try {
    const [summary, monthly, cats, balance, forecast, healthSummary, todayHealth] = await Promise.all([
      api.finances.summary(),
      api.finances.monthly(),
      api.finances.byCategory(),
      api.finances.balance(),
      api.finances.forecast(),
      api.health.summary().catch(() => null),
      api.health.today().catch(() => null)
    ])

    const topExpenses = cats
      .filter(c => c.kind === 'expense')
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
    const maxExpense = topExpenses[0]?.total || 1

    const fmt = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

    // Prévision
    const fc = forecast.forecast
    const fcBalance = fc.balance
    const plannedItems = forecast.planned.items

    el.innerHTML = `
      <div class="page-header">
        <h1>⚡ Dashboard</h1>
        <p>Vue d'ensemble — ${new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      </div>

      <!-- Santé du jour -->
      ${todayHealth || healthSummary ? `
      <div class="section-title">Santé aujourd'hui</div>
      <div class="dash-health-grid">
        ${dashHealthCard('⚡', 'Body Battery', todayHealth?.body_battery_max != null ? bbColor(todayHealth.body_battery_max) : (healthSummary?.weekStats?.avg_body_battery ? Math.round(healthSummary.weekStats.avg_body_battery)+'/100' : '—'), todayHealth?.body_battery_max != null ? bbStatus(todayHealth.body_battery_max) : 'moy. 7j')}
        ${dashHealthCard('👟', 'Pas', (todayHealth?.steps||0).toLocaleString('fr-FR'), 'aujourd\'hui')}
        ${dashHealthCard('😴', 'Sommeil', todayHealth?.sleep_duration_s ? fmtDur(todayHealth.sleep_duration_s) : (healthSummary?.weekStats?.avg_sleep_s ? fmtDur(healthSummary.weekStats.avg_sleep_s) : '—'), todayHealth?.sleep_duration_s ? 'nuit dernière' : 'moy. 7j')}
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
              <div class="bar-row">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxExpense*100).toFixed(1)}%;background:var(--accent-red)"></div></div>
                <div class="bar-value">${fmt(c.total)} €</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Évolution mensuelle (6 derniers mois)</div>
          <div style="overflow-x:auto">
            <table>
              <thead><tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Solde</th></tr></thead>
              <tbody>
                ${monthly.slice(0,6).map(m => {
                  const inc = m.income/100, exp = m.expense/100, sol = inc - exp
                  return `<tr>
                    <td>${m.month}</td>
                    <td class="amount-income">+${inc.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td>
                    <td class="amount-expense">-${exp.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td>
                    <td class="${sol>=0?'amount-income':'amount-expense'}">${sol>=0?'+':''}${sol.toLocaleString('fr-FR',{minimumFractionDigits:2})} €</td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `
  } catch (err) {
    el.innerHTML = `<div class="card" style="color:var(--accent-red)">Erreur : ${err.message}</div>`
  }
}

function dashHealthCard(icon, label, value, sub) {
  return `
    <div class="dash-health-card">
      <span class="dhc-icon">${icon}</span>
      <div class="dhc-value">${value}</div>
      <div class="dhc-label">${label}</div>
      <div class="dhc-sub">${sub}</div>
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
