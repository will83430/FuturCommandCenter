async function renderFinances() {
  const el = document.getElementById('page-finances')
  el.innerHTML = '<div class="loading">Chargement finances</div>'

  try {
    const cats = await api.finances.byCategory()
    const expenses = cats.filter(c => c.kind === 'expense').sort((a,b) => b.total - a.total)
    const incomes  = cats.filter(c => c.kind === 'income')
    const maxExp   = expenses[0]?.total || 1

    el.innerHTML = `
      <div class="page-header">
        <h1>💳 Finances</h1>
        <p>Analyse par catégorie — mois en cours</p>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Dépenses par catégorie</div>
          <div class="bar-chart">
            ${expenses.map(c => `
              <div class="bar-row">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxExp*100).toFixed(1)}%;background:var(--accent-red)"></div></div>
                <div class="bar-value">${(c.total/100).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Revenus par catégorie</div>
          <div class="bar-chart">
            ${incomes.length ? incomes.map(c => `
              <div class="bar-row">
                <div class="bar-label">${c.cat}</div>
                <div class="bar-track"><div class="bar-fill" style="width:100%;background:var(--accent-green)"></div></div>
                <div class="bar-value">${(c.total/100).toLocaleString('fr-FR',{minimumFractionDigits:2})} €</div>
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
                    ${c.kind==='income'?'+':'-'}${(c.total/100).toLocaleString('fr-FR',{minimumFractionDigits:2})} €
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  } catch (err) {
    el.innerHTML = `<div class="card" style="color:var(--accent-red)">Erreur : ${err.message}</div>`
  }
}
