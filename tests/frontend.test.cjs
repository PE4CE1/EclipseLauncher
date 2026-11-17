const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function loadTs(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative)
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = loaded.require.bind(loaded)
  loaded.require = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (/\.(png|jpg|gif)$/.test(name)) return name
    if (name.startsWith('.') && fs.existsSync(path.resolve(path.dirname(filename), `${name}.ts`))) {
      return loadTs(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`)), mocks)
    }
    return nativeRequire(name)
  }
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
  return loaded.exports
}

const steamMock = {
  getHardcodedSteamId: () => undefined,
  isPlaceholderAppName: name => !name || /^appid_/.test(name),
  extractAppIdFromPlaceholder: () => undefined,
  getKnownSteamGameName: () => undefined,
  KNOWN_GAME_PREVIEWS: {},
}

test('game aliases merge transitively without stale duplicate objects', () => {
  const { deduplicateByAliases } = loadTs('src/services/gameDeduplication.ts')
  const result = deduplicateByAliases([
    { aliases: ['steam_1', 'name_old'], minutes: 10 },
    { aliases: ['name_other'], minutes: 20 },
    { aliases: ['steam_1', 'name_new'], minutes: 30 },
    { aliases: ['name_other', 'name_old'], minutes: 40 },
  ], game => game.aliases, (left, right) => ({ ...right, minutes: Math.max(left.minutes, right.minutes) }))
  assert.equal(result.length, 1)
  assert.equal(result[0].minutes, 40)
})

test('game normalization retains distinct international titles', () => {
  const { normalizeGameName } = loadTs('src/services/gameDeduplication.ts')
  assert.equal(normalizeGameName('  Ｐｏｒｔａｌ 2™ '), 'portal2tm')
  assert.notEqual(normalizeGameName('原神'), normalizeGameName('崩壊'))
  assert.equal(normalizeGameName('Éclipse: 2'), 'éclipse2')
})

test('source validation rejects malformed containers and filters unusable downloads', () => {
  const { parseHydraSource } = loadTs('src/services/sourceValidation.ts')
  assert.throws(() => parseHydraSource(null))
  assert.throws(() => parseHydraSource({ name: {}, downloads: [] }))
  const parsed = parseHydraSource({ name: ' Test ', downloads: [null, { title: {} },
    { title: 'Unsafe', uris: ['file:///C:/Windows/system32/cmd.exe', 'javascript:alert(1)'] },
    { title: ' Portal ', uris: ['https://example.com/a.zip', 'https://example.com/a.zip', 42] },
  ] })
  assert.equal(parsed.name, 'Test')
  assert.deepEqual(parsed.downloads, [{ title: 'Portal', uris: ['https://example.com/a.zip'], fileSize: '', uploadDate: '' }])
})

test('download lookup retains sources sharing a display name and rejects empty normalized queries', () => {
  const state = { sources: [
    { name: '__proto__', url: 'https://a.test', data: [{ title: '原神', uris: [] }] },
    { name: '__proto__', url: 'https://b.test', data: [{ title: 'Portal 2', uris: [] }] },
  ] }
  const engine = loadTs('src/services/downloadEngine.ts', { '../store/sourceStore': { useSourceStore: { getState: () => state } } })
  assert.equal(engine.hasGameInSource('原神', '__proto__'), true)
  assert.equal(engine.hasGameInSource('Portal', '__proto__'), true)
  assert.equal(engine.hasGameInSource('!', '__proto__'), false)
  assert.deepEqual(engine.getDownloadsForGame('!'), [])
  assert.equal(engine.getDownloadsForGame('原神').length, 1)
  state.sources = []
  assert.deepEqual(engine.getDownloadsForGame('原神'), [])
})

test('desktop fetch forwards status, headers and URL without native cross-origin fetch', async () => {
  const previousWindow = global.window
  let forwarded
  global.window = { electronAPI: { requestText: async options => {
    forwarded = options
    return { status: 429, statusText: 'Too Many Requests', body: 'retry', headers: [['retry-after', '60']], url: 'https://example.com/final' }
  } } }
  try {
    const { desktopFetch } = loadTs('src/services/httpClient.ts')
    const response = await desktopFetch('https://example.com/test', { headers: { accept: 'text/plain' } })
    assert.equal(response.status, 429)
    assert.equal(response.ok, false)
    assert.equal(response.headers.get('retry-after'), '60')
    assert.equal(response.url, 'https://example.com/final')
    assert.equal(await response.text(), 'retry')
    assert.equal(forwarded.headers.accept, 'text/plain')
    assert.equal(forwarded.method, 'GET')
  } finally { global.window = previousWindow }
})

test('desktop fetch abort cancels its main-process request', async () => {
  const previousWindow = global.window
  let complete
  let cancelled
  global.window = { electronAPI: {
    requestText: () => new Promise(resolve => { complete = resolve }),
    cancelRequest: id => { cancelled = id },
  } }
  try {
    const { desktopFetch } = loadTs('src/services/httpClient.ts')
    const controller = new AbortController()
    const result = desktopFetch('https://example.com/test', { signal: controller.signal })
    controller.abort()
    await assert.rejects(result, { name: 'AbortError' })
    assert.equal(typeof cancelled, 'string')
    complete({ status: 200, statusText: 'OK', body: '', headers: [], url: 'https://example.com/test' })
  } finally { global.window = previousWindow }
})

function scannerFixture(findSteamIdByName = async () => undefined) {
  const state = { installedGames: [], library: [], settings: { language: 'en', scanUninstalledSteam: true }, isScanning: false, scanMessage: '' }
  for (const [method, key] of [['setInstalledGames', 'installedGames'], ['setIsScanning', 'isScanning'], ['setScanMessage', 'scanMessage']]) {
    state[method] = value => { state[key] = value }
  }
  const useGameStore = selector => selector(state)
  useGameStore.getState = () => state
  const { useScanner } = loadTs('src/hooks/useScanner.ts', {
    react: { useCallback: fn => fn },
    '../store/gameStore': { useGameStore },
    '../store/uiStore': { useUIStore: selector => selector({ showNotification() {} }) },
    '../services/steamService': { ...steamMock, findSteamIdByName },
  })
  return { state, scan: useScanner().scan }
}

test('startup and splash scans share one manifest request', async () => {
  const previousWindow = global.window
  const previousImage = global.Image
  let complete
  let calls = 0
  global.Image = class {}
  global.window = { electronAPI: { onScanProgress: () => () => {}, scanGames: () => { calls++; return new Promise(resolve => { complete = resolve }) } } }
  try {
    const { scan } = scannerFixture()
    const first = scan()
    const second = scan()
    assert.equal(calls, 1)
    complete({ success: true, games: [{ id: 'steam_1', platform: 'steam', appId: '1', name: 'Portal', installed: true }] })
    assert.deepEqual(await first, await second)
  } finally { global.window = previousWindow; global.Image = previousImage }
})

test('initial scan results are published before a slow enrichment finishes', async () => {
  const previousWindow = global.window
  let finishLookup, completed = false, published = 0
  global.window = { electronAPI: { onScanProgress: () => () => {}, scanGames: async () => ({ success: true, games: [{ id: 'custom-game', platform: 'custom', name: 'Fixture Game', installed: true }] }) } }
  try {
    const { scan, state } = scannerFixture(() => new Promise(resolve => { finishLookup = resolve }))
    const pending = scan({ awaitEnrichment: true, onInitialGames: () => { published++; assert.equal(state.installedGames.length, 1) } }).then(result => { completed = true; return result })
    await new Promise(setImmediate)
    assert.equal(published, 1)
    assert.equal(completed, false)
    finishLookup(100)
    assert.equal((await pending)[0].steamId, 100)
  } finally { global.window = previousWindow }
})

test('late enrichment cannot replace a newer scan or roll back playtime', async () => {
  const previousWindow = global.window
  const previousImage = global.Image
  let resolveName
  let games = [{ id: 'old', platform: 'custom', name: 'Old Game', installed: true }]
  global.Image = class {}
  global.window = { electronAPI: { onScanProgress: () => () => {}, scanGames: async () => ({ success: true, games }) } }
  try {
    const { scan, state } = scannerFixture(() => new Promise(resolve => { resolveName = resolve }))
    await scan()
    games = [{ id: 'new', platform: 'steam', appId: '2', name: 'New Game', installed: true }]
    await scan({ awaitEnrichment: true })
    state.installedGames = state.installedGames.map(game => ({ ...game, playTimeMinutes: 99 }))
    resolveName(1)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.installedGames[0].id, 'new')
    assert.equal(state.installedGames[0].playTimeMinutes, 99)
  } finally { global.window = previousWindow; global.Image = previousImage }
})

test('cancelled enrichment preserves the complete initial library', async () => {
  const previousWindow = global.window
  const previousImage = global.Image
  let resolveName
  global.Image = class {}
  const games = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Game ${i}`, platform: 'custom', installed: true }))
  global.window = { electronAPI: { onScanProgress: () => () => {}, scanGames: async () => ({ success: true, games }) } }
  try {
    const controller = new AbortController()
    const pending = []
    const { scan, state } = scannerFixture(() => new Promise(resolve => pending.push(resolve)))
    await scan({ signal: controller.signal })
    controller.abort()
    pending.forEach(resolve => resolve(1))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.installedGames.length, 6)
  } finally { global.window = previousWindow; global.Image = previousImage }
})

