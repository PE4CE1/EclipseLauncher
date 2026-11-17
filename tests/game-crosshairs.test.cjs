const test = require('node:test'), assert = require('node:assert/strict'), load = require('./download-loader.cjs')
const loader = load(), { identifyCrosshairGame, getGameCrosshairProfile, patchGameCrosshair, resolveGameCrosshair } = loader('src/services/gameCrosshairs.ts')
const { normalizeCrosshair } = loader('src/services/crosshairConfig.ts')
const { rememberCrosshair } = loader('src/services/crosshairProfiles.ts')
const { buildOverlayData, hasDesktopWidgets } = loader('electron/overlayState.ts')
const design = (preset, offsetX = 0) => normalizeCrosshair({ preset, offsetX })

test('game crosshairs recognize canonical names and exact game binaries without matching launchers or other Counter-Strike versions', () => {
  for (const [game, id] of [
    [{ name: ' VALORANT™ ' }, 'valorant'], [{ name: 'Fortnite®' }, 'fortnite'],
    [{ name: 'Counter-Strike 2' }, 'cs2'], [{ name: 'Counter Strike 2' }, 'cs2'], [{ name: 'CS2' }, 'cs2'],
    [{ name: 'Custom title', exeName: 'C:\\Games\\VALORANT-Win64-Shipping.exe' }, 'valorant'],
    [{ exeName: 'FortniteClient-Win64-Shipping.exe' }, 'fortnite'], [{ exeName: 'CS2.EXE' }, 'cs2'],
  ]) assert.equal(identifyCrosshairGame(game), id)
  for (const game of [null, { name: 'VALORANT Tracker' }, { exeName: 'VALORANT.exe' }, { name: 'Counter-Strike: Global Offensive', exeName: 'csgo.exe' }, { name: 'Counter-Strike 2 SDK' }, { exeName: 'FortniteLauncher.exe' }]) assert.equal(identifyCrosshairGame(game), undefined)
})

test('enabling a game snapshots the general design and keeps subsequent game and general changes independent', () => {
  let settings = { overlayCrosshair: false, crosshairConfig: design('circle', 17) }
  settings = { ...settings, ...patchGameCrosshair(settings, 'valorant', { overlayCrosshair: true }) }
  assert.equal(settings.overlayCrosshair, false)
  assert.equal(getGameCrosshairProfile(settings, 'valorant').config.offsetX, 17)
  settings = { ...settings, crosshairConfig: design('square', -5) }
  settings = { ...settings, ...patchGameCrosshair(settings, 'fortnite', { overlayCrosshair: true }) }
  settings = { ...settings, ...patchGameCrosshair(settings, 'valorant', { crosshairConfig: design('x', 80) }) }
  assert.equal(settings.crosshairConfig.preset, 'square')
  assert.equal(getGameCrosshairProfile(settings, 'fortnite').config.offsetX, -5)
  assert.equal(getGameCrosshairProfile(settings, 'valorant').config.offsetX, 80)
})

test('per-design preferences survive game changes and disk round trips without sharing positions', () => {
  const a = design('dot', 25), b = design('circle', -40)
  let settings = { crosshairConfig: design('cs2') }
  settings = { ...settings, ...patchGameCrosshair(settings, 'valorant', { overlayCrosshair: true, crosshairConfig: a, crosshairProfiles: rememberCrosshair({}, a) }) }
  settings = { ...settings, ...patchGameCrosshair(settings, 'cs2', { overlayCrosshair: true, crosshairConfig: b, crosshairProfiles: rememberCrosshair({}, b) }) }
  settings = JSON.parse(JSON.stringify(settings))
  assert.equal(getGameCrosshairProfile(settings, 'valorant').designs['preset:dot'].offsetX, 25)
  assert.equal(getGameCrosshairProfile(settings, 'cs2').designs['preset:circle'].offsetX, -40)
  assert.equal(getGameCrosshairProfile(settings, 'valorant').designs['preset:circle'], undefined)
})

test('game profiles replace the general crosshair and never leak to another game or the desktop', () => {
  const settings = { overlayCrosshair: true, overlayGeneralAlwaysOn: true, crosshairConfig: design('dot'), overlayGameCrosshairs: {
    valorant: { enabled: true, config: design('x') }, fortnite: { enabled: true, config: design('circle') }, cs2: { enabled: true, config: design('square') },
  } }
  for (const [name, preset] of [['VALORANT', 'x'], ['Fortnite', 'circle'], ['Counter-Strike 2', 'square'], ['Rocket League', 'dot']]) {
    const data = buildOverlayData(settings, { name }, 500)
    assert.equal(data.settings.crosshair, true); assert.equal(data.settings.crosshairConfig.preset, preset)
    assert.equal(data.settings.overlayGameCrosshairs, undefined, 'Only the active image is sent to the HUD')
  }
  assert.equal(buildOverlayData(settings, null).settings.crosshairConfig.preset, 'dot')
  settings.overlayCrosshair = false
  assert.equal(hasDesktopWidgets(buildOverlayData(settings, null)), false)
  assert.equal(hasDesktopWidgets(buildOverlayData(settings, { name: 'Unrelated game' })), false)
  assert.equal(hasDesktopWidgets(buildOverlayData(settings, { name: 'Fortnite' })), true)
})

test('disabling a game restores the general crosshair and preserves its saved game design', () => {
  let settings = { overlayCrosshair: true, crosshairConfig: design('dot') }
  settings = { ...settings, ...patchGameCrosshair(settings, 'cs2', { overlayCrosshair: true, crosshairConfig: design('x', 24) }) }
  settings = { ...settings, ...patchGameCrosshair(settings, 'cs2', { overlayCrosshair: false }) }
  assert.equal(resolveGameCrosshair(settings, { name: 'CS2' }).config.preset, 'dot')
  settings.overlayCrosshair = false
  assert.equal(resolveGameCrosshair(settings, { name: 'CS2' }).enabled, false)
  assert.equal(getGameCrosshairProfile(settings, 'cs2').config.offsetX, 24)
})

test('PNG designs remain images while disabled profiles stay off and favorites stay shared', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
  let settings = { crosshairConfig: design('dot') }
  settings = { ...settings, ...patchGameCrosshair(settings, 'fortnite', { crosshairConfig: { ...design('cs2'), mode: 'image', imageData, imageSize: 64, offsetY: -9 } }) }
  const profile = getGameCrosshairProfile(JSON.parse(JSON.stringify(settings)), 'fortnite')
  assert.equal(profile.enabled, false); assert.equal(profile.config.mode, 'image'); assert.equal(profile.config.imageData, imageData)
  assert.equal(profile.config.imageSize, 64); assert.equal(profile.config.offsetY, -9)
  const favorites = [{ page: 'test' }], patch = patchGameCrosshair(settings, 'fortnite', { crosshairFavorites: favorites })
  assert.deepEqual(patch, { crosshairFavorites: favorites })
  assert.deepEqual(patchGameCrosshair(settings, 'fortnite', { language: 'de' }), {})
})
