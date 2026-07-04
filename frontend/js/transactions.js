let txPage = 0
const TX_LIMIT = 30

async function renderTransactions(reset = true) {
  const el = document.getElementById('page-transactions')
  if (reset) txPage = 0

  const account = document.getElementById('f-account')?.value || ''
  const cat     = document.getElementById('f-cat')?.value     || ''
  const from    = document.getElementById('f-from')?.value    || ''
  const to      = document.getElementById('f-to')?.value      || ''

  if (reset) {
    el.innerHTML = `
      <div class="page-header">
        <h1>📋 Transactions</h1>
        <p>Historique complet</p>
      </div>
      <div class="card">
        <div class="filters">
          <input  id="f-from"    type="date" class="filter-input" placeholder="De">
          <input  id="f-to"      type="date" class="filter-input" placeholder="À">
          <input  id="f-cat"     type="text" class="filter-input" placeholder="Catégorie" style="width:130px">
          <select id="f-account" class="filter-select">
            <option value="">Tous les comptes</option>
            <option value="cc">Compte courant</option>
            <option value="livret">Livret A</option>
            <option value="credit">Crédit liberté</option>
          </select>
          <button onclick="renderTransactions(true)" style="background:var(--accent);color:var(--bg-primary);padding:8px 16px;border-radius:8px;font-weight:600">Filtrer</button>
        </div>
        <div id="tx-table"><div class="loading">Chargement</div></div>
        <div id="tx-pagination" class="pagination"></div>
      </div>
    `
  }

  try {
    const data = await api.finances.transactions({
      account, cat, from, to,
      limit: TX_LIMIT,
      offset: txPage * TX_LIMIT
    })

    const total = data.total
    const pages = Math.ceil(total / TX_LIMIT)

    document.getElementById('tx-table').innerHTML = `
      <div style="margin-bottom:8px;color:var(--text-muted);font-size:12px">${total} transaction(s)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th>Compte</th><th>Montant</th></tr></thead>
          <tbody>
            ${data.transactions.map(tx => `
              <tr>
                <td style="color:var(--text-muted)">${tx.date}</td>
                <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tx.description}</td>
                <td><span class="badge badge-${tx.kind}">${tx.cat}</span></td>
                <td style="color:var(--text-muted)">${tx.account_id}</td>
                <td class="${['income','transfer_in'].includes(tx.kind)?'amount-income':'amount-expense'}">
                  ${['income','transfer_in'].includes(tx.kind)?'+':'-'}${(tx.amount_cents/100).toLocaleString('fr-FR',{minimumFractionDigits:2})} €
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `

    const pag = document.getElementById('tx-pagination')
    pag.innerHTML = ''
    const start = Math.max(0, txPage - 2)
    const end   = Math.min(pages - 1, txPage + 2)
    if (txPage > 0) {
      const b = document.createElement('button')
      b.className = 'page-btn'
      b.textContent = '‹'
      b.onclick = () => { txPage--; renderTransactions(false) }
      pag.appendChild(b)
    }
    for (let p = start; p <= end; p++) {
      const b = document.createElement('button')
      b.className = 'page-btn' + (p === txPage ? ' active' : '')
      b.textContent = p + 1
      b.onclick = () => { txPage = p; renderTransactions(false) }
      pag.appendChild(b)
    }
    if (txPage < pages - 1) {
      const b = document.createElement('button')
      b.className = 'page-btn'
      b.textContent = '›'
      b.onclick = () => { txPage++; renderTransactions(false) }
      pag.appendChild(b)
    }
  } catch (err) {
    document.getElementById('tx-table').innerHTML =
      `<p style="color:var(--accent-red)">${err.message}</p>`
  }
}
