const path = require('node:path')
const { build, Platform, Arch } = require('electron-builder')
const pkg = require('../package.json')
const { verify } = require('./verify-update-release.cjs')
const output = path.resolve(__dirname, '../release/github-' + pkg.version)
build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: { directories: { output } },
}).then(() => verify(output)).catch(error => { console.error(error); process.exitCode = 1 })
