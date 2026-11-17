const test = require('node:test'), assert = require('node:assert/strict'), load = require('./download-loader.cjs')

function fixture(t, patch = {}, background = false) {
  const previousWindow = global.window, previousDocument = global.document
  t.after(() => { global.window = previousWindow; global.document = previousDocument })
  const state = { settings: { userUid: 'owner', ...patch } }, calls = { popup: [], native: [], sound: [] }
  let nativeSuccess = true
  global.document = { hidden: false, hasFocus: () => !background }
  global.window = { electronAPI: { showNativeNotification: async options => { calls.native.push(options); return { success: nativeSuccess } } } }
  const { sendChatNotification } = load({
    '../store/gameStore': { useGameStore: { getState: () => state } },
    '../store/uiStore': { useUIStore: { getState: () => ({ showNotification: (...args) => calls.popup.push(args) }) } },
    './soundService': { playNotificationSound: preset => calls.sound.push(preset) },
  })('src/services/notificationService.ts')
  return { state, calls, failNative: () => { nativeSuccess = false }, send: () => sendChatNotification({ id: 'friend', username: 'Friend', avatarUrl: '' }, { senderId: 'friend', text: 'Hello', peerId: 'friend' }) }
}
test('foreground messages show one private popup and play the selected sound once', async t => {
  const f = fixture(t, { notificationSound: 'minimal_pop' }); await f.send()
  assert.equal(f.calls.popup.length, 1); assert.equal(f.calls.native.length, 0); assert.deepEqual(f.calls.sound, ['minimal_pop'])
  assert.equal(f.calls.popup[0][4].private, true); assert.equal(f.calls.popup[0][4].peerId, 'friend')
})
test('background messages use silent native notifications so the app tone is not duplicated', async t => {
  const f = fixture(t, {}, true); await f.send()
  assert.equal(f.calls.popup.length, 0); assert.equal(f.calls.native.length, 1); assert.equal(f.calls.sound.length, 1)
  assert.equal(f.calls.native[0].silent, true); assert.equal(f.calls.native[0].peerId, 'friend')
})
test('failed native delivery falls back to the in-app popup without playing another sound', async t => {
  const f = fixture(t, {}, true); f.failNative(); await f.send()
  assert.equal(f.calls.popup.length, 1); assert.equal(f.calls.native.length, 1); assert.equal(f.calls.sound.length, 1)
})
test('incoming bursts do not stack multiple notification sounds', async t => {
  const f = fixture(t); await f.send(); await f.send()
  assert.equal(f.calls.popup.length, 2); assert.equal(f.calls.sound.length, 1)
})
test('muted friends produce no popup, system notification or sound', async t => {
  const f = fixture(t, { chatMutedFriends: { owner: ['friend'] } }, true); await f.send()
  assert.deepEqual(f.calls, { popup: [], native: [], sound: [] })
})
test('popup and sound controls independently honor the global notification preferences', async t => {
  const f = fixture(t, { chatNotificationPopups: false }); await f.send()
  assert.equal(f.calls.popup.length, 0); assert.equal(f.calls.sound.length, 1)
  f.state.settings = { userUid: 'owner', chatNotificationSound: false }; await f.send()
  assert.equal(f.calls.popup.length, 1); assert.equal(f.calls.sound.length, 1)
  f.state.settings = { userUid: 'owner', desktopNotifications: false, soundEffects: false }; await f.send()
  assert.equal(f.calls.popup.length, 1); assert.equal(f.calls.sound.length, 1)
})
test('private message previews are not copied into persistent notification history', t => {
  const previous = global.localStorage, writes = []
  global.localStorage = { getItem: () => null, setItem: (...args) => writes.push(args) }; t.after(() => { global.localStorage = previous })
  const store = load({ zustand: { create: init => {
    let state
    state = init(patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } })
    return { getState: () => state }
  } } })('src/store/uiStore.ts').useUIStore
  t.after(() => store.getState().clearNotification())
  store.getState().showNotification('Download ready', 'success')
  const count = writes.length
  store.getState().showNotification('Private text', 'info', 'Friend', 6000, { kind: 'message', private: true, peerId: 'friend' })
  assert.equal(writes.length, count)
  assert.equal(store.getState().notificationHistory.length, 1)
  assert.doesNotMatch(JSON.stringify(store.getState().notificationHistory), /Private text/)
  assert.equal(store.getState().notification.message, 'Private text')
})
