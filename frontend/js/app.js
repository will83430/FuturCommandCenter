const pages = {
  dashboard:    renderDashboard,
  finances:     renderFinances,
  transactions: renderTransactions,
  ai:           renderAI,
  health:       renderHealth,
  domotique:    renderDomotique
}

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))

  document.getElementById(`page-${pageId}`)?.classList.add('active')
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active')

  if (pages[pageId]) pages[pageId]()
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page))
})

// Vérification backend
async function checkBackend() {
  try {
    const res = await fetch('http://localhost:3737/api/health')
    if (res.ok) {
      document.querySelector('.status-text').textContent = 'Connecté'
      document.querySelector('.status-dot').style.background = 'var(--accent-green)'
    }
  } catch {
    document.querySelector('.status-text').textContent = 'Déconnecté'
    document.querySelector('.status-dot').style.background = 'var(--accent-red)'
  }
}

// Démarrage
checkBackend()
setInterval(checkBackend, 30000)
navigate('dashboard')
