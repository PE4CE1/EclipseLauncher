const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')
const installed = 'C:\\Users\\Example\\AppData\\Local\\Programs\\eclipse-launcher\\Eclipse Launcher\\Eclipse Launcher.exe'
const development = 'C:\\Users\\Example\\Desktop\\Eclipse Launcher\\node_modules\\electron\\dist\\electron.exe'

test('only proven bare-Electron and duplicate Eclipse commands are retired', () => {
  const { isLegacyEclipseStartup: legacy } = load()('electron/legacyAutoLaunch.ts')
  assert.equal(legacy({ name: development, command: '"'+development+'"' }, installed), true)
  assert.equal(legacy({ name: installed, command: installed }, installed), true)
  assert.equal(legacy({ name: 'Eclipse Launcher', command: installed }, installed), true)
  for (const entry of [
    { name: 'com.eclipse.launcher', command: '"'+installed+'" --autostart' },
    { name: development, command: '"'+development+'" "C:\\Projects\\app"' },
    { name: 'Other Electron app', command: '"'+development+'"' },
    { name: 'C:\\Other\\electron.exe', command: '"C:\\Other\\electron.exe"' },
    { name: 'Eclipse Launcher', command: 'C:\\Other\\Eclipse Launcher.exe' },
    { name: installed, command: '"'+installed+'" --custom-option' },
  ]) assert.equal(legacy(entry, installed), false, JSON.stringify(entry))
})

function fixture({ changed = false, diskError = false } = {}) {
  const operations = [], backups = []
  const query = name => `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    ${name}    REG_SZ    "${development}"\r\n`
  const service = load({
    'node:child_process': { execFile(exe, args, options, callback) {
      assert.equal(exe, 'reg.exe'); assert.equal(options.windowsHide, true)
      operations.push(args)
      callback(null, args[0] === 'query' ? args.includes('/v') && changed ? '' : query(development) : '')
    } },
    './jsonStorage': { writeJsonAtomicSync(file, value) { if (diskError) throw Error('Disk full'); backups.push(value) } },
  })('electron/legacyAutoLaunch.ts')
  return { service, operations, backups }
}

test('cleanup backs up exact commands, rechecks each value, and never touches StartupApproved', async () => {
  const f = fixture()
  assert.equal(await f.service.cleanupLegacyAutoLaunch(installed, 'C:/Test', 'win32'), 1)
  assert.equal(f.backups[0].entries[0].name, development)
  assert.deepEqual(f.operations.map(args => args[0]), ['query', 'query', 'delete'])
  assert.ok(f.operations.every(args => !args.some(arg => /StartupApproved/.test(arg))))
})

test('backup failure and concurrent registry edits prevent removal', async () => {
  const failed = fixture({ diskError: true })
  await assert.rejects(failed.service.cleanupLegacyAutoLaunch(installed, 'C:/Test', 'win32'), /Disk full/)
  assert.equal(failed.operations.some(args => args[0] === 'delete'), false)
  const changed = fixture({ changed: true })
  assert.equal(await changed.service.cleanupLegacyAutoLaunch(installed, 'C:/Test', 'win32'), 0)
  assert.equal(changed.operations.some(args => args[0] === 'delete'), false)
})

test('non-Windows launches make no registry calls', async () => {
  const f = fixture()
  assert.equal(await f.service.cleanupLegacyAutoLaunch(installed, 'C:/Test', 'linux'), 0)
  assert.equal(f.operations.length, 0)
})
