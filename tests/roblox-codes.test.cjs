const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')
const load = loadTs(), parser = load('electron/robloxCodesParser.ts'), model = load('src/services/robloxGames.ts')
const article = (name, body) => `<h1>${name} Codes</h1><nav><a>Expired codes</a></nav><h2>Working codes</h2>${body}`
const row = (code, reward, expired = false, parent = 'Blox Fruits', status = expired ? 'expired' : 'active') => `<tr data-expired="${expired}"><td><button data-copy="${code}" data-parent-name="${parent}" data-code-status="${status}">${code}</button></td><td>${reward}</td></tr>`

test('Roblox names retain game numbers and never confuse sequels or similarly named games', () => {
  assert.equal(model.cleanRobloxName('[🎃 UPDATE] Murder Mystery 2'), 'Murder Mystery 2')
  assert.equal(model.sameRobloxGame('Rivals', 'Blue Lock Rivals'), false)
  assert.equal(model.sameRobloxGame('Murder Mystery', 'Murder Mystery 2'), false)
  assert.equal(model.sameRobloxGame('[UPDATE] Blox Fruits 🍍', 'Blox Fruits'), true)
  assert.equal(model.robloxPlaceId('https://www.roblox.com/games/1234/Game'), '1234')
  assert.equal(model.robloxPlaceId('https://www.roblox.com.evil.test/games/1234'), undefined)
})

test('source parser uses real heading boundaries, explicit expiry and the current game identity', () => {
  const html = article('Blox Fruits', `<ul><li><strong>HELLO2026</strong> – 20 minutes of XP</li></ul><table>${row('EXAMPLE', 'Reset')}${row('OLD', 'Coins', true)}${row('SUSPECT', '-', false, 'Blox Fruits', 'check')}${row('FOREIGN', 'Coins', false, 'Another Game')}</table><h2>How to redeem codes</h2><ul><li><strong>FAKE_TUTORIAL</strong>: Click this</li></ul><h2>Expired codes</h2><ul><li><strong>EXAMPLE</strong> - Reset</li></ul><script><li><strong>FAKE_SCRIPT</strong>: Coins</li></script>`)
  const result = parser.parseCodesFromHtmlOrText(html)
  assert.deepEqual(result.active.map(item => item.code), ['HELLO2026'])
  assert.deepEqual(result.expired.map(item => item.code), ['OLD', 'EXAMPLE'])
  assert.equal(result.active[0].reward, '20 minutes of XP')
  assert.equal(parser.articleMatchesGame(article('Blue Lock Rivals', ''), 'Rivals'), false)
  assert.equal(parser.articleMatchesGame(article('Murder Mystery 2', ''), 'Murder Mystery'), false)
})

test('official description codes preserve punctuation and decode entities without manufacturing rewards', () => {
  const result = parser.parseCodesFromHtmlOrText('Use codes: NEW!, CaseSensitive\nTHANKS - 10 &amp; 20 Coins\nExpired codes\nOLD - Coins')
  assert.deepEqual(result.active.map(item => item.code), ['NEW!', 'CaseSensitive', 'THANKS'])
  assert.equal(result.active[2].reward, '10 & 20 Coins')
  assert.equal(result.expired[0].code, 'OLD')
  assert.equal(parser.isValidCode('window.location=bad'), false)
  assert.equal(parser.isValidCode('https://evil.test'), false)
})

test('directory indexing discovers non-seeded games while excluding external, promo and unsafe links', () => {
  const items = parser.parseCodesIndex('<a href="https://www.pockettactics.com/crystal-forest-2/codes">Crystal Forest 2 codes</a><a href="https://evil.test/x-codes">Another game codes</a><a href="javascript:evil">Bad codes</a><a href="https://www.pockettactics.com/roblox/promo-codes">Promo codes</a>', { name: 'Pocket Tactics', url: 'https://www.pockettactics.com/roblox/game-codes' })
  assert.deepEqual(items.map(item => item.name), ['Crystal Forest 2'])
})

