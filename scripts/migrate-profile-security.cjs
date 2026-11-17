// Run with Application Default Credentials. The default mode never writes data.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const publicFields = new Set(['schemaVersion','uid','username','friendCode','avatarUrl','avatarFrame','steamAvatarFrameUrl','steamAvatarFrameStaticUrl','bannerUrl','bannerPosition','bio','profileAccentColor','socialDiscord','socialTwitch','socialYoutube','showHardwareSpecs','hardwareSpecs','status','currentGame','level','steamLevel','steamProfileUrl','steamGamesCount','steamBadgesCount','steamFavoriteBadge','steamRecentGames','steamBadges','steamGames','steamBackgroundUrl','steamBackgroundMovie','showSteamBackground','showPlaytime','showSteamStats','totalPlaytimeMins','totalPlaytimeHours','totalLibraryCount','totalInstalledCount','topPlayedGames','pinnedGames','lastSeen','friends','createdAt','updatedAt'])

function planProfileMigration(data, uid) {
  const removed = Object.keys(data).filter(key => !publicFields.has(key))
  const fields = { schemaVersion: 2, uid, friends: Array.isArray(data.friends) ? [...new Set(data.friends.filter(value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/')))] : [] }
  if (data.showHardwareSpecs !== true) fields.hardwareSpecs = null
  if (data.showSteamStats === false) {
    Object.assign(fields, { level: null, steamLevel: null, steamGamesCount: null, steamBadgesCount: null, steamFavoriteBadge: null, steamBadges: [], steamGames: [], steamRecentGames: [] })
  }
  if (data.showPlaytime === false) {
    Object.assign(fields, { totalPlaytimeMins: null, totalPlaytimeHours: null, topPlayedGames: [],
      pinnedGames: (Array.isArray(data.pinnedGames) ? data.pinnedGames : []).map(game => ({ ...game, playTimeMinutes: 0, lastPlayed: 0 })) })
    if (data.showSteamStats !== false) {
      for (const key of ['steamGames', 'steamRecentGames']) fields[key] = (Array.isArray(data[key]) ? data[key] : []).map(game => ({ ...game, playtime: '' }))
    }
  }
  return { removed, fields }
}

async function migrate() {
  const args = process.argv.slice(2)
  if (args.some(arg => !['--apply','--project','--firebase-cli'].includes(arg) && arg !== args[args.indexOf('--project') + 1])) throw Error('Usage: node scripts/migrate-profile-security.cjs --project <project-id> [--firebase-cli] [--apply]')
  const project = args[args.indexOf('--project') + 1]
  if (!args.includes('--project') || !project || project.startsWith('--')) throw Error('An explicit --project is required.')
  const apply = args.includes('--apply')
  if (args.includes('--firebase-cli')) {
    const result = await require('./profile-migration-rest.cjs').migrateWithFirebaseCli(project, apply)
    console.log(JSON.stringify(result, null, 2))
    if (result.conflicts) process.exitCode = 2
    return
  }
  const localPackage = path.resolve('.cache/firebase-security/package.json')
  const adminRequire = fs.existsSync(localPackage) ? createRequire(localPackage) : require
  const { initializeApp, applicationDefault, deleteApp } = adminRequire('firebase-admin/app')
  const { getFirestore, FieldValue, FieldPath } = adminRequire('firebase-admin/firestore')
  const app = initializeApp({ projectId: project, credential: applicationDefault() })
  const db = getFirestore(app)
  const totals = { mode: apply ? 'APPLY' : 'DRY RUN', project, profiles: 0, privateFields: 0, deviceDocuments: 0, conflicts: 0 }
  try {
    for (const collection of ['users', 'device_identities']) {
      let cursor
      while (true) {
        let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(200)
        if (cursor) query = query.startAfter(cursor)
        const page = await query.get()
        if (page.empty) break
        for (const snapshot of page.docs) {
          if (collection === 'device_identities') {
            totals.deviceDocuments++
            if (apply) {
              try { await snapshot.ref.delete({ lastUpdateTime: snapshot.updateTime }) }
              catch (error) { if (error.code === 9) totals.conflicts++; else throw error }
            }
          } else {
            const plan = planProfileMigration(snapshot.data(), snapshot.id)
            totals.profiles++; totals.privateFields += plan.removed.length
            if (apply) {
              const values = [...Object.entries(plan.fields), ...plan.removed.map(key => [key, FieldValue.delete()])].flatMap(([key,value]) => [new FieldPath(key), value])
              try { await snapshot.ref.update(...values, { lastUpdateTime: snapshot.updateTime }) }
              catch (error) { if (error.code === 9) totals.conflicts++; else throw error }
            }
          }
        }
        cursor = page.docs.at(-1)
      }
    }
    // Do not print profile contents, keys, hardware anchors, or credentials.
    console.log(JSON.stringify(totals, null, 2))
    if (totals.conflicts) { console.error('Concurrent changes were skipped. Rerun before completing the rollout.'); process.exitCode = 2 }
  } finally { await deleteApp(app) }
}

module.exports = { planProfileMigration, publicProfileFields: Object.freeze([...publicFields]) }
if (require.main === module) migrate().catch(error => { console.error('Migration failed:', error.code || error.name); process.exitCode = 1 })
