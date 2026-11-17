const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')
test('normal network cancellation resolves IPC quietly and frees the request slot', async t => {
  const handlers = {}, listeners = {}, previous = global.fetch
  t.after(() => { global.fetch = previous })
  global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  const service = load({ './ipcSecurity': { ipcMain: { handle: (name, callback) => { handlers[name] = callback }, on: (name, callback) => { listeners[name] = callback } } } })('electron/networkService.ts')
  service.initNetworkIPC()
  const sender = Object.assign(new EventEmitter(), { id: 41 }), event = { sender }, payload = { id: 'obsolete', url: 'https://example.com' }
  const request = handlers['network:request'](event, payload)
  listeners['network:cancel'](event, payload.id)
  assert.deepEqual(await request, { aborted: true })
  const retry = handlers['network:request'](event, payload)
  sender.emit('destroyed')
  assert.deepEqual(await retry, { aborted: true })
  global.fetch = async () => { throw Error('Connection failed') }
  await assert.rejects(handlers['network:request'](event, payload), /Connection failed/)
})
test('renderer request API reconstructs AbortError without rejecting the main-process invoke', async () => {
  let api
  load({ electron: { ipcRenderer: { on() {}, invoke: async () => ({ aborted: true }) }, contextBridge: { exposeInMainWorld: (_name, value) => { api = value } }, webFrame: {} } })('electron/preload.ts')
  await assert.rejects(api.requestText({ id: 'test', url: 'https://example.com' }), { name: 'AbortError' })
})
