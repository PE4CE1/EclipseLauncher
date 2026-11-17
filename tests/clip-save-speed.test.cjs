const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./download-loader.cjs')

test('pending clips remain separate from usable files and are replaced without duplicates', () => {
  const store = load()('src/store/clipStore.ts').useClipStore
  store.getState().setPendingClip({ id: 'pending-1', title: 'Highlight', gameTitle: 'Game', createdAt: 1 })
  assert.equal(store.getState().clips.length, 0)
  store.getState().updatePendingThumbnail('pending-1', 'data:image/jpeg;base64,test')
  assert.ok(store.getState().pendingClip.thumbnailUrl)
  store.getState().updatePendingPhase('pending-1','saving')
  assert.equal(store.getState().pendingClip.phase,'saving')
  assert.equal(store.getState().pendingClip.thumbnailUrl,'data:image/jpeg;base64,test')
  store.getState().addClip({ id: 'clip-1', title: 'Highlight', filePath: 'clip.mp4' }, 'pending-1')
  assert.equal(store.getState().pendingClip, null)
  store.getState().updatePendingThumbnail('pending-1', 'late thumbnail')
  store.getState().updatePendingPhase('pending-1','saving')
  assert.equal(store.getState().pendingClip, null)
  store.getState().addClip({ id: 'clip-1', title: 'Highlight', filePath: 'clip.mp4' })
  assert.equal(store.getState().clips.length, 1)
  store.getState().setPendingClip({ id: 'pending-2', title: 'Next', gameTitle: 'Game', createdAt: 2 })
  store.getState().clearPendingClip('pending-1')
  assert.equal(store.getState().pendingClip.id, 'pending-2')
  store.getState().clearPendingClip('pending-2')
  assert.equal(store.getState().pendingClip, null)
  assert.equal(store.getState().clips.length, 1)
})

test('a slow library refresh cannot erase a clip saved while the request was pending', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let finish
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { clips: { listClips: () => new Promise(resolve => { finish = resolve }) } } } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'window', original); else delete globalThis.window })
  const store = load()('src/store/clipStore.ts').useClipStore
  store.getState().setClips([{ id: 'old', title: 'Old' }])
  const request = store.getState().refreshClips()
  store.getState().addClip({ id: 'new', title: 'New', filePath: 'new.mp4' })
  finish([{ id: 'old', title: 'Old' }])
  await request
  assert.deepEqual(store.getState().clips.map(clip => clip.id), ['new', 'old'])
  const next = store.getState().refreshClips()
  finish([{ id: 'new', title: 'New' }, { id: 'old', title: 'Old' }])
  await next
  assert.equal(store.getState().clips.length, 2)
})