test('an aborted scan releases its busy state and a late native result cannot overwrite a new scan', async () => {
  const previousWindow = global.window
  const pending = []
  global.window = { electronAPI: { onScanProgress: () => () => {}, scanGames: () => new Promise(resolve => pending.push(resolve)) } }
  try {
    const { scan, state } = scannerFixture()
    const controller = new AbortController()
    const old = scan({ signal: controller.signal })
    controller.abort()
    assert.equal(state.isScanning, false)
    const current = scan({ awaitEnrichment: true })
    assert.equal(pending.length, 2)
    pending[1]({ success: true, games: [{ id: 'new', name: 'New Game', platform: 'custom', installed: true }] })
    await current
    pending[0]({ success: true, games: [{ id: 'old', name: 'Old Game', platform: 'custom', installed: true }] })
    await old
    assert.deepEqual(state.installedGames.map(game => game.id), ['new'])
    assert.equal(state.isScanning, false)
  } finally { global.window = previousWindow }
})

test('authoritative process sessions do not write duplicate playtime; manual ticks retain remainder', () => {
  const previousWindow = global.window
  const previousStorage = global.localStorage
  const originalNow = Date.now
  let now = 1000
  const writes = []
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  global.window = { electronAPI: { addPlaytime: async (...args) => { writes.push(args) }, setSettings: async () => {} } }
  Date.now = () => now
  try {
    const { useGameStore } = loadTs('src/store/gameStore.ts', { '../services/steamService': steamMock })
    const store = () => useGameStore.getState()
    store().setInstalledGames([{ id: '1', name: 'Portal', platform: 'steam', playTimeMinutes: 0 }])
    store().startPlaySession('1', 'Portal', true)
    now += 90000
    store().tickPlaySession()
    store().stopPlaySession()
    assert.equal(writes.length, 0)
    store().syncPlaytimeFromDisk({ '1': { playTimeMinutes: 1.4 } }, true)
    assert.equal(store().installedGames[0].playTimeMinutes, 1.4)
    store().startPlaySession('1', 'Portal')
    now += 90000
    store().tickPlaySession()
    now += 30000
    store().tickPlaySession()
    assert.equal(writes.reduce((sum, entry) => sum + entry[1], 0), 2)
  } finally { global.window = previousWindow; global.localStorage = previousStorage; Date.now = originalNow }
})

