const { app, BrowserWindow, session } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const output = path.resolve('.cache/nonsteam'), errors = [], network = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
let window
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/.test(details.url)) network.push(details.url)
    callback({ cancel: /^https?:/.test(details.url) })
  })
  window = new BrowserWindow({ show: false, width: 1100, height: 650, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  window.webContents.setFrameRate(30)
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  await window.loadFile(path.join(output, 'fixture/tests/non-steam-fixture.html'))
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  const deadline = Date.now() + 8000
  let loaded = false
  while (Date.now() < deadline) {
    loaded = await evaluate('document.querySelectorAll("[data-game] img").length===4&&[...document.querySelectorAll("[data-game] img")].every(image=>image.complete&&image.naturalWidth>0&&image.src.startsWith("file:")&&getComputedStyle(image).opacity==="1")')
    if (loaded) break
    await wait(40)
  }
  assert.equal(loaded, true, 'All posters and heroes must render offline despite stale Steam IDs')
  assert.deepEqual(network, [], 'Built-in game artwork must require no network request')
  assert.deepEqual(errors, [])
  const images = await evaluate('[...document.querySelectorAll("[data-game] img")].map(image=>({width:image.naturalWidth,height:image.naturalHeight,opacity:getComputedStyle(image).opacity,renderWidth:image.getBoundingClientRect().width,renderHeight:image.getBoundingClientRect().height}))')
  fs.mkdirSync(output, { recursive: true })
  for (let attempt = 0; attempt < 5; attempt++) {
    try { window.webContents.invalidate(); await wait(350); fs.writeFileSync(path.join(output, 'non-steam-artwork.png'), (await window.webContents.capturePage()).toPNG()); break }
    catch (error) { if (attempt === 4 || !/UnknownVizError/.test(String(error))) throw error }
  }
  const report = { offlinePostersAndHeroes: true, staleSteamIdsIgnored: true, networkRequests: network.length, images, rendererErrors: errors }
  fs.writeFileSync(path.join(output, 'artwork-verification.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  window.destroy(); app.exit(0)
}).catch(error => { console.error(error); window?.destroy(); app.exit(1) })
setTimeout(() => app.exit(1), 20000).unref()
