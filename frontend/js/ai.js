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

function appendMessage(role, content) {
  const msgs = document.getElementById('chatMessages')
  if (!msgs) return
  const div = document.createElement('div')
  div.className = `msg ${role}`
  div.innerHTML = `
    <div class="msg-avatar">${role === 'user' ? '👤' : '⚡'}</div>
    <div class="msg-bubble">${content.replace(/\n/g, '<br>')}</div>
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
  bubble.innerHTML = `<div class="msg-avatar">⚡</div><div class="msg-bubble" id="streamBubble"></div>`
  msgs.appendChild(bubble)
  const streamEl = document.getElementById('streamBubble')

  try {
    const response = await fetch('http://localhost:3737/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
            streamEl.innerHTML = (streamEl.textContent + json.token).replace(/\n/g, '<br>')
            msgs.scrollTop = msgs.scrollHeight
          }
        } catch {}
      }
    }
  } catch (err) {
    typing.style.display = 'none'
    streamEl.textContent = `❌ Erreur : ${err.message}`
  } finally {
    btn.disabled = false
    input.focus()
    bubble.removeAttribute('id')
  }
}
