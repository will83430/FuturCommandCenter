require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const fs   = require('fs')
const path = require('path')
const pool = require('../backend/database/db')

function findLatestExport() {
  const home = require('os').homedir()
  const dirs = [
    path.join(home, 'FuturCommandCenter', 'exports'),
    path.join(home, 'Téléchargements'),
    path.join(home, 'Downloads'),
    home
  ]
  let latest = null, latestTime = 0
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('moncarnetcompte_') || !f.endsWith('.json')) continue
      const full = path.join(dir, f)
      const t = fs.statSync(full).mtimeMs
      if (t > latestTime) { latestTime = t; latest = full }
    }
  }
  return latest || path.join(home, 'moncarnetcompte_backup.json')
}

const SOURCE = process.argv[2] || findLatestExport()

async function run() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Fichier introuvable : ${SOURCE}`)
    console.error('Usage : node scripts/import-moncompte.js [chemin/vers/backup.json]')
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
  console.log(`Import depuis : ${SOURCE}`)
  console.log(`Transactions : ${data.txs?.length || 0}`)

  // Comptes
  if (data.accounts?.length) {
    for (const acc of data.accounts) {
      await pool.query(`
        INSERT INTO accounts (id, name, icon, type, color, mensualite, plafond)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET name=$2, icon=$3, color=$5
      `, [acc.id, acc.name, acc.icon || '', acc.type || 'checking', acc.color || '#ffffff',
          acc.mensualite || 0, acc.plafond || 0])
    }
    console.log(`✓ ${data.accounts.length} comptes importés`)
  }

  // Transactions par batch
  const txs = data.txs || []
  let imported = 0, skipped = 0
  const BATCH = 200

  for (let i = 0; i < txs.length; i += BATCH) {
    const batch = txs.slice(i, i + BATCH)
    for (const tx of batch) {
      try {
        await pool.query(`
          INSERT INTO transactions (id, account_id, date, amount_cents, kind, cat, description, planned, recurring)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (id) DO UPDATE SET
            planned=$8, amount_cents=$4, cat=$6, description=$7, date=$3, kind=$5
        `, [tx.id, tx.accountId, tx.date, tx.amountCents, tx.kind,
            tx.cat || 'autre', tx.desc || '', tx.planned || false, tx.recurring || false])
        imported++
      } catch {
        skipped++
      }
    }
    process.stdout.write(`\r  Progression : ${Math.min(i + BATCH, txs.length)}/${txs.length}`)
  }
  console.log(`\n✓ ${imported} transactions importées, ${skipped} ignorées`)

  // Purge des transactions supprimées dans MoncomptePc — scoper aux comptes importés + filtrer les ids null
  const backupIds = (data.txs || []).map(t => t.id).filter(id => id != null)
  const backupAccountIds = [...new Set((data.txs || []).map(t => t.accountId).filter(Boolean))]
  if (backupIds.length && backupAccountIds.length) {
    const idPH  = backupIds.map((_, i) => `$${i + 1}`).join(',')
    const accPH = backupAccountIds.map((_, i) => `$${backupIds.length + i + 1}`).join(',')
    const del = await pool.query(
      `DELETE FROM transactions WHERE id NOT IN (${idPH}) AND account_id IN (${accPH})`,
      [...backupIds, ...backupAccountIds]
    )
    if (del.rowCount > 0) console.log(`✓ ${del.rowCount} transactions obsolètes supprimées`)
  }

  // Budget
  if (data.budget && typeof data.budget === 'object') {
    for (const [cat, amount] of Object.entries(data.budget)) {
      await pool.query(`
        INSERT INTO budget (cat, amount_cents) VALUES ($1,$2)
        ON CONFLICT (cat) DO UPDATE SET amount_cents=$2
      `, [cat, amount])
    }
    console.log(`✓ Budget importé`)
  }

  // Anchors (soldes de référence)
  if (data.anchors?.length) {
    for (const a of data.anchors) {
      await pool.query(`
        INSERT INTO anchors (account_id, month, amount_cents, set_at)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (account_id, month) DO UPDATE SET amount_cents=$3, set_at=$4
      `, [a.accountId, a.month, a.amountCents, a.setAt || null])
    }
    console.log(`✓ ${data.anchors.length} anchors importés`)
  }

  // Récurrences
  if (data.recs?.length) {
    await pool.query('DELETE FROM recurrences')
    for (const r of data.recs) {
      await pool.query(`
        INSERT INTO recurrences (id, account_id, label, amount_cents, kind, cat, day_of_month, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET label=$3, amount_cents=$4, active=$8
      `, [r.id, r.accountId, r.desc, r.amountCents, r.kind, r.cat || 'autre', r.dayOfMonth, r.active !== false])
    }
    console.log(`✓ ${data.recs.length} récurrences importées`)
  }

  console.log('\nImport terminé !')
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
