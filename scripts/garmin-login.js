require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const { GarminConnect } = require('garmin-connect')
const fs   = require('fs')
const path = require('path')

const TOKEN_DIR = path.join(__dirname, '../.garmin-session')

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function tryLogin(attempt, waitMs) {
  const email    = process.env.GARMIN_EMAIL
  const password = process.env.GARMIN_PASSWORD
  if (!email || !password) { console.error('GARMIN_EMAIL / GARMIN_PASSWORD manquants dans .env'); process.exit(1) }

  if (attempt > 1) {
    const sec = Math.round(waitMs / 1000)
    console.log(`Tentative ${attempt} — attente ${sec}s...`)
    for (let i = sec; i > 0; i--) {
      process.stdout.write(`\r  ⏳ ${i}s restantes...   `)
      await sleep(1000)
    }
    process.stdout.write('\r                            \r')
  }

  console.log(`Tentative ${attempt} — connexion à Garmin...`)
  const client = new GarminConnect({ username: email, password })
  await client.login()
  return client
}

async function main() {
  let waitMs  = 60 * 1000   // 1 min pour la première retry
  let attempt = 1

  while (attempt <= 6) {
    try {
      const client  = await tryLogin(attempt, waitMs)
      const profile = await client.getUserProfile()
      console.log(`✓ Connecté : ${profile.displayName}`)
      fs.mkdirSync(TOKEN_DIR, { recursive: true })
      client.exportTokenToFile(TOKEN_DIR)
      console.log(`✓ Token sauvegardé dans ${TOKEN_DIR}`)
      console.log('  Lance maintenant FuturCommandCenter — plus de rate limit !')
      process.exit(0)
    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('rate')) {
        let retryAfter = waitMs
        try {
          const parsed = JSON.parse(err.message.replace(/^ERROR: \(\d+\), [^,]+, /, ''))
          if (parsed.retry_after) retryAfter = Math.max(waitMs, (parsed.retry_after + 5) * 1000)
        } catch {}
        console.log(`✗ Rate limit (tentative ${attempt}/6) — prochaine dans ${Math.round(retryAfter/1000)}s`)
        waitMs  = retryAfter * 2   // backoff exponentiel
        attempt++
      } else {
        console.error('Erreur inattendue :', err.message)
        process.exit(1)
      }
    }
  }

  console.error('Échec après 6 tentatives. Garmin bloque encore. Réessaie dans 30 min.')
  process.exit(1)
}

main()
