const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

function fixture(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {} } })
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage })
  return loadTs()('src/store/uiStore.ts').useUIStore
}

test('Home navigation dismisses an installed game even when Home is already the underlying view', t => {
  const store = fixture(t)
  const initial = store.getState()
  initial.openGameDetails(252950, 'Rocket League')
  store.getState().setActiveView('home')
  const home = store.getState()
  assert.equal(home.activeView, 'home')
  assert.equal(home.isGameModalOpen, false)
  assert.equal(home.selectedGameId, null)
  assert.equal(home.selectedGameName, null)
  assert.deepEqual(home.history, ['home'], 'Dismissing a game must not add duplicate Home entries')
  home.setActiveView('home')
  assert.equal(store.getState(), home, 'Clicking an already active page without a game stays a no-op')
})

test('Back and Forward dismiss game selection while preserving page history', t => {
  const store = fixture(t)
  store.getState().setActiveView('library')
  store.getState().openGameDetails(252950, 'Rocket League')
  store.getState().goBack()
  assert.equal(store.getState().activeView, 'library')
  assert.equal(store.getState().isGameModalOpen, false)
  assert.equal(store.getState().selectedGameId, null)
  assert.deepEqual(store.getState().history, ['home', 'library'])
  store.getState().goBack()
  assert.equal(store.getState().activeView, 'home')
  assert.equal(store.getState().historyIndex, 0)
  store.getState().openGameDetails(252950, 'Rocket League')
  store.getState().goForward()
  assert.equal(store.getState().activeView, 'library')
  assert.equal(store.getState().historyIndex, 1)
  assert.equal(store.getState().isGameModalOpen, false)
  assert.equal(store.getState().selectedGameId, null)
})

test('profile navigation also discards the old game page and selection', t => {
  const store = fixture(t)
  store.getState().openGameDetails(252950, 'Rocket League')
  store.getState().openFriendProfile('fixture-friend')
  assert.equal(store.getState().activeView, 'profile')
  assert.equal(store.getState().isGameModalOpen, false)
  assert.equal(store.getState().selectedGameName, null)
})
