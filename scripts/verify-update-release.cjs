const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib')
const yaml = require('js-yaml'), asar = require('@electron/asar')
const root = path.resolve(__dirname, '..')
async function hash(file, algorithm, encoding) {
  const digest = crypto.createHash(algorithm)
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk)
  return digest.digest(encoding)
}
async function verify(directory) {
  const version = require('../package.json').version
  const manifest = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'))
  const name = `Eclipse.Launcher.Setup.${version}.exe`, installer = path.join(directory, name)
  assert.equal(manifest.version, version); assert.equal(manifest.path, name)
  assert.equal(manifest.files.length, 1); assert.equal(manifest.files[0].url, name)
  assert.ok(Number.isFinite(Date.parse(manifest.releaseDate)))
  const stat = fs.statSync(installer), digest = await hash(installer, 'sha512', 'base64')
  assert.equal(manifest.files[0].size, stat.size)
  assert.equal(manifest.files[0].sha512, digest); assert.equal(manifest.sha512, digest)
  const fd = fs.openSync(installer, 'r'), magic = Buffer.alloc(2)
  try { fs.readSync(fd, magic, 0, 2, 0); assert.equal(magic.toString(), 'MZ') } finally { fs.closeSync(fd) }
  const blockmap = JSON.parse(zlib.gunzipSync(fs.readFileSync(installer + '.blockmap')))
  assert.ok(blockmap.version); assert.ok(blockmap.files?.length)
  const resources = path.join(directory, 'win-unpacked/resources')
  const config = yaml.load(fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8'))
  assert.equal(config.provider, 'github'); assert.equal(config.owner, 'PE4CE1'); assert.equal(config.repo, 'EclipseLauncher')
  assert.equal(config.updaterCacheDirName, 'eclipse-launcher-updater')
  const archive = path.join(resources, 'app.asar'), pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString())
  assert.equal(pkg.version, version); assert.equal(pkg.main, 'dist-electron/main.js')
  const files = asar.listPackage(archive).map(file => file.replace(/\\/g, '/'))
  for (const file of ['/dist/index.html', '/dist/overlay.html', '/dist-electron/main.js', '/dist-electron/preload.js']) assert.ok(files.includes(file), 'Missing packaged file: ' + file)
  assert.ok(files.some(file => /uiohook.*\.node$/i.test(file)), 'Native input module missing')
  assert.ok(files.includes('/electron/inputWorker.cjs'),'Isolated input worker missing')
  assert.ok(fs.existsSync(path.join(resources, 'app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe')))
  assert.ok(fs.existsSync(path.join(resources, 'app.asar.unpacked/electron/native/ProcessAudioCapture.exe')))
  const nativeRoot = path.join(resources, 'app.asar.unpacked/electron/native')
  for (const name of ['NativeVideoCapture.wgc.exe','NativeCaptureHost.exe','NativeDisplayInfo.exe','ProcessAudioCapture.apo.exe']) assert.ok(fs.existsSync(path.join(nativeRoot,name)), 'Missing native recording helper: '+name)
  const audioBuild = JSON.parse(asar.extractFile(archive,path.join('electron','native','audio-capture.json')).toString())
  assert.match(audioBuild.file,/^ProcessAudioCapture\.pcm\.[a-f0-9]{12}\.exe$/)
  assert.ok(fs.existsSync(path.join(nativeRoot,audioBuild.file)), 'Current native audio helper missing')
  assert.ok(asar.extractFile(archive,path.join('dist-electron','main.js')).toString().includes(audioBuild.file), 'Native audio helper manifest does not match the main bundle')
  const report = { version, installer: name, bytes: stat.size, sha512: digest, sha256: await hash(installer, 'sha256', 'hex'), metadataMatches: true, blockmapValid: true, packagedVersionMatches: true, githubProvider: config, upload: [name, name + '.blockmap', 'latest.yml'] }
  fs.writeFileSync(path.join(directory, 'release-verification.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  return report
}
if (require.main === module) verify(path.resolve(process.argv[2] || path.join(root, 'release/github-' + require('../package.json').version))).catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { verify, hash }