test('CheapShark carousel requests are shared and prices retain USD currency', async () => {
  let requests = 0
  const hooks = loadTs('src/hooks/useGames.ts', {
    '@tanstack/react-query': { useQuery: options => options },
    '../services/steamService': { POPULAR_STEAM_IDS: [730], TRENDING_IDS: [730], NEW_RELEASE_IDS: [730] },
    '../services/httpClient': { desktopFetch: async () => {
      requests++
      return { ok: true, json: async () => [{ steamAppID: '730', salePrice: '12.00', normalPrice: '20.00', savings: '40' }] }
    } },
  })
  const [popular] = await Promise.all([hooks.usePopularGames().queryFn(), hooks.useTrendingGames().queryFn()])
  assert.equal(requests, 1)
  assert.equal(popular[0].priceFormatted, '12.00 USD')
})

test('known Steam title mappings use the correct verified app IDs', () => {
  const steam = loadTs('src/services/steamService.ts')
  assert.equal(steam.KNOWN_STEAM_APP_NAMES[1593500], 'God of War')
  assert.equal(steam.KNOWN_STEAM_APP_NAMES[1623730], 'Palworld')
  assert.equal(steam.KNOWN_STEAM_APP_NAMES[1627720], 'Lies of P')
  assert.equal(steam.KNOWN_STEAM_APP_NAMES[1817070], "Marvel's Spider-Man Remastered")
  assert.equal(steam.KNOWN_STEAM_APP_NAMES[1850570], "DEATH STRANDING DIRECTOR'S CUT")
  assert.notEqual(steam.KNOWN_STEAM_APP_NAMES[1716740], 'Lies of P')
})

