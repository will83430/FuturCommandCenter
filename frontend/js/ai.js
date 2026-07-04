function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function renderAI() {
  const el = document.getElementById('page-ai')
  el.innerHTML = `
    <div class="page-header">
      <h1>🤖 Assistant IA</h1>
      <p>Alimenté par Llama 3.1 (local) — connaît tes finances et ton sport en temps réel</p>
    </div>
    <div class="card chat-wrap">
      <div class="chat-messages" id="chatMessages">
        <div class="msg assistant">
          <div class="msg-avatar">⚡</div>
          <div class="msg-bubble">Bonjour ! Je suis ton assistant FuturCommandCenter. Je connais tes finances, ton sport et ta santé en temps réel. Tu peux me demander d'analyser tes dépenses, ta récupération, ton sommeil, ou tout ce qui concerne ton dashboard.</div>
        </div>
      </div>
      <div class="typing" id="typingIndicator" style="display:none">L'assistant réfléchit...</div>
      <div class="chat-input-wrap">
        <textarea id="chatInput" class="chat-input" rows="2" placeholder="Pose une question sur tes finances..."></textarea>
        <button id="chatSend" class="chat-send" onclick="sendMessage()">Envoyer</button>
        <button class="chat-clear" onclick="clearChat()" title="Vider l'historique">🗑️</button>
      </div>
    </div>
  `

  // Charger historique
  try {
    const history = await api.ai.history()
    const msgs = document.getElementById('chatMessages')
    history.forEach(m => appendMessage(m.role, m.content))
    msgs.scrollTop = msgs.scrollHeight
  } catch {}

  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
}

async function clearChat() {
  if (!confirm('Vider tout l\'historique ?')) return
  await api.ai.clear()
  renderAI()
}

function appendMessage(role, content) {
  const msgs = document.getElementById('chatMessages')
  if (!msgs) return
  const div = document.createElement('div')
  div.className = `msg ${role}`
  div.innerHTML = `
    <div class="msg-avatar">${role === 'user' ? '👤' : '⚡'}</div>
    <div class="msg-bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
  `
  msgs.appendChild(div)
  msgs.scrollTop = msgs.scrollHeight
}

async function sendMessage() {
  const input  = document.getElementById('chatInput')
  const btn    = document.getElementById('chatSend')
  const typing = document.getElementById('typingIndicator')
  const msg    = input.value.trim()
  if (!msg) return

  input.value = ''
  btn.disabled = true
  appendMessage('user', msg)
  typing.style.display = 'block'

  // Bulle de réponse en cours
  const msgs = document.getElementById('chatMessages')
  const bubble = document.createElement('div')
  bubble.className = 'msg assistant'
  const avatarDiv = document.createElement('div')
  avatarDiv.className = 'msg-avatar'
  avatarDiv.textContent = '⚡'
  const bubbleDiv = document.createElement('div')
  bubbleDiv.className = 'msg-bubble'
  const actionsEl = document.createElement('div')
  const textEl = document.createElement('span')
  bubbleDiv.appendChild(actionsEl)
  bubbleDiv.appendChild(textEl)
  bubble.appendChild(avatarDiv)
  bubble.appendChild(bubbleDiv)
  msgs.appendChild(bubble)

  let accumulated = ''
  const ACTION_LABELS = { lights_on: '💡 Allumage', lights_off: '💡 Extinction', lights_color: '🎨 Couleur' }
  const actionTags = {}

  try {
    await waitApiToken()
    const token = getApiToken()
    const response = await fetch('http://localhost:3737/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-App-Token': token } : {}) },
      body: JSON.stringify({ message: msg })
    })

    if (!response.ok) throw new Error(await response.text())

    typing.style.display = 'none'
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const json = JSON.parse(line.slice(6))
          if (json.token) {
            accumulated += json.token
            textEl.innerHTML = escapeHtml(accumulated).replace(/\n/g, '<br>')
            msgs.scrollTop = msgs.scrollHeight
          }
          if (json.action) {
            const room = json.args?.room ? ` · ${json.args.room}` : ''
            const tag = document.createElement('div')
            tag.className = 'action-tag loading'
            tag.textContent = `⚙️ ${ACTION_LABELS[json.action] || json.action}${room}…`
            actionsEl.appendChild(tag)
            if (!actionTags[json.action]) actionTags[json.action] = []
            actionTags[json.action].push(tag)
            msgs.scrollTop = msgs.scrollHeight
          }
          if (json.action_done) {
            const tag = actionTags[json.action_done]?.shift()
            if (tag) {
              tag.className = `action-tag ${json.ok ? 'done' : 'error'}`
              tag.textContent = tag.textContent.replace('⚙️', json.ok ? '✅' : '❌').replace('…', '')
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    typing.style.display = 'none'
    textEl.textContent = `❌ Erreur : ${err.message}`
    accumulated = textEl.textContent
  } finally {
    btn.disabled = false
    input.focus()
    if (!accumulated.trim() && !actionsEl.children.length) bubble.remove()
  }
}
