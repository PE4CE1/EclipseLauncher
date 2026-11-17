const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

test('secured clipboard IPC validates text and awaits the native write before confirming success', async () => {
  const handlers = new Map(), writes = []
  let complete
  const native = loadTs({ electron: { clipboard: { writeText: value => { writes.push(value); return new Promise(resolve => { complete = resolve }) } } }, './ipcSecurity': { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } } })('electron/clipboardService.ts')
  native.initClipboardIPC()
  const handler = handlers.get('clipboard:write-text')
  let finished = false
  const pending = handler({}, 'MixedCase!\nSecond code').then(result => { finished = true; return result })
  await new Promise(setImmediate)
  assert.equal(finished, false)
  complete()
  assert.deepEqual(await pending, { success: true })
  assert.deepEqual(writes, ['MixedCase!\nSecond code'])
  for (const invalid of [null, {}, '', 'x'.repeat(65_537), 'nul\0text']) assert.deepEqual(await handler({}, invalid), { success: false })
  assert.equal(writes.length, 1)
})

test('a temporary clipboard lock is retried; a permanent failure never reports success', async () => {
  let attempts = 0
  const native = loadTs({ electron: { clipboard: { writeText: async () => { attempts++; if (attempts < 3) throw Error('Clipboard busy') } } }, './ipcSecurity': { ipcMain: {} } })('electron/clipboardService.ts')
  assert.deepEqual(await native.writeClipboardText('CODE'), { success: true })
  assert.equal(attempts, 3)
  const failed = loadTs({ electron: { clipboard: { writeText: async () => { throw Error('Unavailable') } } }, './ipcSecurity': { ipcMain: {} } })('electron/clipboardService.ts')
  assert.deepEqual(await failed.writeClipboardText('CODE'), { success: false })
})

function globals(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key] })
  }
}

test('code copying uses native IPC even when Chromium clipboard permissions are denied', async t => {
  const copied = []
  globals(t, { window: { electronAPI: { clipboard: { writeText: async value => { copied.push(value); return { success: true } } } } }, navigator: { clipboard: { writeText: () => assert.fail('Browser clipboard must not be requested') } } })
  const { copyText } = loadTs()('src/services/clipboard.ts')
  await copyText('CaseSensitive!')
  assert.deepEqual(copied, ['CaseSensitive!'])
  window.electronAPI.clipboard.writeText = async () => ({ success: false })
  await assert.rejects(copyText('CODE'))
})

test('older preload and browser previews can fall back without losing focus or selection', async t => {
  const calls = []
  const range = { cloneRange() { return this } }
  const selection = { rangeCount: 1, getRangeAt: () => range, removeAllRanges: () => calls.push('clear-selection'), addRange: value => calls.push(value) }
  const field = { style: {}, select: () => calls.push('select'), remove: () => calls.push('remove') }
  globals(t, { window: {}, navigator: { clipboard: { writeText: async () => { throw Error('Permission denied') } } }, document: { activeElement: { focus: () => calls.push('restore-focus') }, getSelection: () => selection, createElement: () => field, body: { appendChild: () => {} }, execCommand: command => { calls.push(command); return true } } })
  const { copyText } = loadTs()('src/services/clipboard.ts')
  await copyText('CODE')
  assert.equal(field.value, 'CODE')
  assert.ok(calls.includes('copy'))
  assert.ok(calls.includes('restore-focus'))
  assert.ok(calls.includes(range))
  document.execCommand = () => false
  await assert.rejects(copyText('CODE'))
})
