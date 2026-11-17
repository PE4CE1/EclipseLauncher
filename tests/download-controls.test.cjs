const test = require('node:test'), assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

test('download commands go only to the owner and expose transport and engine failures', async () => {
  const { controlDownload } = loadTs()('electron/downloadControls.ts'), calls = []
  await controlDownload(async channel => { calls.push(channel); return { handled: true, success: true } }, 'pause', 'id')
  assert.deepEqual(calls, ['http-download:pause'])
  calls.length = 0
  await controlDownload(async channel => { calls.push(channel); return { handled: channel.startsWith('torrent:'), success: true } }, 'resume', 'id')
  assert.deepEqual(calls, ['http-download:resume', 'torrent:resume'])
  await assert.rejects(controlDownload(async () => { throw new Error('IPC disconnected') }, 'cancel', 'id'), /IPC disconnected/)
  await assert.rejects(controlDownload(async () => ({ handled: true, success: false, error: 'Disk busy' }), 'cancel', 'id'), /Disk busy/)
  await assert.rejects(controlDownload(async () => ({ handled: false }), 'pause', 'id'), /no longer available/)
  await controlDownload(async () => ({ handled: false }), 'cancel', 'already-completed')
})

test('speed history records measured values, coalesces bursts and stays bounded', () => {
  const { sampleDownloadSpeed } = loadTs()('src/services/downloadHistory.ts')
  let history = []
  for (let at = 0; at < 400_000; at += 1000) history = sampleDownloadSpeed(history, at, at)
  assert.equal(history.length, 121)
  assert.equal(history.at(-1).speed, 399_000)
  const merged = sampleDownloadSpeed(history, 399_100, 27)
  assert.equal(merged.length, 120)
  assert.equal(merged.at(-1).speed, 27)
  assert.equal(sampleDownloadSpeed(merged, 10, 44), merged)
  assert.equal(sampleDownloadSpeed(merged, 400_000, -1).at(-1).speed, 0)
})

test('cancelled tasks ignore late progress and an explicit new start can reuse their ID', () => {
  const previous = global.window; let receive
  global.window = { electronAPI: { onTorrentProgress: callback => { receive = callback } } }
  try {
    const { useDownloadStore } = loadTs({
      './gameStore': { useGameStore: { getState: () => ({ settings: { language: 'en' } }) } },
      '../services/notificationService': { sendAppNotification() {} },
    })('src/store/downloadStore.ts')
    const task = { infoHash: 'fixture', name: 'Game', progress: .2, downloaded: 20, length: 100, downloadSpeed: 10, timeRemaining: 8000, status: 'downloading' }
    receive(task)
    assert.equal(useDownloadStore.getState().speedHistory.fixture.at(-1).speed, 10)
    useDownloadStore.getState().removeDownload('fixture')
    receive(task)
    assert.equal(useDownloadStore.getState().downloads.fixture, undefined)
    assert.equal(useDownloadStore.getState().speedHistory.fixture, undefined)
    useDownloadStore.getState().addDownload({ ...task, progress: 0 })
    receive(task)
    assert.equal(useDownloadStore.getState().downloads.fixture.progress, .2)
    useDownloadStore.getState().addDownload({ ...task, progress: 0, coverUrl: 'fixture.jpg' })
    assert.equal(useDownloadStore.getState().downloads.fixture.progress, .2, 'Cover metadata must not reset newer progress')
  } finally { if (previous === undefined) delete global.window; else global.window = previous }
})

test('torrent pause closes existing connections; resume restores TCP peers and announces again', () => {
  const { pauseTorrentTransfer, resumeTorrentTransfer } = loadTs()('electron/torrentTransferControl.ts'), calls = []
  const torrent = {
    wires: [{ remoteAddress: '127.0.0.1', remotePort: 32100, destroy: () => calls.push('close') }],
    urlList: ['https://example.com/seed'], pause: () => calls.push('pause'), resume: () => calls.push('resume'),
    addPeer: peer => calls.push(peer), addWebSeed: seed => calls.push(seed), discovery: { tracker: { update: () => calls.push('announce') } },
  }
  pauseTorrentTransfer(torrent); resumeTorrentTransfer(torrent)
  assert.deepEqual(calls, ['pause','close','resume','127.0.0.1:32100','https://example.com/seed','announce'])
})