function fixture(overrides = {}) {
  let now = 1_000_000, unavailable = false
  const calls = [], updates = []
  const module = loadTs()('electron/robloxCodesService.ts')
  const fetchText = async url => {
    calls.push(url)
    if (unavailable) return null
    if (overrides.fetchText) return overrides.fetchText(url)
    if (url.endsWith('/roblox/game-codes')) return '<a href="https://www.pockettactics.com/blox-fruits/codes">Blox Fruits codes</a><a href="https://www.pockettactics.com/crystal-forest-2/codes">Crystal Forest 2 codes</a>'
    if (url.endsWith('/game-codes')) return '<a href="/game-codes/blox-fruits">Blox Fruits</a>'
    if (url.includes('/v1/games?')) return JSON.stringify({ data: [{ id: 994732206, rootPlaceId: 2753915549, name: '[UPDATE] Blox Fruits', description: 'Code: FROMDEV!', creator: { name: 'Developer' } }] })
    if (url.includes('search-api')) return JSON.stringify({ searchResults: [{ contentGroupType: 'Game', contents: [{ universeId: 994732206, rootPlaceId: 2753915549, name: 'Blox Fruits', creatorName: 'Developer', playerCount: 42 }] }] })
    if (url.includes('thumbnails.roblox.com')) return JSON.stringify({ data: [{ targetId: 994732206, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/valid.png' }] })
    if (url.endsWith('/blox-fruits/codes')) return article('Blox Fruits', '<li><strong>CaseCode</strong> – 100 coins</li><h2>Expired codes</h2><li><strong>DISAGREE</strong> – Coins</li>')
    if (url.includes('/game-codes/blox-fruits')) return article('Blox Fruits', `${row('CASECODE', '100 coins')}${row('DISAGREE', 'Coins')}`)
    return null
  }
  return { module, calls, updates, offline: () => { unavailable = true }, advance: value => { now += value }, engine: module.createRobloxCodesService({ cacheFile: overrides.cacheFile, fetchText, now: () => now, onUpdate: result => updates.push(result) }) }
}

test('parallel requests share one lookup, preserve developer codes, merge spellings and flag disagreement', async () => {
  const f = fixture()
  const [one, two] = await Promise.all([f.engine.getCodes('Blox Fruits', '2753915549', '994732206'), f.engine.getCodes('Blox Fruits', '2753915549', '994732206')])
  assert.equal(one, two)
  assert.equal(f.calls.filter(url => url.endsWith('/roblox/game-codes')).length, 1)
  assert.equal(one.activeCodes.find(item => item.code === 'FROMDEV!').verification, 'developer')
  assert.deepEqual(one.activeCodes.find(item => item.code === 'CaseCode').alternatives, ['CASECODE'])
  assert.equal(one.activeCodes.find(item => item.code === 'DISAGREE').conflicting, true)
  assert.equal(one.expiredCodes.some(item => item.code === 'DISAGREE'), false)
  const count = f.calls.length
  assert.equal(await f.engine.getCodes('Blox Fruits', '2753915549', '994732206'), one)
  assert.equal(f.calls.length, count, 'A warm lookup requires no network requests')
})

test('unreachable sources yield no invented codes and are negatively cached', async () => {
  const f = fixture({ fetchText: async () => null })
  const result = await f.engine.getCodes('Unknown Game')
  assert.equal(result.status, 'unavailable')
  assert.deepEqual(result.activeCodes, [])
  const count = f.calls.length
  await f.engine.getCodes('Unknown Game')
  assert.equal(f.calls.length, count)
})

test('stale codes remain available immediately and a failed refresh cannot erase them', async () => {
  const f = fixture()
  const original = await f.engine.getCodes('Blox Fruits', '2753915549', '994732206')
  f.advance(16 * 60_000); f.offline()
  const immediate = await f.engine.getCodes('Blox Fruits', '2753915549', '994732206')
  assert.equal(immediate.stale, true)
  const renewed = await f.engine.getCodes('Blox Fruits', '2753915549', '994732206', true)
  assert.deepEqual(renewed.activeCodes, original.activeCodes)
  assert.equal(renewed.lastUpdated, original.lastUpdated, 'A failed refresh does not pretend the old data was just checked')
})

test('directory search finds a game outside the seeded list and returns official identities and images', async () => {
  const f = fixture()
  const found = await f.engine.searchGames('Crystal Forest 2')
  assert.ok(found.some(game => game.name === 'Crystal Forest 2' && game.sources.length))
  const blox = await f.engine.searchGames('Blox Fruits')
  assert.equal(blox[0].universeId, '994732206')
  assert.equal(blox[0].iconUrl, 'https://tr.rbxcdn.com/valid.png')
  await assert.rejects(f.engine.getCodes('Test', 'invalid-id'))
  assert.equal(f.module.allowedRobloxCodesUrl('https://127.0.0.1/code'), false)
  assert.equal(f.module.allowedRobloxCodesUrl('https://robloxden.com.evil.test/game-codes'), false)
})

test('public Roblox identity takes priority over a stale name when associating community codes', async () => {
  const f = fixture({ fetchText: async url => {
    if (url.includes('/v1/games?')) return JSON.stringify({ data: [{ id: 123, rootPlaceId: 456, name: 'Actual Game 2', description: 'Code: REAL_DEVELOPER_CODE' }] })
    if (url.includes('/game-codes') || url.includes('-codes')) return article('Blox Fruits', '<li><strong>WRONG_GAME_CODE</strong> – Coins</li>')
    return null
  } })
  const result = await f.engine.getCodes('Blox Fruits', '456', '123')
  assert.equal(result.gameName, 'Actual Game 2')
  assert.deepEqual(result.activeCodes.map(item => item.code), ['REAL_DEVELOPER_CODE'])
})

test('concurrent game searches keep no more than four source requests in flight', async () => {
  let active = 0, maximum = 0
  const release = []
  const f = fixture({ fetchText: () => new Promise(resolve => { active++; maximum = Math.max(maximum, active); release.push(() => { active--; resolve(null) }) }) })
  const tasks = Array.from({ length: 10 }, (_, index) => f.engine.searchGames(`query-${index}`))
  for (let pass = 0; pass < 20; pass++) { await new Promise(setImmediate); for (const finish of release.splice(0)) finish() }
  await Promise.all(tasks)
  assert.equal(maximum, 4)
})

test('source-backed cached codes survive a service restart without any network request', async t => {
  const fs = require('node:fs'), path = require('node:path')
  const directory = fs.mkdtempSync(path.join(__dirname, '.roblox-codes-')), cacheFile = path.join(directory, 'cache.json')
  t.after(() => { const absolute = path.resolve(directory); assert.equal(path.dirname(absolute), path.resolve(__dirname)); assert.match(path.basename(absolute), /^\.roblox-codes-/); fs.rmSync(absolute, { recursive: true, force: true }) })
  const first = fixture({ cacheFile }), original = await first.engine.getCodes('Blox Fruits', '2753915549', '994732206')
  const deadline = Date.now() + 2000
  while (!fs.existsSync(cacheFile) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(fs.existsSync(cacheFile), true)
  const second = fixture({ cacheFile, fetchText: async () => assert.fail('A warm persisted result should not request the network') })
  assert.deepEqual((await second.engine.getCodes('Blox Fruits', '2753915549', '994732206')).activeCodes, original.activeCodes)
})
