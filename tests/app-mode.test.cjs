const test = require('node:test'), assert = require('node:assert/strict')
const loader = require('./download-loader.cjs')

test('Clips mode masks extra overlays and download presence without changing saved preferences', () => {
  const { normalizeAppMode, clipsModeSettings } = loader()('src/services/appMode.ts')
  for (const value of [undefined, null, '', 'unknown', {}]) assert.equal(normalizeAppMode(value), 'launcher')
  assert.equal(normalizeAppMode('clips'), 'clips')
  const saved = { overlayPerformance: true, overlayRLHud: true, overlayMedia: true, overlayClipNotification: true, discordRpc: true, discordRpcRobloxSubGame: true }
  const effective = clipsModeSettings(saved)
  for (const key of ['overlayPerformance', 'overlayRLHud', 'overlayMedia', 'showDownloads']) assert.equal(effective[key], false)
  assert.equal(effective.overlayClipNotification, true); assert.equal(effective.discordRpc, true); assert.equal(effective.discordRpcRobloxSubGame, true)
  assert.equal(saved.overlayPerformance, true)
})

test('settings-only persistence leaves the complete game library on disk while keeping it out of hydrated state', () => {
  const { createReferenceStorage } = loader()('src/store/referenceStorage.ts')
  const original = { version: 0, state: { installedGames: [{ name: 'Custom game', executable: 'C:/Games/game.exe' }], library: [{ name: 'Keep me' }], favoriteIds: ['favorite'], lastPlayed: ['recent'], settings: { language: 'en', appMode: 'launcher' } } }
  const values = new Map([['gamehub-store', JSON.stringify(original)]]), disk = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const storage = createReferenceStorage(() => disk, true)
  assert.deepEqual(storage.getItem('gamehub-store').state, { settings: original.state.settings })
  storage.setItem('gamehub-store', { version: 0, state: { settings: { language: 'de', appMode: 'clips' } } })
  const saved = JSON.parse(values.get('gamehub-store'))
  for (const key of ['installedGames', 'library', 'favoriteIds', 'lastPlayed']) assert.deepEqual(saved.state[key], original.state[key])
  assert.equal(saved.state.settings.language, 'de')
  assert.equal(saved.state.settings.appMode, 'clips')
})

test('mode switching waits for writes and rejects new clip writes until restart', async () => {
  const { runProtectedOperation, beginModeSwitch, cancelModeSwitch } = loader()('electron/operationBarrier.ts')
  let finish
  const writing = runProtectedOperation('clips:save-draft', () => new Promise(resolve => { finish = resolve }))
  assert.equal(beginModeSwitch(), false)
  finish(); await writing
  assert.equal(beginModeSwitch(), true)
  assert.throws(() => runProtectedOperation('clips:export', () => assert.fail('Must not start an export while restarting')), /restarting/)
  assert.equal(runProtectedOperation('clips:get-settings', () => 'read allowed'), 'read allowed')
  cancelModeSwitch()
  await assert.rejects(runProtectedOperation('settings:set', () => Promise.reject(Error('Disk full'))), /Disk full/)
  assert.equal(beginModeSwitch(), true)
  cancelModeSwitch()
})
