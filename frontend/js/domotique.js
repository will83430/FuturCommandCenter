let domoRefreshTimer = null

async function renderDomotique() {
  const page = document.getElementById('page-domotique')
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">🏠 Domotique</h1>
      <div class="health-actions">
        <span id="domoOnline" class="status-badge"></span>
        <button class="btn-sync" onclick="refreshDomo()"><span class="sync-icon">↻</span> Actualiser</button>
      </div>
    </div>

    <div class="domo-grid">

      <!-- Présence -->
      <div class="health-panel domo-panel">
        <h2 class="panel-title">Présence</h2>
        <div id="domoPresence" class="domo-presence-wrap"><div class="loading-text">Chargement…</div></div>
      </div>

      <!-- Lumières -->
      <div class="health-panel domo-panel">
        <h2 class="panel-title">Lumières</h2>
        <div class="domo-lights-actions">
          <button class="domo-btn domo-btn-on"  onclick="domoLights('on')">💡 Tout allumer</button>
          <button class="domo-btn domo-btn-off" onclick="domoLights('off')">🌑 Tout éteindre</button>
        </div>
        <div id="domoBulbs" class="domo-bulbs"><div class="loading-text">Chargement…</div></div>
      </div>

      <!-- Walter (robot) -->
      <div class="health-panel domo-panel">
        <h2 class="panel-title">🤖 Walter</h2>
        <div id="domoRobot" class="domo-robot-wrap"><div class="loading-text">Chargement…</div></div>
      </div>

      <!-- Automations -->
      <div class="health-panel domo-panel domo-panel-wide">
        <h2 class="panel-title">Automations</h2>
        <div id="domoAutomations" class="domo-auto-list"><div class="loading-text">Chargement…</div></div>
      </div>

    </div>
  `

  loadDomoStatus()
  loadDomoAutomations()

  if (domoRefreshTimer) clearInterval(domoRefreshTimer)
  domoRefreshTimer = setInterval(loadDomoStatus, 30000)
}

async function loadDomoStatus() {
  try {
    const data = await api.domotique.status()
    renderPresence(data.presence)
    renderBulbs(data.bulbs)
    renderRobot(data.robot)
    document.getElementById('domoOnline').className = 'status-badge ok'
    document.getElementById('domoOnline').textContent = 'Connecté'
  } catch {
    document.getElementById('domoOnline').className = 'status-badge warn'
    document.getElementById('domoOnline').textContent = 'home-control hors ligne'
  }
}

function renderPresence(data) {
  const el = document.getElementById('domoPresence')
  if (!data) { el.innerHTML = '<div class="no-data">Indisponible</div>'; return }
  const icon = data.anyone_home ? '🟢' : '🔴'
  const label = data.anyone_home ? 'Quelqu\'un est à la maison' : 'Personne à la maison'
  el.innerHTML = `
    <div class="domo-presence-status">${icon} <span>${label}</span></div>
    <div class="domo-devices">
      ${(data.devices || []).map(d => `
        <div class="domo-device ${d.online ? 'online' : 'offline'}">
          <span class="domo-device-dot"></span>
          <span>${d.name}</span>
          <span class="domo-device-ip">${d.ip}</span>
        </div>
      `).join('')}
    </div>
  `
}

const PRESETS = [
  { key: 'warm',   label: '☀️ Chaud',   title: 'Blanc chaud 2700K', color: '#ffd27f' },
  { key: 'cool',   label: '❄️ Froid',   title: 'Blanc froid 6500K', color: '#e8f4ff' },
  { key: 'night',  label: '🌙 Nuit',    title: 'Veilleuse 2200K',   color: '#ff8c00' },
  { key: 'gaming', label: '🎮 Gaming',  title: 'Bleu vif',          color: '#0000ff' },
  { key: 'violet', label: '💜 Violet',  title: 'Violet',            color: '#5000ff' },
  { key: 'petrol', label: '🌊 Pétrole', title: 'Bleu-vert',         color: '#00b4dc' },
]

function renderBulbs(data) {
  const el = document.getElementById('domoBulbs')
  if (!data) { el.innerHTML = '<div class="no-data">Indisponible</div>'; return }
  el.innerHTML = (data.bulbs || []).map(b => `
    <div class="domo-bulb-card" data-ip="${b.ip}">
      <div class="domo-bulb-header">
        <span class="domo-bulb-icon">${b.state ? '💡' : '🔵'}</span>
        <span class="domo-bulb-name">${b.name}</span>
        <div class="domo-bulb-onoff">
          <button class="domo-mini-btn" onclick="domoLightOne('${b.ip}','on')">ON</button>
          <button class="domo-mini-btn domo-mini-off" onclick="domoLightOne('${b.ip}','off')">OFF</button>
        </div>
      </div>
      <div class="domo-bulb-presets">
        ${PRESETS.map(p => `<button class="domo-preset-btn" title="${p.title}" onclick="domoPreset('${b.ip}','${p.key}','${p.color}')">${p.label}</button>`).join('')}
      </div>
      <div class="domo-bulb-custom">
        <label class="domo-custom-label">Couleur</label>
        <input type="color" class="domo-color-pick" id="color_${b.ip.replace(/\./g,'_')}" value="#ffffff">
        <label class="domo-custom-label">Luminosité</label>
        <input type="range" class="domo-bright-slider" min="10" max="255" value="200"
          id="bright_${b.ip.replace(/\./g,'_')}">
        <button class="domo-mini-btn" onclick="domoLightColor('${b.ip}')">Appliquer</button>
      </div>
    </div>
  `).join('') || '<div class="no-data">Aucune ampoule</div>'
}

function renderRobot(data) {
  const el = document.getElementById('domoRobot')
  if (!data) { el.innerHTML = '<div class="no-data">Indisponible</div>'; return }

  const stateLabel = {
    DOCKED: '🏠 En station', CLEANING: '🧹 Nettoyage', PAUSED: '⏸ En pause',
    RETURNING: '↩️ Retour base', IDLE: '💤 Inactif', ERROR: '❌ Erreur'
  }

  el.innerHTML = `
    <div class="domo-robot-status">
      <div class="domo-robot-state">${stateLabel[data.state] || data.state}</div>
      <div class="domo-robot-battery">
        <div class="domo-battery-bar">
          <div class="domo-battery-fill" style="width:${data.battery}%;background:${data.battery > 30 ? '#00d4ff' : '#ef4444'}"></div>
        </div>
        <span>${data.battery}%</span>
      </div>
    </div>
    <div class="domo-robot-btns">
      <button class="domo-btn domo-btn-on"  onclick="domoRobot('clean/auto')">🧹 Nettoyer</button>
      <button class="domo-btn domo-btn-off" onclick="domoRobot('charge')">🏠 Base</button>
      <button class="domo-btn"              onclick="domoRobot('pause')">⏸ Pause</button>
    </div>
    ${data.lifespan ? `
      <div class="domo-lifespan">
        <span title="Filtre">🔵 Filtre ${data.lifespan.filter}%</span>
        <span title="Brosse principale">🔵 Brosse ${data.lifespan.main_brush}%</span>
        <span title="Brosse latérale">🔵 Lat. ${data.lifespan.side_brush}%</span>
      </div>` : ''}
  `
}

async function loadDomoAutomations() {
  try {
    const data = await api.domotique.automations()
    const el   = document.getElementById('domoAutomations')
    el.innerHTML = (data.automations || []).map(a => `
      <div class="domo-auto-row">
        <div class="domo-auto-info">
          <span class="domo-auto-label">${a.label}</span>
        </div>
        <label class="domo-toggle">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="toggleAutomation('${a.id}', this)">
          <span class="domo-toggle-slider"></span>
        </label>
      </div>
    `).join('')
  } catch {}
}

async function domoLights(action) {
  try {
    await api.domotique.lightsAction(action)
    await loadDomoStatus()
  } catch (e) { alert('Erreur : ' + e.message) }
}

async function domoLightOne(ip, action) {
  const key = ip.replace(/\./g, '_')
  const brightness = parseInt(document.getElementById(`bright_${key}`)?.value || '255')
  try {
    await api.domotique.lightsAction(action, { bulb_ip: ip, brightness })
    const icon = document.querySelector(`#domoBulbs .domo-bulb-card[data-ip="${ip}"] .domo-bulb-icon`)
    if (icon) icon.textContent = action === 'off' ? '🔵' : '💡'
  } catch (e) { alert('Erreur : ' + e.message) }
}

