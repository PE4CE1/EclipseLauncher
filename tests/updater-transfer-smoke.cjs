const { app } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const yaml = require('js-yaml'), { NsisUpdater } = require('electron-updater')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor')
const { verify, hash } = require('../scripts/verify-update-release.cjs')
const root = path.resolve(__dirname, '..'), directory = path.resolve(process.env.ECLIPSE_UPDATE_RELEASE_DIR || path.join(root, 'release/github-' + require('../package.json').version))
const temporary = process.env.ECLIPSE_SMOKE_TEMP
app.setPath('userData', temporary); app.setPath('sessionData', temporary)
app.on('window-all-closed', () => {})
let server
app.whenReady().then(async () => {
  const artifacts = await verify(directory)
  const manifest = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'))
  const requests = [], events = [], installation = [], quits = []
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'); requests.push(url.pathname)
    if (url.pathname.endsWith('/latest.yml')) {
      const data = structuredClone(manifest)
      if (url.pathname.startsWith('/bad/')) { data.sha512 = Buffer.alloc(64).toString('base64'); data.files[0].sha512 = data.sha512 }
      res.setHeader('content-type', 'text/yaml'); res.end(yaml.dump(data)); return
    }
    if (url.pathname.endsWith('/' + artifacts.installer)) {
      res.setHeader('content-type', 'application/octet-stream'); res.setHeader('content-length', artifacts.bytes)
      fs.createReadStream(path.join(directory, artifacts.installer)).pipe(res); return
    }
    res.writeHead(404); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  function updater(name, version, feed) {
    const folder = path.join(temporary, name); fs.mkdirSync(folder, { recursive: true })
    const adapter = {
      version, name: 'eclipse-launcher-test', isPackaged: true,
      appUpdateConfigPath: path.join(directory, 'win-unpacked/resources/app-update.yml'),
      userDataPath: folder, baseCachePath: folder,
      whenReady: async () => {}, quit: () => quits.push(name), relaunch: () => assert.fail('Unexpected relaunch'), onQuit() {},
    }
    const instance = new NsisUpdater(null, adapter)
    instance.httpExecutor = new ElectronHttpExecutor(() => {})
    if (feed) instance.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/${feed}/`, useMultipleRangeRequest: false })
    instance.autoDownload = false; instance.autoInstallOnAppQuit = false; instance.disableWebInstaller = true; instance.disableDifferentialDownload = true
    instance.logger = { info() {}, warn() {}, error() {}, debug() {} }
    for (const status of ['update-available', 'update-not-available', 'download-progress', 'update-downloaded', 'error']) instance.on(status, data => events.push({ name, status, version: data?.version, percent: data?.percent, message: data instanceof Error ? data.message : undefined }))
    // Keep the real NSIS handoff and its arguments; intercept the final spawn so this test cannot install anything.
    instance.spawnLog = async (executable, args) => { installation.push({ executable, args }); return true }
    return instance
  }
  const github = updater('github-feed-check', '1.3.1', null)
  const live = await github.checkForUpdates()
  assert.equal(live.isUpdateAvailable, true)
  assert.ok(live.updateInfo.files?.some(file => file.url.endsWith('.exe')))
  const good = updater('old-client', '2.0.0', 'good')
  const check = await good.checkForUpdates()
  assert.equal(check.isUpdateAvailable, true); assert.equal(check.updateInfo.version, artifacts.version)
  const downloaded = await good.downloadUpdate()
  assert.equal(downloaded.length, 1); assert.equal(await hash(downloaded[0], 'sha512', 'base64'), artifacts.sha512)
  good.quitAndInstall(false, true)
  await new Promise(setImmediate); await new Promise(setImmediate)
  assert.equal(installation.length, 1); assert.equal(installation[0].executable, downloaded[0])
  assert.ok(installation[0].args.includes('--updated')); assert.ok(installation[0].args.includes('--force-run'))
  assert.deepEqual(quits, ['old-client'])
  const current = updater('current-client', artifacts.version, 'good')
  assert.equal((await current.checkForUpdates()).isUpdateAvailable, false)
  const corrupt = updater('checksum-test', '2.0.0', 'bad')
  assert.equal((await corrupt.checkForUpdates()).isUpdateAvailable, true)
  await assert.rejects(corrupt.downloadUpdate(), /checksum|sha512/i)
  assert.ok(events.some(event => event.name === 'old-client' && event.status === 'update-downloaded'))
  assert.ok(!events.some(event => event.name === 'checksum-test' && event.status === 'update-downloaded'))
  const report = { version: artifacts.version, testedFrom: '2.0.0', liveGithubProviderVerified: true, liveGithubVersion: live.updateInfo.version, sameVersionRejected: true, realInstallerDownloaded: true, sha512Verified: true, invalidChecksumRejected: true, nsisHandoffVerified: true, installerExecuted: false, requests, events, installArguments: installation[0].args }
  fs.writeFileSync(path.join(directory, 'update-test-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await new Promise(resolve => server.close(resolve)); server = null; app.exit(0)
}).catch(error => { console.error(error); server?.closeAllConnections(); server?.close(); app.exit(1) })
setTimeout(() => { console.error('Real updater test timeout'); server?.closeAllConnections(); server?.close(); app.exit(1) }, 120000).unref()
