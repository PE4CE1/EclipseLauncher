const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const directory = __dirname
const temporary = fs.mkdtempSync(path.join(directory, '.electron-smoke-'))
const entry = process.env.ECLIPSE_CLIPS_TOAST ? 'clips-toast-runtime-smoke.cjs' : process.env.ECLIPSE_PROFILE ? 'profile-redesign-smoke.cjs' : process.env.ECLIPSE_RL_SESSION ? 'rl-session-smoke.cjs' : process.env.ECLIPSE_OVERLAY_RUNTIME ? 'overlay-runtime-smoke.cjs' : process.env.ECLIPSE_RELEASE_NOTES ? 'release-notes-smoke.cjs' : process.env.ECLIPSE_OVERLAY_SETTINGS ? 'overlay-settings-smoke.cjs' : process.env.ECLIPSE_CLIP_GALLERY ? 'clip-gallery-smoke.cjs' : process.env.ECLIPSE_CLIP_STUDIO ? 'clip-studio-smoke.cjs' : process.env.ECLIPSE_GAME_MEDIA ? 'game-media-smoke.cjs' : process.env.ECLIPSE_STORE_PREVIEW ? 'store-ui-smoke.cjs' : process.env.ECLIPSE_LAUNCH_PREVIEW ? 'launch-screen-preview.cjs' : 'electron-smoke.cjs'
const selectedEntry = process.env.ECLIPSE_INPUT_WORKER ? 'input-worker-runtime.cjs' : process.env.ECLIPSE_SYSTEM_STARTUP ? 'autostart-native-smoke.cjs' : process.env.ECLIPSE_UPDATER_TRANSFER ? 'updater-transfer-smoke.cjs' : process.env.ECLIPSE_UPDATE_UI ? 'update-design-smoke.cjs' : process.env.ECLIPSE_RAM_REPLAY ? 'ram-replay-smoke.cjs' : process.env.ECLIPSE_FRIENDS_UI ? 'friends-ui-smoke.cjs' : process.env.ECLIPSE_DEALS_UI ? 'deals-ui-smoke.cjs' : process.env.ECLIPSE_HOME_PREVIEW ? 'home-preview-smoke.cjs' : process.env.ECLIPSE_DOWNLOAD_TRANSFER_UI ? 'download-transfer-ui-smoke.cjs' : process.env.ECLIPSE_SETTINGS_UI ? 'settings-ui-smoke.cjs' : process.env.ECLIPSE_HOSTER_TRANSPORT ? 'hoster-transport-audit.cjs' : process.env.ECLIPSE_DOWNLOAD_METADATA ? 'download-source-metadata.cjs' : process.env.ECLIPSE_DOWNLOAD_UI ? 'download-ui-smoke.cjs' : process.env.ECLIPSE_DOWNLOAD_AUTO ? 'download-automatic-smoke.cjs' : process.env.ECLIPSE_SOURCE_AUDIT ? 'source-native-audit.cjs' : process.env.ECLIPSE_CLIP_EXPERIENCE ? 'clip-experience-smoke.cjs' : process.env.ECLIPSE_ROBLOX ? 'roblox-smoke.cjs' : process.env.ECLIPSE_NON_STEAM ? 'non-steam-smoke.cjs' : process.env.ECLIPSE_ACCOUNT ? 'account-protection-smoke.cjs' : entry
const child = spawn(require('electron'), [...process.argv.slice(2), path.join(directory, process.env.ECLIPSE_SOCIAL_STATE ? 'social-state-runtime-smoke.cjs' : process.env.ECLIPSE_NATIVE_CAPTURE ? 'native-capture-runtime.cjs' : process.env.ECLIPSE_NATIVE_MICROPHONE ? 'native-microphone-capture-smoke.cjs' : process.env.ECLIPSE_MIC_DEVICES ? 'microphone-device-audit.cjs' : selectedEntry)], {
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, ECLIPSE_SMOKE_TEMP: temporary },
})
child.once('error', error => { console.error(error); process.exitCode = 1 })
child.once('close', code => {
  const target = path.resolve(temporary)
  if (path.dirname(target) === path.resolve(directory) && /^\.electron-smoke-[\w-]+$/.test(path.basename(target))) {
    try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
    catch (error) { console.warn('Unable to remove isolated smoke-test data:', error.message) }
  }
  process.exitCode = code === 0 ? 0 : 1
})
