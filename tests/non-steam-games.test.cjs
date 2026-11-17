const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

function discoveryFixture(t) {
  const original = process.env.ProgramData
  const root = path.resolve('fixture-program-data')
  process.env.ProgramData = root
  t.after(() => { if (original === undefined) delete process.env.ProgramData; else process.env.ProgramData = original })
  const files = new Map(), directories = new Set(), reads = []
  const manifests = path.join(root, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  directories.add(manifests)
  const mockFs = {
    stat: async file => { if (!files.has(file) && !directories.has(file)) throw new Error('ENOENT'); return { isFile: () => files.has(file), isDirectory: () => directories.has(file) } },
    readdir: async directory => [...files.keys()].filter(file => path.dirname(file) === directory).map(file => path.basename(file)),
    readFile: async file => { reads.push(file); if (!files.has(file)) throw new Error('ENOENT'); return files.get(file) },
  }
  const load = loadTs({ 'node:fs/promises': mockFs, child_process: { execFile: () => assert.fail('No process query needed for known metadata paths') } })
  return { root, manifests, files, reads, load, ...load('electron/nonSteamDiscovery.ts') }
}

test('Epic discovery validates real executable paths and skips incomplete, stale and escaping installs', async t => {
  const f = discoveryFixture(t), install = path.resolve('fixture-games/Fortnite')
  const manifest = { DisplayName: 'Fortnite', AppName: 'Fortnite', CatalogNamespace: 'fn', CatalogItemId: 'catalog-id', InstallLocation: install, LaunchExecutable: 'FortniteGame/Binaries/Win64/FortniteBootstrapper.exe' }
  f.files.set(path.join(install, 'FortniteGame/Binaries/Win64/FortniteBootstrapper.exe'), '')
  f.files.set(path.join(f.manifests, 'good.item'), JSON.stringify(manifest))
  f.files.set(path.join(f.manifests, 'incomplete.item'), JSON.stringify({ ...manifest, bIsIncompleteInstall: true }))
  f.files.set(path.join(f.manifests, 'stale.item'), JSON.stringify({ ...manifest, LaunchExecutable: 'missing.exe' }))
  f.files.set(path.join(f.manifests, 'escape.item'), JSON.stringify({ ...manifest, LaunchExecutable: '../outside.exe' }))
  f.files.set(path.join(f.manifests, 'bad.item'), '{')
  const games = await f.discoverEpicGames()
  assert.equal(games.length, 1)
  assert.equal(games[0].name, 'Fortnite')
  assert.equal(games[0].installed, true)
  assert.equal(games[0].launchUrl, 'com.epicgames.launcher://apps/fn%3Acatalog-id%3AFortnite?action=launch&silent=true')
  assert.equal(games[0].steamId, undefined)
  assert.match(games[0].iconUrl, /^https:\/\/cdn2\.unrealengine\.com\//)
  assert.equal(f.insideInstallation(install, '../outside.exe'), undefined)
})

test('Riot discovery reads product metadata on custom drives and rejects stale products', async t => {
  const f = discoveryFixture(t), install = path.resolve('fixture-other-drive/Riot Games/VALORANT/live')
  const metadata = path.join(f.root, 'Riot Games', 'Metadata')
  f.files.set(path.join(metadata, 'valorant.live', 'valorant.live.product_settings.yaml'), `product_install_full_path: ${JSON.stringify(install.replaceAll('\\', '/'))}\n`)
  f.files.set(path.join(metadata, 'league_of_legends.live', 'league_of_legends.live.product_settings.yaml'), `product_install_full_path: ${JSON.stringify(path.resolve('removed-league'))}`)
  f.files.set(path.join(install, 'VALORANT.exe'), '')
  const games = await f.discoverRiotGames()
  assert.equal(games.length, 1)
  assert.equal(games[0].name, 'VALORANT')
  assert.equal(games[0].launchUrl, 'eclipse-game://riot/valorant')
  assert.equal(f.reads.some(file => /lockfile|auth|token|cookie/i.test(path.basename(file))), false)
  assert.equal(f.readRiotInstallPath('product_install_full_path: "../relative"'), undefined)
  assert.deepEqual(await f.discoverRiotGames(() => false), [])
})

test('Riot launches through the installed client with a fixed product and no arbitrary arguments', async () => {
  const calls = []
  const service = loadTs({
    './nonSteamDiscovery': { riotClientExecutable: async () => path.resolve('fixture/RiotClientServices.exe') },
    child_process: { spawn: (...args) => { calls.push(args); const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child } },
  })('electron/gameLaunchService.ts')
  await service.launchRiotGame('eclipse-game://riot/valorant')
  assert.deepEqual(calls[0][1], ['--launch-product=valorant', '--launch-patchline=live'])
  assert.equal(calls[0][2].windowsHide, true)
  assert.notEqual(calls[0][2].shell, true)
  for (const invalid of ['eclipse-game://riot/valorant?args=evil', 'eclipse-game://riot/unknown', 'https://riot/valorant']) await assert.rejects(service.launchRiotGame(invalid))
  assert.equal(calls.length, 1)
})

test('publisher identities remove false Steam IDs while preserving local library history', () => {
  const module = loadTs()('src/services/nonSteamGames.ts')
  const repaired = module.repairNonSteamIdentity({ name: 'Fortnite', steamId: 123, iconUrl: 'broken', playTimeMinutes: 12, launchUrl: 'epic' })
  assert.equal(repaired.steamId, undefined)
  assert.equal(repaired.playTimeMinutes, 12)
  assert.equal(repaired.launchUrl, 'epic')
  assert.match(repaired.iconUrl, /^https:/)
  assert.equal(module.nonSteamProcess('Binaries\\Win64\\VALORANT-Win64-Shipping.exe').bootstrap, false)
  assert.equal(module.nonSteamProcess('UnrealEditorFortnite-Win64-Shipping.exe'), undefined)
  assert.equal(module.getNonSteamGame('Fortnite Fan Game'), undefined)
})

test('native session reconciliation restores an already running game without allowing stale snapshots to overwrite events', async () => {
  const { watchNativeGameSession } = loadTs()('src/services/nativeGameSession.ts')
  const starts = [], stops = []
  let resolve, started, stopped, unsubscribed = 0
  const api = {
    getCurrentGame: () => new Promise(done => { resolve = done }),
    onGameStarted: callback => { started = callback; return () => unsubscribed++ },
    onGameStopped: callback => { stopped = callback; return () => unsubscribed++ },
  }
  const watcher = watchNativeGameSession(api, game => starts.push(game), only => stops.push(only))
  const initial = watcher.refresh()
  started({ name: 'Fortnite', startTime: 1000 })
  resolve(null)
  await initial
  assert.deepEqual(starts, [{ name: 'Fortnite', startTime: 1000 }])
  assert.deepEqual(stops, [])
  const focused = watcher.refresh()
  resolve({ name: 'Fortnite', startTime: 1000 })
  await focused
  assert.equal(starts[1].startTime, 1000)
  const late = watcher.refresh()
  stopped()
  resolve({ name: 'Fortnite', startTime: 1000 })
  await late
  assert.equal(starts.length, 2)
  assert.deepEqual(stops, [false])
  watcher.dispose()
  assert.equal(unsubscribed, 2)
})

test('native session reconciliation ignores responses received after disposal', async () => {
  const { watchNativeGameSession } = loadTs()('src/services/nativeGameSession.ts')
  let resolve
  const watcher = watchNativeGameSession({ getCurrentGame: () => new Promise(done => { resolve = done }) }, () => assert.fail('Disposed session updated'), () => assert.fail('Disposed session stopped'))
  const pending = watcher.refresh()
  watcher.dispose()
  resolve({ name: 'VALORANT', startTime: 1000 })
  await pending
})
