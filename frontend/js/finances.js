let _finMonthlyData = []

async function renderFinances() {
  const el = document.getElementById('page-finances')
  el.innerHTML = '<div class="loading">Chargement finances</div>'

  try {
    const [cats, monthly] = await Promise.all([
      api.finances.byCategory(),
      api.finances.monthly(),
    ])
    _finMonthlyData = monthly

    const expenses = cats.filter(c => c.kind === 'expense').sort((a,b) => b.total - a.total)
    const incomes  = cats.filter(c => c.kind === 'income')
    const maxExp   = expenses[0]?.total || 1
    const totalExp = expenses.reduce((s, c) => s + c.total, 0)
    const maxInc   = incomes[0]?.total || 1
    const totalInc = incomes.reduce((s, c) => s + c.total, 0)

    const fmt = (cents) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
    const pct = (val, total) => total ? Math.round(val / total * 100) : 0

    el.innerHTML = `
      <div class="page-header">
        <h1>💳 Finances</h1>
        <p>Analyse par catégorie — mois en cours</p>
      </div>

      <!-- Graphique évolution mensuelle -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header-row">
          <div class="card-title" style="margin-bottom:0">Évolution mensuelle</div>
          <div class="period-btns" id="finPeriodBtns">
            <button class="period-btn active" data-months="6">6 mois</button>
            <button class="period-btn" data-months="12">12 mois</button>
            <button class="period-btn" data-months="24">24 mois</button>
          </div>
        </div>
        <div class="chart-wrap" style="height:240px;margin-top:12px">
          <canvas id="finMonthlyChart"></canvas>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Dépenses par catégorie</div>
          <div class="bar-chart">
            ${expenses.map(c => `
              <div class="bar-row" data-tooltip="${c.nb} transaction${c.nb > 1 ? 's' : ''} · ${pct(c.total, totalExp)}% du total">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxExp*100).toFixed(1)}%;background:${VIZ.expense}"></div></div>
                <div class="bar-value">${fmt(c.total)} €</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Revenus par catégorie</div>
          <div class="bar-chart">
            ${incomes.length ? incomes.map(c => `
              <div class="bar-row" data-tooltip="${c.nb} transaction${c.nb > 1 ? 's' : ''} · ${pct(c.total, totalInc)}% du total">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxInc*100).toFixed(1)}%;background:${VIZ.income}"></div></div>
                <div class="bar-value">${fmt(c.total)} €</div>
              </div>
            `).join('') : '<p style="color:var(--text-muted);font-size:13px">Aucun revenu ce mois</p>'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title">Détail complet par catégorie</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Catégorie</th><th>Type</th><th>Transactions</th><th>Total</th></tr></thead>
            <tbody>
              ${cats.sort((a,b) => b.total - a.total).map(c => `
                <tr>
                  <td>${c.cat}</td>
                  <td><span class="badge badge-${c.kind}">${c.kind === 'income' ? 'Revenu' : 'Dépense'}</span></td>
                  <td style="color:var(--text-muted)">${c.nb}</td>
                  <td class="${c.kind==='income'?'amount-income':'amount-expense'}">
                    ${c.kind==='income'?'+':'-'}${fmt(c.total)} €
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `

    // Graphique initial 6 mois
    _renderFinChart(6)

    // Sélecteur de période
    document.getElementById('finPeriodBtns').addEventListener('click', (e) => {
      const btn = e.target.closest('.period-btn')
      if (!btn) return
      document.querySelectorAll('#finPeriodBtns .period-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      _renderFinChart(parseInt(btn.dataset.months))
    })

  } catch (err) {
    el.innerHTML = `<div class="card" style="color:var(--accent-red)">Erreur : ${err.message}</div>`
  }
}

function _renderFinChart(months) {
  const rows = [..._finMonthlyData].slice(0, months).reverse()
  createMonthlyChart('finMonthlyChart', rows)
}
