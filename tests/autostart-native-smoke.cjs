const { app } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createAutoLaunchSettings } = require('./download-loader.cjs')()('electron/autoLaunchSettings.ts')
const entryName = `Eclipse-Autostart-Test-${process.pid}-${Date.now()}`
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setAppUserModelId(entryName)
app.whenReady().then(() => {
  const facade = { isPackaged: true, getLoginItemSettings: options => app.getLoginItemSettings(options), setLoginItemSettings: options => app.setLoginItemSettings(options) }
  const service = createAutoLaunchSettings(facade, process.execPath, 'win32', entryName)
  const stages = []
  try {
    for (const minimized of [false, true, false]) {
      const state = service.apply(true, minimized)
      assert.equal(state.enabled, true)
      const options = { path: process.execPath, args: ['--autostart', ...(minimized ? ['--hidden'] : [])] }
      const raw = app.getLoginItemSettings(options)
      const own = raw.launchItems.find(item => item.name === entryName)
      assert.ok(own, 'The unique test entry must exist')
      assert.equal(raw.openAtLogin, true)
      assert.equal(app.getLoginItemSettings({ path: process.execPath, args: ['--autostart', ...(minimized ? [] : ['--hidden'])] }).openAtLogin, false, 'A different startup command must not match')
      stages.push({ minimized, registered: state.registered, enabled: state.enabled })
    }
    assert.equal(service.apply(true, false, false).blocked, true)
    assert.equal(service.reconcile(true, true).blocked, true)
    assert.equal(service.apply(true, true, false).enabled, false)
    assert.equal(service.apply(true, true, true).enabled, true)
    assert.equal(service.apply(false, false).registered, false)
  } finally {
    app.setLoginItemSettings({ name: entryName, path: process.execPath, args: ['--autostart'], openAtLogin: false })
    assert.ok(!app.getLoginItemSettings({ path: process.execPath }).launchItems.some(item => item.name === entryName), 'The temporary startup entry must be removed')
  }
  const report = { windowsAPI: true, executablePathContainsSpaces: process.execPath.includes(' '), enabledAndDisabled: true, startupFlagsVerified: true, minimizedFlagsVerified: true, windowsDisabledStatePreserved: true, temporaryEntryRemoved: true, actualLoginPerformed: false, stages }
  fs.writeFileSync(path.join(__dirname, '../.cache/autostart-native-verification.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2)); app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
