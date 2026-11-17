const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')
const { nativeGameRegistrations, watchNativeGameRegistry } = loadTs()('src/services/nativeGameRegistry.ts')

test('saved game registration includes custom EXEs and excludes uninstalled games, launch URLs and duplicate metadata', () => {
  const games = nativeGameRegistrations({
    installedGames: [
      { name: 'Custom Game', executable: 'D:\\Games\\Custom\\game.exe', steamId: 123 },
      { name: 'Steam Game', launchUrl: 'steam://rungameid/123' },
      { name: 'Removed', installed: false, executable: 'removed.exe' },
    ],
    library: [
      { name: 'Custom Game', installed: true, launchUrl: 'D:\\Games\\Custom\\game.exe' },
      { name: 'Not installed', installed: false, launchUrl: 'not-installed.exe' },
      { name: 'Protocol', installed: true, launchUrl: 'https://example.com/file.exe' },
    ],
  })
  assert.deepEqual(games, [{ name: 'Custom Game', executable: 'D:\\Games\\Custom\\game.exe', steamId: 123 }])
})

test('native game registration is bounded even for malformed oversized renderer state', () => {
  const installedGames = Array.from({ length: 2200 }, (_, id) => ({ name: `Game ${id}`, executable: `D:\\game${id}.exe` }))
  assert.equal(nativeGameRegistrations({ installedGames, library: [] }).length, 2048)
})

test('native registry sends startup data once and ignores cover/playtime-only updates', async () => {
  let state = { installedGames: [{ name: 'Game', executable: 'game.exe' }], library: [] }, listener
  const calls = []
  const api = { registerInstalledGames: async games => calls.push(games) }
  const stop = watchNativeGameRegistry(api, { getState: () => state, subscribe: callback => { listener = callback; return () => { listener = undefined } } })
  assert.equal(calls.length, 1)
  const previous = state
  state = { ...state, installedGames: [{ ...state.installedGames[0], playTimeMinutes: 45, iconUrl: 'new.png' }] }
  listener(state, previous)
  await new Promise(resolve => setTimeout(resolve, 550))
  assert.equal(calls.length, 1)
  stop()
  assert.equal(listener, undefined)
})

test('disposing registry sync cancels pending work instead of sending stale games after unmount', async () => {
  let listener, state = { installedGames: [], library: [] }
  const calls = []
  const stop = watchNativeGameRegistry({ registerInstalledGames: async games => calls.push(games) }, {
    getState: () => state, subscribe: callback => { listener = callback; return () => {} },
  })
  const previous = state
  state = { installedGames: [{ name: 'New Game', executable: 'new.exe' }], library: [] }
  listener(state, previous)
  stop()
  await new Promise(resolve => setTimeout(resolve, 550))
  assert.equal(calls.length, 1)
})