test('recovery secrets use crypto randomness with the established format', () => {
  const { generateRecoverySecret } = loadTs('src/services/identityTokens.ts')
  const secrets = Array.from({ length: 100 }, generateRecoverySecret)
  assert.equal(new Set(secrets).size, 100)
  secrets.forEach(secret => assert.match(secret, /^ECL-SEC(?:-[A-HJ-NP-Z2-9]{4}){4}$/))
})

function socialFixture() {
  const listeners = []
  const state = { settings: { username: 'Tester', eclipseFriends: [] }, library: [], installedGames: [], activeGame: null }
  state.updateSettings = patch => { state.settings = { ...state.settings, ...patch } }
  let signIns = 0
  let authFailure = false
  const auth = { currentUser: null, authStateReady: async () => {} }
  const mocks = {
    'firebase/app': { initializeApp: () => ({}), getApps: () => [] },
    'firebase/auth': { getAuth: () => auth, signInAnonymously: async () => {
      signIns++
      if (authFailure) throw new Error('Offline')
      auth.currentUser = { uid: 'my-user' }
      return { user: auth.currentUser }
    } },
    'firebase/firestore': {
      getFirestore: () => ({}), doc: (_db, collection, id) => ({ collection, id }),
      getDoc: async () => ({ exists: () => false }), setDoc: async () => {}, updateDoc: async () => {},
      collection: (_db, name) => name, documentId: () => 'documentId',
      where: (_field, _operator, values) => values, query: (_collection, ...constraints) => ({ collection: _collection, values: constraints.find(Array.isArray), constraints }),
      serverTimestamp: () => Date.now(), arrayUnion: (...values) => values,
      onSnapshot: (target, options, receive) => {
        const callback = typeof options === 'function' ? options : receive
        const listener = { target, callback, active: true }
        listeners.push(listener)
        return () => { listener.active = false }
      },
    },
    '../store/gameStore': { useGameStore: { getState: () => state } },
    './notificationService': { sendAppNotification() {} },
  }
  const service = loadTs('src/services/firebaseService.ts', mocks)
  return { service, state, listeners, signIns: () => signIns, failAuth: value => { authFailure = value } }
}

test('social initialization shares auth and can retry a failed sign-in', async () => {
  const previousWindow = global.window
  const previousWarn = console.warn
  global.window = {}
  console.warn = () => {}
  try {
    const fixture = socialFixture()
    fixture.failAuth(true)
    const first = fixture.service.initFirebaseSocial()
    assert.equal(first, fixture.service.initFirebaseSocial())
    await first
    assert.equal(fixture.signIns(), 1)
    fixture.failAuth(false)
    await fixture.service.initFirebaseSocial()
    assert.equal(fixture.signIns(), 2)
    assert.equal(fixture.listeners.length, 3)
    assert.equal(fixture.listeners.filter(listener => listener.target.collection === 'friend_requests').length, 2)
  } finally { global.window = previousWindow; console.warn = previousWarn }
})

