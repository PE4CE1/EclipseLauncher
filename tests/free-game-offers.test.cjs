const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')
const { freeGameClaimKey, sortFreeGameOffers } = loadTs()('src/services/freeGameOffers.ts')
const offer = (platform, overrides = {}) => ({ id: 'feed-1', title: 'Test Game', platform, url: 'https://example.com', ...overrides })

test('free offers use a stable Steam → Epic → GOG order without mutating cached data', () => {
  const games = Object.freeze([offer('GOG'), offer('Epic Games'), offer('Steam'), offer('Other'), offer('Steam', { id: 'steam-2' }), offer('Epic Games', { id: 'epic-2' })])
  const sorted = sortFreeGameOffers(games)
  assert.deepEqual(sorted.map(game => game.platform), ['Steam', 'Steam', 'Epic Games', 'Epic Games', 'GOG', 'Other'])
  assert.equal(sorted[0], games[2])
  assert.equal(sorted[1], games[4])
  assert.equal(sorted[2], games[1])
  assert.equal(games[0].platform, 'GOG')
})

test('claims survive feed ID, title and localized store URL changes', () => {
  for (const [first, second] of [
    [offer('Steam', { steamAppId: 730 }), offer('Steam', { id: 'other', title: 'Renamed', url: 'https://store.steampowered.com/app/730/new-title/?l=german' })],
    [offer('Epic Games', { slug: 'the-game/home' }), offer('Epic Games', { id: 'other', url: 'https://store.epicgames.com/de/p/the-game/?lang=de' })],
    [offer('GOG', { url: 'https://www.gog.com/en/game/the_game' }), offer('GOG', { id: 'other', url: 'https://www.gog.com/de/game/the_game?utm_source=test' })],
    [offer('Other', { title: '  Test   Game ' }), offer('Other', { id: 'other', title: 'TEST GAME' })],
  ]) assert.equal(freeGameClaimKey(first), freeGameClaimKey(second))
  assert.notEqual(freeGameClaimKey(offer('Steam')), freeGameClaimKey(offer('GOG')))
  assert.notEqual(freeGameClaimKey(offer('Steam', { steamAppId: 1 })), freeGameClaimKey(offer('Steam', { steamAppId: 2 })))
})

test('claims persist across store recreation; repeat openings do not write again', () => {
  const values = new Map()
  let writes = 0
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value) }, removeItem: key => values.delete(key) }
  try {
    const game = offer('Steam', { steamAppId: 42 })
    const store = loadTs()('src/store/freeGamesStore.ts').useFreeGamesStore
    store.getState().markClaimed(game)
    const state = store.getState()
    const afterFirst = writes
    store.getState().markClaimed({ ...game, id: 'new-feed-id' })
    assert.equal(store.getState(), state)
    assert.equal(writes, afterFirst)
    const reopened = loadTs()('src/store/freeGamesStore.ts').useFreeGamesStore
    assert.equal(reopened.getState().claimed[freeGameClaimKey(game)], true)
    assert.equal(reopened.getState().claimed[freeGameClaimKey(offer('GOG'))], undefined)
    assert.equal(typeof reopened.getState().markClaimed, 'function')
  } finally { delete global.localStorage }
})

test('invalid saved data and unavailable storage do not break claims', () => {
  try {
    for (const saved of ['{broken json', JSON.stringify({ version: 1, state: { claimed: ['bad'] } }), JSON.stringify({ version: 1, state: { claimed: { good: true, bad: 'true', false: false } } })]) {
      global.localStorage = { getItem: () => saved, setItem() {}, removeItem() {} }
      const store = loadTs()('src/store/freeGamesStore.ts').useFreeGamesStore
      assert.deepEqual(store.getState().claimed, saved.includes('good') ? { good: true } : {})
      store.getState().markClaimed(offer('Steam', { steamAppId: 42 }))
      assert.equal(store.getState().claimed['Steam:app:42'], true)
    }
    global.localStorage = { getItem() { throw new Error('Blocked') }, setItem() { throw new Error('Full') }, removeItem() {} }
    const store = loadTs()('src/store/freeGamesStore.ts').useFreeGamesStore
    assert.doesNotThrow(() => store.getState().markClaimed(offer('Steam', { steamAppId: 42 })))
    assert.equal(store.getState().claimed['Steam:app:42'], true)
  } finally { delete global.localStorage }
})
