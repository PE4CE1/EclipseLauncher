const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const loadTs = require('./download-loader.cjs')

function tempDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-storage-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('storage counts nested game assets beyond the first subdirectory', async t => {
  const root = tempDirectory(t)
  fs.mkdirSync(path.join(root, 'a/b/c'), { recursive: true })
  fs.writeFileSync(path.join(root, 'root.bin'), Buffer.alloc(10))
  fs.writeFileSync(path.join(root, 'a/b/c/asset.bin'), Buffer.alloc(100))
  const { getFolderSizeAsync, calculateGameSizes } = loadTs({ electron: {}, './ipcSecurity': { ipcMain: {} } })('electron/storageService.ts')
  assert.equal(await getFolderSizeAsync(root), 110)
  const result = await calculateGameSizes([null, { id: 'game', installPath: root, platform: 'custom' }])
  assert.equal(result.length, 1)
  assert.equal(result[0].sizeBytes, 110)
})

test('storage skips symbolic-link directory entries rather than traversing their assets', async t => {
  const root = tempDirectory(t)
  const outside = path.join(root, 'external')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(root, 'game.bin'), Buffer.alloc(20))
  fs.writeFileSync(path.join(outside, 'unrelated.bin'), Buffer.alloc(500))
  const mockFs = { ...fs, promises: { ...fs.promises, readdir: async (...args) => {
    const entries = await fs.promises.readdir(...args)
    return entries.map(entry => entry.name === 'external' ? {
      name: entry.name, isSymbolicLink: () => true, isDirectory: () => true, isFile: () => false,
    } : entry)
  } } }
  const { getFolderSizeAsync } = loadTs({ fs: mockFs, electron: {}, './ipcSecurity': { ipcMain: {} } })('electron/storageService.ts')
  assert.equal(await getFolderSizeAsync(root), 20)
})

test('download names and paths reject traversal, reserved Windows names and unsupported protocols', t => {
  const root = tempDirectory(t)
  const { safeDownloadName, containedDownloadPath, downloadUrl } = loadTs()('electron/downloadPaths.ts')
  assert.equal(safeDownloadName('..'), 'game_download')
  assert.equal(safeDownloadName('CON.txt'), '_CON.txt')
  assert.equal(safeDownloadName('../Test/Game?'), '..TestGame')
  assert.throws(() => containedDownloadPath(root, '../escape.zip'))
  assert.throws(() => downloadUrl('file:///C:/secret'))
  assert.throws(() => downloadUrl('https://user:pass@example.com/file'))
})

test('torrent base32 and hexadecimal magnet identifiers resolve to the same canonical hash', () => {
  const { magnetInfoHash } = loadTs({ electron: {}, './extractService': {} })('electron/torrentService.ts')
  assert.equal(magnetInfoHash('magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), '0'.repeat(40))
  assert.equal(magnetInfoHash('magnet:?xt=urn%3Abtih%3A' + 'ABCDEF0123'.repeat(4)), 'abcdef0123'.repeat(4))
  assert.throws(() => magnetInfoHash('magnet:?xt=urn:btih:invalid'))
})

test('archive listing rejects escaping paths, absolute paths and links', t => {
  const root = tempDirectory(t)
  const { validateArchiveListing } = loadTs()('electron/extractService.ts')
  for (const listing of ['Path = ../escape.exe', 'Path = C:\\escape.exe', 'Path = /tmp/escape', 'Path = game\\..\\escape', 'Path = game.exe\nSymbolic Link = ../other']) {
    assert.throws(() => validateArchiveListing(listing, root))
  }
  assert.deepEqual(validateArchiveListing('Path = Game\\bin\\game.exe', root), [path.join(root, 'Game/bin/game.exe')])
})

test('real ZIP extraction completes, locates the game executable and deletes archives only on success', async t => {
  const root = tempDirectory(t)
  const input = path.join(root, 'input')
  const output = path.join(root, 'output')
  fs.mkdirSync(input)
  fs.writeFileSync(path.join(input, 'game.exe'), 'game binary')
  const archive = path.join(root, 'game.zip')
  const { extractArchive, get7zPath } = loadTs()('electron/extractService.ts')
  const zipped = spawnSync(get7zPath(), ['a', '-tzip', archive, 'game.exe'], { cwd: input, windowsHide: true })
  assert.equal(zipped.status, 0, zipped.stderr?.toString())
  const result = await extractArchive(archive, output, undefined, true)
  assert.equal(result.mainExe, path.join(output, 'game.exe'))
  assert.equal(fs.readFileSync(result.mainExe, 'utf8'), 'game binary')
  assert.equal(fs.existsSync(archive), false)
})

test('the bundled extractor runs 7-Zip 26.05 and includes RAR and RAR5 decoding', () => {
  const { get7zPath } = loadTs()('electron/extractService.ts')
  const result = spawnSync(get7zPath(), ['i'], { windowsHide: true, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /7-Zip(?: \([^)]*\))? 26\.05/)
  assert.match(result.stdout, /\bRar\b/)
  assert.match(result.stdout, /\bRar5\b/)
})

test('packaged extraction prefers the unpacked binary and requires its Windows codec library', () => {
  const packed = path.join(__dirname, 'app.asar', 'node_modules', '7zip-bin-full', 'win', process.arch, '7z.exe')
  const unpacked = packed.replace('app.asar', 'app.asar.unpacked')
  const files = new Set([packed, unpacked, path.join(path.dirname(unpacked), '7z.dll')])
  const { get7zPath } = loadTs({
    fs: { existsSync: file => files.has(file) },
    '7zip-bin-full': { path7z: packed },
  })('electron/extractService.ts')
  assert.equal(get7zPath(), unpacked)
  if (process.platform === 'win32') {
    files.delete(path.join(path.dirname(unpacked), '7z.dll'))
    assert.throws(get7zPath, /codec library is missing/)
  }
})
