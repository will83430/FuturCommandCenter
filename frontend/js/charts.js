// Palette validée dataviz (dark surface #131929)
// WARN CVD ΔE 9.7 ≥ 8 floor → labels directs obligatoires (direct labels présents)
// WARN contraste aqua light → dark only ici, tous ≥ 3:1 sur #131929
const VIZ = {
  income:      '#199e70',  // aqua  slot 2 dark
  expense:     '#e66767',  // rouge slot 6 dark
  balance:     '#3987e5',  // bleu  slot 1 dark
  battery:     '#3987e5',
  steps:       '#199e70',
  sleep:       '#9085e9',  // violet slot 5 dark
  stress:      '#e66767',
  surface:     '#131929',
  grid:        '#1e2d4a',
  text:        '#64748b',
  textPrimary: '#e2e8f0',
  tooltipBg:   '#0f1628',
}

function _fmtMonthLabel(m) {
  const [y, mo] = m.split('-')
  const names = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
  return names[parseInt(mo) - 1] + ' ' + y.slice(2)
}

function _destroyChart(canvas) {
  if (canvas._chartInst) { canvas._chartInst.destroy(); canvas._chartInst = null }
}

// Graphique barres groupées revenus/dépenses + ligne solde net
// rows : [{month, income, expense}] en ordre chronologique
function createMonthlyChart(canvasId, rows) {
  const canvas = document.getElementById(canvasId)
  if (!canvas || !rows.length) return
  _destroyChart(canvas)

  const labels   = rows.map(r => _fmtMonthLabel(r.month))
  const incomes  = rows.map(r => Math.round(r.income / 100))
  const expenses = rows.map(r => Math.round(r.expense / 100))
  const balances = rows.map(r => Math.round((r.income - r.expense) / 100))

  canvas._chartInst = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Revenus',
          data: incomes,
          backgroundColor: VIZ.income + 'cc',
          hoverBackgroundColor: VIZ.income,
          borderRadius: 4,
          borderSkipped: 'bottom',
          barPercentage: 0.42,
          categoryPercentage: 0.88,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Dépenses',
          data: expenses,
          backgroundColor: VIZ.expense + 'cc',
          hoverBackgroundColor: VIZ.expense,
          borderRadius: 4,
          borderSkipped: 'bottom',
          barPercentage: 0.42,
          categoryPercentage: 0.88,
          order: 2,
        },
        {
          type: 'line',
          label: 'Solde net',
          data: balances,
          borderColor: VIZ.balance,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: VIZ.balance,
          pointBorderColor: VIZ.surface,
          pointBorderWidth: 2,
          tension: 0.3,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: VIZ.text,
            font: { size: 11 },
            boxWidth: 12,
            boxHeight: 12,
            padding: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: VIZ.tooltipBg,
          borderColor: VIZ.grid,
          borderWidth: 1,
          titleColor: VIZ.textPrimary,
          bodyColor: VIZ.text,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y
              let sign = ''
              if (ctx.dataset.label === 'Revenus')  sign = '+'
              if (ctx.dataset.label === 'Dépenses') sign = '-'
              if (ctx.dataset.label === 'Solde net') sign = v >= 0 ? '+' : ''
              return ` ${ctx.dataset.label} : ${sign}${Math.abs(v).toLocaleString('fr-FR')} €`
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: VIZ.text, font: { size: 11 }, maxRotation: 0 },
          grid:  { color: VIZ.grid, lineWidth: 1 },
          border: { color: VIZ.grid },
        },
        y: {
          ticks: {
            color: VIZ.text,
            font: { size: 11 },
            callback: (v) => v.toLocaleString('fr-FR') + ' €',
          },
          grid:  { color: VIZ.grid, lineWidth: 1 },
          border: { color: VIZ.grid },
        },
      },
    },
  })
}

// Sparkline : mini graphique de tendance inline dans une stat tile
// values : number[], color : hex
function createSparkline(canvasId, values, color) {
  const canvas = document.getElementById(canvasId)
  if (!canvas || !values?.length) return
  _destroyChart(canvas)

  canvas._chartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{
        data: values,
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  })
}
