const test = require('node:test'), assert = require('node:assert/strict')
const { updateNotes, updatePercent, mergeUpdateInfo } = require('./download-loader.cjs')()('src/services/updatePresentation.ts')

test('update display preserves version and notes across native progress, completion and failure events', () => {
  const release = { version: '2.1.0', releaseNotes: '## Fixes\n- Actual release notes' }
  let state = mergeUpdateInfo(null, 'available', release)
  state = mergeUpdateInfo(state, 'downloading', undefined)
  state = mergeUpdateInfo(state, 'downloaded', { filePath: 'C:/temp/update.exe' })
  assert.equal(state.version, release.version); assert.equal(state.releaseNotes, release.releaseNotes)
  state = mergeUpdateInfo(state, 'error', 'Download interrupted')
  assert.equal(state.version, release.version); assert.equal(state.error, 'Download interrupted')
  state = mergeUpdateInfo(state, 'available', { version: '2.2.0' })
  assert.equal(state.version, '2.2.0'); assert.equal(state.error, undefined); assert.equal(state.filePath, undefined)
})

test('release notes accept native multi-version notes and bound input without rendering objects', () => {
  assert.equal(updateNotes([{ version: '2.1.0', note: 'First' }, { note: 'Second' }, { note: {} }, null]), 'First\n\nSecond')
  assert.equal(updateNotes({ note: 'Not an array' }), '')
  assert.equal(updateNotes('a'.repeat(200_001)).length, 200_000)
})

test('update progress includes zero and never displays invalid percentages', () => {
  assert.equal(updatePercent(0), 0); assert.equal(updatePercent(-3), 0)
  assert.equal(updatePercent(140), 100); assert.equal(updatePercent(NaN), 0)
  assert.equal(updatePercent(Infinity), 0); assert.equal(updatePercent(49.9), 49.9)
})