async function domoPreset(ip, action, color) {
  const key = ip.replace(/\./g, '_')
  const picker = document.getElementById(`color_${key}`)
  if (picker) picker.value = color
  await domoLightOne(ip, action)
}

async function domoLightColor(ip) {
  const key = ip.replace(/\./g, '_')
  const hex  = document.getElementById(`color_${key}`)?.value || '#ffffff'
  const brightness = parseInt(document.getElementById(`bright_${key}`)?.value || '200')
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  try {
    await api.domotique.lightsRgb({ bulb_ip: ip, r, g, b, brightness })
  } catch (e) { alert('Erreur : ' + e.message) }
}

async function domoRobot(action) {
  try {
    await api.domotique.robotAction(action)
    setTimeout(loadDomoStatus, 2000)
  } catch (e) { alert('Erreur : ' + e.message) }
}

async function domoWakePC() {
  const btn = document.getElementById('btnWakePC')
  const fb  = document.getElementById('pcFeedback')
  btn.disabled = true
  try {
    await api.domotique.wakePC()
    fb.textContent = '✓ Paquet WoL envoyé !'
    fb.className = 'domo-feedback ok'
  } catch (e) {
    fb.textContent = '✗ Erreur : ' + e.message
    fb.className = 'domo-feedback err'
  }
  setTimeout(() => { btn.disabled = false; fb.textContent = '' }, 3000)
}

async function toggleAutomation(id, checkbox) {
  try {
    await api.domotique.toggleAutomation(id)
  } catch (e) {
    checkbox.checked = !checkbox.checked
    alert('Erreur : ' + e.message)
  }
}

async function refreshDomo() {
  await loadDomoStatus()
  await loadDomoAutomations()
}
