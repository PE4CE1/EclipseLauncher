const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkPageMotion(window, output) {
  const contents = window.webContents
  const evaluate = code => contents.executeJavaScript(code)
  const ready = async expression => {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await evaluate(expression)) return
      await wait(25)
    }
    throw new Error('Page motion timeout: ' + expression)
  }
  const frame = async () => { contents.invalidate(); await contents.capturePage() }
  const screenshot = async name => {
    for (let index = 0; index < 3; index++) { await frame(); await wait(60) }
    fs.writeFileSync(path.join(output, name), (await contents.capturePage()).toPNG())
  }
  const hasReveal = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAnimations().some(animation=>{
    const frames=animation.effect.getKeyframes();
    return frames.some(frame=>Number(frame.opacity)===.78)&&frames.every(frame=>!frame.transform);
  })`)
  const box = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  const sameBox = (before, after, label) => {
    for (const key of Object.keys(before)) assert.ok(Math.abs(before[key] - after[key]) < .5, `${label} ${key}: ${JSON.stringify({before,after})}`)
  }
  const navigate = async (id, view) => {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`)
    await ready(`!!document.querySelector('[data-view-scene="${view}"]')`)
    assert.equal(await hasReveal(`[data-view-scene="${view}"]`), true, view + ' must reveal the ready destination without translation')
  }
  const report = { views: [], settingsTabs: [], clipTabs: [] }
  fs.mkdirSync(output, { recursive: true })
  contents.debugger.attach('1.3')
  try {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))`)
    await navigate('nav-catalogue', 'catalogue')
    const firstCard = '[data-catalogue-results] .grid > :first-child'
    await ready(`!!document.querySelector('[data-catalogue-results] .skeleton')`)
    const skeleton = await box(firstCard)
    const search = await box('#catalogue-search')
    const filters = await box('.catalogue-filters')
    await ready(`document.querySelectorAll('[id^="cat-db-"]').length===30`)
    await frame()
    sameBox(skeleton, await box(firstCard), 'Skeleton to loaded catalogue card')
    sameBox(search, await box('#catalogue-search'), 'Catalogue search')
    sameBox(filters, await box('.catalogue-filters'), 'Catalogue sidebar')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[id^="cat-db-"]')).contentVisibility`), 'visible')
    const stableCard = await box(firstCard)
    for (let sample = 0; sample < 5; sample++) {
      await frame(); await wait(40)
      sameBox(stableCard, await box(firstCard), 'Catalogue opening frame ' + sample)
    }
    // A short result set must not change the column width when its scrollbar disappears.
    await evaluate(`window.__catalogueScroller=document.querySelector('.catalogue-scroll');window.__catalogueHeight=window.__catalogueScroller.style.height;window.__catalogueScroller.style.overflowY='hidden';true`)
    sameBox(search, await box('#catalogue-search'), 'Catalogue scrollbar gutter')
    await evaluate(`window.__catalogueScroller.style.overflowY='auto'`)
    await screenshot('catalogue.png')
    await evaluate(`document.querySelector('[id^="cat-db-"]').click()`)
    await ready(`!!document.querySelector('.game-detail-modal-overlay')`)
    sameBox(filters, await box('.catalogue-filters'), 'Covered catalogue sidebar')
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
    await ready(`!document.querySelector('.game-detail-modal-overlay')`)
    sameBox(stableCard, await box(firstCard), 'Restored catalogue card')
    await evaluate(`[...document.querySelectorAll('.catalogue-scroll button')].find(button=>button.textContent.trim()==='2').click()`)
    await ready(`!!document.querySelector('#cat-db-16000031')`)
    assert.equal(await hasReveal('[data-catalogue-results]'), true, 'Catalogue pagination needs one grid reveal')
    assert.equal(await evaluate(`document.querySelector('[id^="cat-db-"]').getAnimations().length`), 0, 'Cards must not run competing entry animations')
    report.catalogue = { skeletonMatchesCards: true, stableOpeningFrames: true, stableScrollbar: true, sidebarRetained: true, paginationReveal: true }
    report.views.push('catalogue')

    for (const view of ['library', 'downloads', 'settings']) {
      await navigate('nav-' + view, view)
      report.views.push(view)
      if (view === 'library') {
        for (const tab of ['installed', 'favorites', 'all']) {
          await evaluate(`document.getElementById('library-tab-${tab}').click()`)
          await ready(`!!document.querySelector('[data-library-results]')`)
          assert.equal(await hasReveal('[data-library-results]'), true, 'Library tabs need a single result reveal')
        }
        await evaluate(`document.getElementById('library-view-list').click()`)
        await wait(25)
        assert.equal(await hasReveal('[data-library-results]'), true)
        await evaluate(`document.getElementById('library-view-grid').click()`)
        report.libraryTransitions = true
      }
    }
    await ready(`!!document.getElementById('settings-tab-general')`)
    assert.equal(await evaluate(`[...document.querySelectorAll('main button')].some(button=>/^(Save Settings|Einstellungen speichern|Gespeichert)$/.test(button.textContent.trim()))`), false, 'Settings must not show a manual save button')
    const editInput = async (id, value) => {
      await evaluate(`(() => {const input=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    }
    const savedPath = path.join(output, 'SavedDownloads')
    const savedProfile = 'https://steamcommunity.com/id/eclipse-autosave-test'
    await editInput('settings-download-path', savedPath)
    await ready(`document.getElementById('settings-download-path').value===${JSON.stringify(savedPath)}`)
    await evaluate(`document.getElementById('settings-tab-profile').click()`)
    await ready(`!!document.getElementById('settings-steam-profile-url')`)
    await editInput('settings-steam-profile-url', savedProfile)
    await evaluate(`document.getElementById('nav-home').click()`)
    await ready(`!!document.querySelector('[data-view-scene="home"]')`)
    const savedSettings = await evaluate(`window.electronAPI.getSettings()`)
    assert.equal(savedSettings.downloadPath, savedPath, 'Typed download paths must reach desktop persistence without Save')
    assert.equal(savedSettings.steamProfileUrl, savedProfile, 'Typed Steam profile URLs must reach desktop persistence without Save')
    await navigate('nav-settings', 'settings')
    await ready(`!!document.getElementById('settings-tab-general')`)
    await evaluate(`document.getElementById('settings-tab-general').click()`)
    await ready(`!!document.getElementById('settings-download-path')`)
    assert.equal(await evaluate(`document.getElementById('settings-download-path').value`), savedPath, 'Automatic settings must survive leaving and reopening Settings')
    report.settingsAutosave = { noSaveButton: true, downloadPath: true, steamProfileUrl: true, survivesNavigation: true }
    await evaluate(`window.__settingsCheckbox=document.querySelector('.settings-scroll input[type="checkbox"]');window.__settingsCheckbox.click()`)
    await wait(60)
    assert.equal(await evaluate(`window.__settingsCheckbox===document.querySelector('.settings-scroll input[type="checkbox"]')`), true, 'Settings updates must not remount their checkbox controls')
    await evaluate(`document.querySelector('.settings-scroll').scrollTop=500`)
    for (const tab of ['downloads', 'storage', 'notifications', 'gameplay', 'integrations', 'system', 'profile', 'plugins', 'addons', 'general']) {
      await evaluate(`document.getElementById('settings-tab-${tab}').click()`)
      await ready(`!!document.querySelector('[data-settings-scene="${tab}"]')`)
      assert.equal(await hasReveal('[data-settings-scene]'), true, tab + ' settings need a destination reveal')
      const state = await evaluate(`(() => {const scene=document.querySelector('[data-settings-scene]');const style=getComputedStyle(scene.firstElementChild);return{scroll:document.querySelector('.settings-scroll').scrollTop,count:document.querySelectorAll('[data-settings-scene]').length,opacity:style.opacity,transform:style.transform}})()`)
      assert.equal(state.scroll, 0, tab + ' must reset scroll before painting')
      assert.equal(state.count, 1, 'Settings must never retain an outgoing tab')
      assert.equal(state.opacity, '1', tab + ' content must not have a second fade from zero')
      assert.equal(state.transform, 'none', tab + ' content must not move its text')
      report.settingsTabs.push(tab)
    }
    await screenshot('settings.png')
    for (const tab of ['notifications', 'general', 'system', 'general']) {
      await evaluate(`document.getElementById('settings-tab-${tab}').click()`)
      await wait(30)
    }
    assert.equal(await evaluate(`document.querySelectorAll('[data-settings-scene]').length`), 1)
    report.settings = { controlsRetained: true, noBlankTab: true, resetScrollBeforePaint: true, rapidNavigation: true }

    for (const [menu, view] of [['profile', 'profile'], ['notifications', 'notifications'], ['clips', 'clips']]) {
      await evaluate(`document.getElementById('sidebar-profile-menu').click()`)
      await ready(`!!document.getElementById('sidebar-open-${menu}')`)
      await navigate('sidebar-open-' + menu, view)
      report.views.push(view)
    }
    await ready(`!!document.getElementById('clips-open-settings')`)
    await evaluate(`document.getElementById('clips-open-settings').click()`)
    await ready(`!!document.querySelector('[data-clip-settings-scene="capture"]')`)
    for (const tab of ['video', 'audio', 'hotkeys', 'storage', 'screen', 'autoclip', 'capture']) {
      await evaluate(`document.getElementById('clip-settings-tab-${tab}').click()`)
      await ready(`!!document.querySelector('[data-clip-settings-scene="${tab}"]')`)
      assert.equal(await hasReveal('[data-clip-settings-scene]'), true)
      assert.equal(await evaluate(`document.querySelectorAll('[data-clip-settings-scene]').length`), 1)
      report.clipTabs.push(tab)
    }
    await evaluate(`[...document.querySelectorAll('button')].find(button=>/^(Zurück zu Clips|Back to Clips)$/.test(button.textContent.trim())).click()`)
    await ready(`!!document.getElementById('clips-open-settings')`)
    await navigate('sidebar-open-info', 'eclipse-info')
    report.views.push('eclipse-info')
    await navigate('nav-home', 'home')
    report.views.push('home')
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await evaluate(`document.getElementById('nav-library').click()`)
    await ready(`!!document.querySelector('[data-view-scene="library"]')`)
    assert.equal(await evaluate(`document.querySelector('[data-view-scene="library"]').getAnimations().length`), 0)
    report.reducedMotion = true
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'));document.getElementById('nav-settings').click()`)
    await ready(`!!document.querySelector('[data-view-scene="settings"]')`)
    assert.equal(await evaluate(`document.querySelector('[data-view-scene="settings"]').getAnimations().length`), 0)
    report.unfocusedMotionSuppressed = true
    await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));document.getElementById('settings-tab-general').click();document.getElementById('nav-home').click()`)
    await ready(`!!document.querySelector('[data-view-scene="home"]')`)
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2))
    return report
  } finally { contents.debugger.detach() }
}