test('friend subscriptions cover more than 30 friends and reuse unchanged queries', async () => {
  const previousWindow = global.window
  global.window = {}
  try {
    const fixture = socialFixture()
    await fixture.service.initFirebaseSocial()
    const friendIds = Array.from({ length: 65 }, (_, index) => `friend-${index}`)
    const emit = ids => fixture.listeners[0].callback({ exists: () => true, data: () => ({ friends: ids }) })
    emit(friendIds)
    const queries = fixture.listeners.filter(listener => listener.target.values)
    assert.deepEqual(queries.map(listener => listener.target.values.length), [30, 30, 5])
    emit([...friendIds].reverse())
    assert.equal(fixture.listeners.length, 6)
    emit(['friend-0'])
    assert.equal(queries.every(listener => !listener.active), true)
    assert.equal(fixture.listeners.length, 7)
  } finally { global.window = previousWindow }
})

test('Roblox has no invented Steam player counts, reviews or Metacritic rating', async () => {
  const steam = loadTs('src/services/steamService.ts')
  assert.equal(steam.ROBLOX_APP_DETAILS.metacritic, undefined)
  assert.equal(await steam.getLivePlayerCount(steam.ROBLOX_APP_ID), null)
  assert.equal(await steam.fetchSteamPlayerStats(steam.ROBLOX_APP_ID), null)
  assert.equal(await steam.getSteamDBSummary(steam.ROBLOX_APP_ID), null)
  assert.equal(await steam.getSteamReviewSummary(steam.ROBLOX_APP_ID), null)
})

test('sandboxed controller loads external code and preserves every skin and input state', () => {
  const vm = require('node:vm')
  const directory = path.resolve(__dirname, '../public/controller-skins')
  const html = fs.readFileSync(path.join(directory, 'controller.html'), 'utf8')
  assert.match(html, /<script src="\.\/controller\.js"><\/script>/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /script-src 'self'/)
  for (const skin of ['ps5_white', 'ps5_black', 'ps4_white', 'ps4_black', 'xbox_one']) {
    const nodes = new Map()
    const getElementById = id => {
      if (!nodes.has(id)) nodes.set(id, { className: '', style: {}, classList: new Set() })
      const node = nodes.get(id)
      node.classList.remove = node.classList.delete.bind(node.classList)
      return node
    }
    let onMessage
    const parent = {}
    vm.runInNewContext(fs.readFileSync(path.join(directory, 'controller.js'), 'utf8'), {
      URLSearchParams, document: { getElementById },
      window: { location: { search: `?skin=${skin}` }, parent, addEventListener: (_event, listener) => { onMessage = listener } },
    })
    assert.equal(getElementById('skin-style').href, `./${skin}.css`)
    assert.equal(fs.existsSync(path.join(directory, `${skin}.css`)), true)
    const data = { type: 'gamepad-state', buttons: [{ pressed: true, value: 1 }], axes: [0.5, 0, 0, 0] }
    onMessage({ source: {}, data })
    assert.equal(getElementById('btn-a').classList.has('pressed'), false)
    onMessage({ source: parent, data })
    assert.equal(getElementById('btn-a').classList.has('pressed'), true)
    assert.equal(getElementById('stick-l').style.transform, 'translate(10px, 0px)')
    onMessage({ source: parent, data: { type: 'gamepad-state', buttons: [], axes: [0.01, 0, 0, 0] } })
    assert.equal(getElementById('btn-a').classList.has('pressed'), false)
    assert.equal(getElementById('stick-l').style.transform, 'translate(0px, 0px)')
  }
})

test('controller iframe uses desktop asset protocol while retaining an opaque sandbox', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { ControllerOverlay } = loadTs('src/components/overlay/widgets/ControllerOverlay.tsx')
  const previousWindow = global.window
  try {
    global.window = { electronAPI: {} }
    const desktop = renderToStaticMarkup(React.createElement(ControllerOverlay, { skin: 'ps5_black' }))
    assert.match(desktop, /src="eclipse-asset:\/\/bundle\/controller-skins\/controller\.html\?skin=ps5_black"/)
    assert.match(desktop, /sandbox="allow-scripts"/)
    assert.doesNotMatch(desktop, /allow-same-origin/)
    global.window = {}
    const browser = renderToStaticMarkup(React.createElement(ControllerOverlay, { skin: 'ps4_white' }))
    assert.match(browser, /src="\.\/controller-skins\/controller\.html\?skin=ps4_white"/)
    assert.match(browser, /sandbox="allow-scripts"/)
  } finally { global.window = previousWindow }
})

