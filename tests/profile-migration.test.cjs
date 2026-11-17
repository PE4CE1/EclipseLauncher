const test = require('node:test'), assert = require('node:assert/strict')
const { planProfileMigration } = require('../scripts/migrate-profile-security.cjs')

test('server migration removes all nonpublic fields and never trusts a stored UID', () => {
  const plan = planProfileMigration({ uid: 'forged', username: 'Player', friends: ['friend'], accountSecret: 'old-key', deviceAnchorId: 'device', activeDeviceAnchorId: 'device', unexpectedSecret: 'private' }, 'real-uid')
  assert.deepEqual(plan.removed.sort(), ['accountSecret','activeDeviceAnchorId','deviceAnchorId','unexpectedSecret'].sort())
  assert.equal(plan.fields.uid, 'real-uid'); assert.equal(plan.fields.schemaVersion, 2)
  assert.doesNotMatch(JSON.stringify(plan.fields), /old-key|private|device/)
})

test('migration clears previously republished hidden stats and playtimes', () => {
  const plan = planProfileMigration({ showSteamStats: false, showPlaytime: false, steamLevel: 99, steamGames: [{ playtime: '20 hrs' }], pinnedGames: [{ name: 'Portal', playTimeMinutes: 900, lastPlayed: 100 }] }, 'uid')
  assert.equal(plan.fields.steamLevel, null); assert.deepEqual(plan.fields.steamGames, [])
  assert.equal(plan.fields.totalPlaytimeMins, null); assert.equal(plan.fields.pinnedGames[0].playTimeMinutes, 0); assert.equal(plan.fields.pinnedGames[0].lastPlayed, 0)
  assert.equal(plan.fields.hardwareSpecs, null)
})