test('video player loads HLS only when required and cancels setup after unmount', async () => {
  const makeFixture = src => {
    const effects = []
    const video = { canPlayType: () => '', pause() {}, load() {}, play: async () => {} }
    let refs = 0
    let imports = 0
    let instances = 0
    class MockHls {
      static isSupported() { return true }
      static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' }
      constructor() { instances++ }
      loadSource() {}
      attachMedia() {}
      on() {}
      destroy() {}
    }
    const mocks = {
      '../../hooks/useTranslation': { useTranslation: () => ({ t: key => key, language: 'en', locale: 'en-US' }) },
      '../../hooks/useMediaCleanup': {useMediaCleanup(){}},
      react: {
        useState: value => [typeof value === 'function' ? value() : value, () => {}],
        useRef: () => ({ current: refs++ === 0 ? video : null }),
        useEffect: effect => { effects.push(effect) }, useCallback: fn => fn,
      },
    }
    Object.defineProperty(mocks, 'hls.js', { get() { imports++; return { __esModule: true, default: MockHls } } })
    const { CustomVideoPlayer } = loadTs('src/components/shared/CustomVideoPlayer.tsx', mocks)
    CustomVideoPlayer({ src })
    return { start: effects[1], imports: () => imports, instances: () => instances }
  }
  const native = makeFixture('https://example.com/trailer.mp4')
  const cleanupNative = native.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(native.imports(), 0)
  cleanupNative()
  const cancelled = makeFixture('https://example.com/trailer.m3u8')
  cancelled.start()()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancelled.imports(), 1)
  assert.equal(cancelled.instances(), 0)
  const streaming = makeFixture('https://example.com/trailer.m3u8')
  const cleanupStreaming = streaming.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(streaming.instances(), 1)
  cleanupStreaming()
})

test('version ordering follows prerelease precedence and ignores build metadata', () => {
  const { isNewerVersion } = loadTs('src/services/updateService.ts')
  assert.equal(isNewerVersion('v1.3.3', '1.3.2'), true)
  assert.equal(isNewerVersion('1.3.2', '1.3.2-beta.10'), true)
  assert.equal(isNewerVersion('1.3.2-beta.10', '1.3.2-beta.2'), true)
  assert.equal(isNewerVersion('1.3.2-beta', '1.3.2-alpha.99'), true)
  assert.equal(isNewerVersion('1.3.2-alpha.2', '1.3.2-alpha'), true)
  assert.equal(isNewerVersion('1.3.2-beta.10', '1.3.2'), false)
  assert.equal(isNewerVersion('1.3.2+build.9', '1.3.2+build.1'), false)
  assert.equal(isNewerVersion('1.03.3'), false)
  assert.equal(isNewerVersion('1.3.3-beta.01'), false)
  assert.equal(isNewerVersion('release-1.9.9'), false)
})

test('startup update checks respect disabled preference and share one check across callers', async () => {
  const previousWindow = global.window
  let nativeChecks = 0
  let requests = 0
  global.window = { electronAPI: { checkUpdate: async () => { nativeChecks++ } } }
  try {
    const { checkStartupUpdates } = loadTs('src/services/updateService.ts', {
      './httpClient': { desktopFetch: async () => {
        requests++
        return { ok: true, json: async () => ({ tag_name: 'v2.0.4', assets: [] }) }
      } },
    })
    assert.equal(await checkStartupUpdates(false), null)
    assert.equal(nativeChecks, 0)
    assert.equal(requests, 0)
    const first = checkStartupUpdates(true)
    const second = checkStartupUpdates(true)
    assert.equal(first, second)
    const release = await first
    assert.equal(release.isNewer, true)
    await checkStartupUpdates(true)
    assert.equal(nativeChecks, 1)
    assert.equal(requests, 1)
  } finally { global.window = previousWindow }
})

test('application version has one SemVer source and a consistent patch display label',()=>{
  const packageVersion=require('../package.json').version,lock=require('../package-lock.json')
  const {APP_VERSION,APP_DISPLAY_VERSION,isNewerVersion}=loadTs('src/services/updateService.ts',{'./httpClient':{desktopFetch(){throw Error('Version checks must not fetch')}}})
  assert.equal(packageVersion,'2.0.3');assert.equal(lock.version,packageVersion);assert.equal(lock.packages[''].version,packageVersion)
  assert.equal(APP_VERSION,packageVersion);assert.equal(APP_DISPLAY_VERSION,packageVersion)
  assert.equal(isNewerVersion('v1.3.2'),false);assert.equal(isNewerVersion('v2.0.0'),false)
  assert.equal(isNewerVersion('v2.0.1'),false);assert.equal(isNewerVersion('v2.0.2'),false);assert.equal(isNewerVersion('v2.0.3'),false);assert.equal(isNewerVersion('v2.0.4'),true)
})

test('update timeout covers the response body and clears its deadline after completion', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousWarn = console.warn
  console.warn = () => {}
  let signal
  try {
    const { checkForAppUpdates } = loadTs('src/services/updateService.ts', {
      './httpClient': { desktopFetch: async (_url, options) => {
        signal = options.signal
        return { ok: true, json: () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        }) }
      } },
    })
    const pending = checkForAppUpdates()
    await Promise.resolve()
    t.mock.timers.tick(3999)
    assert.equal(signal.aborted, false)
    t.mock.timers.tick(1)
    assert.equal(await pending, null)
    assert.equal(signal.aborted, true)
    const complete = loadTs('src/services/updateService.ts', {
      './httpClient': { desktopFetch: async (_url, options) => {
        signal = options.signal
        return { ok: true, json: async () => ({ tag_name: 'v1.3.3', assets: [] }) }
      } },
    })
    assert.equal((await complete.checkForAppUpdates()).version, '1.3.3')
    t.mock.timers.tick(5000)
    assert.equal(signal.aborted, false)
  } finally { console.warn = previousWarn }
})

test('splash proceeds without native or HTTP update requests when auto checks are disabled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousWindow = global.window
  const effects = []
  const updateCalls = []
  let scans = 0
  let finished = 0
  const state = { settings: { autoCheckUpdates: false, autoScanSplash: true, scanUninstalledSteam: false }, scanMessage: '', updateSettings() {} }
  const useGameStore = selector => selector(state)
  useGameStore.getState = () => state
  global.window = { electronAPI: { checkUpdate() { assert.fail('Disabled auto updater was called') } } }
  try {
    const { SplashView } = loadTs('src/components/splash/SplashView.tsx', {
      '../updates/UpdateCard': { UpdateCard: () => null },
      './LaunchOverlay': { useLaunchOverlay() {} },
      '../library/LibraryView': { LibraryView: () => null },
      '../../services/startupLibrary': {
        prepareStartupLibrary: async options => {
          await options.scan?.({ signal: options.signal, awaitEnrichment: true })
          return { completed: 0, total: 0, loaded: 0, failed: 0, timedOut: false }
        },
        waitForStartupMinimum: () => new Promise(resolve => setTimeout(resolve, 3500)),
      },
      react: { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: effect => { effects.push(effect) }, useRef: value => ({ current: value }), useMemo: fn => fn() },
      '../../store/gameStore': { useGameStore },
      '../../hooks/useScanner': { useScanner: () => ({ scan: async () => { scans++; return [] } }) },
      '../../hooks/useTranslation': { useTranslation: () => ({ language: 'en' }) },
      '../../services/updateService': { APP_VERSION: '1.3.2', checkStartupUpdates: async enabled => { updateCalls.push(enabled); return null } },
    })
    SplashView({ onComplete: () => { finished++ } })
    effects.forEach(effect => effect())
    t.mock.timers.tick(0)
    await new Promise(resolve => setImmediate(resolve))
    t.mock.timers.tick(3499)
    assert.equal(finished, 0)
    t.mock.timers.tick(1)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(updateCalls, [false])
    assert.equal(scans, 1)
    assert.equal(finished, 1)
  } finally { global.window = previousWindow }
})
