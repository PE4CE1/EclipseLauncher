const { app, BrowserWindow, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const temporary = process.env.ECLIPSE_SMOKE_TEMP || fs.mkdtempSync(path.join(__dirname, '.electron-smoke-'))
const output = path.join(root, '.cache/launch-preview')
const version = require('../package.json').version
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', temporary)
app.setPath('sessionData', temporary)
const software = process.env.ECLIPSE_PREVIEW_CSS === '1'
const exitVideo = !software && process.env.ECLIPSE_PREVIEW_EXIT_VIDEO === '1'
if (software) app.commandLine.appendSwitch('disable-gpu')
const preload = path.join(temporary, 'preview-preload.cjs')
fs.writeFileSync(preload, `require('electron').contextBridge.exposeInMainWorld('electronAPI',{minimizeWindow(){},maximizeWindow(){},closeWindow(){}})`)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const errors = []
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  const window = new BrowserWindow({ show: false, frame: false, width: 1400, height: 900, webPreferences: {
    preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, webgl: false,
  } })
  window.webContents.on('console-message', event => {
    if (event.level === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(event.message)) errors.push(event.message)
  })
  try {
    await window.loadFile(path.join(root, 'dist/index.html'), { hash: 'launch-preview' })
    const evaluate = expression => window.webContents.executeJavaScript(expression)
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('.launch-screen')`)) break
      await wait(50)
    }
    await evaluate(`document.fonts.ready.then(()=>true)`)
    await wait(500)
    assert.equal(await evaluate(`document.querySelectorAll('.launch-screen').length`), 1)
    assert.equal(await evaluate(`document.querySelectorAll('.launch-screen canvas').length`), 0)
    assert.equal(await evaluate(`document.fonts.check('800 72px "Eclipse Display"')`), true)
    const state = await evaluate(`({engine:document.querySelector('.launch-atmosphere').dataset.renderer,font:getComputedStyle(document.querySelector('.launch-wordmark h1')).fontFamily,brand:document.querySelector('.launch-wordmark').innerText})`)
    assert.equal(state.engine, 'css')
    assert.equal(await evaluate('document.querySelector(".launch-screen__edition").textContent.trim()'), 'ECLIPSE · '+version)
    assert.equal(await evaluate('document.querySelector(".launch-atmosphere__version").textContent'), version)
    assert.ok(await evaluate('document.querySelector(".launch-screen__release").textContent').then(text=>text.endsWith(version)))
    const motionBefore = await evaluate(`[...document.querySelectorAll('.launch-atmosphere__scene *')].map(element=>getComputedStyle(element).transform)`)
    await wait(750)
    assert.notDeepEqual(await evaluate(`[...document.querySelectorAll('.launch-atmosphere__scene *')].map(element=>getComputedStyle(element).transform)`), motionBefore)
    await evaluate(`window.__initialLaunch=document.querySelector('.launch-screen');window.__initialAtmosphere=document.querySelector('.launch-atmosphere');true`)
    const capture = async name => fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG())
    await capture(software ? `eclipse-${version}-fallback.png` : `eclipse-${version}.png`)
    if (!software) {
      const markup = await evaluate(`(() => {const copy=document.querySelector('.launch-screen').cloneNode(true);copy.querySelector('.launch-window-controls')?.remove();return copy.outerHTML})()`)
      const font = fs.readFileSync(path.join(root, 'public/fonts/Oxanium-Variable.ttf')).toString('base64')
      const license = fs.readFileSync(path.join(root, 'public/fonts/OFL-Oxanium.txt'), 'utf8')
      const css = fs.readFileSync(path.join(root, 'src/components/splash/launch-screen.css'), 'utf8').replace('/fonts/Oxanium-Variable.ttf', `data:font/ttf;base64,${font}`)
      const script = `const screen=document.querySelector('.launch-screen');const paused=new Set();document.addEventListener('visibilitychange',()=>{screen.toggleAttribute('data-paused',document.hidden);if(document.hidden)screen.getAnimations({subtree:true}).forEach(a=>{if(a.playState==='finished')return;const time=a.currentTime??0;a.pause();a.currentTime=time;paused.add(a)});else{paused.forEach(a=>a.play());paused.clear()}});`
      fs.writeFileSync(path.join(output, `eclipse-${version}.html`), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Eclipse ${version} · Startscreen</title><!--${license}--><style>body{margin:0;background:#080403}${css}</style></head><body>${markup}<script>${script}</script></body></html>`)
    }
    if (!software && process.env.ECLIPSE_PREVIEW_VIDEO === '1') {
      const frames = path.join(output, 'frames')
      fs.mkdirSync(frames, { recursive: true })
      // Capturing PNGs can be slower than real time. Sample animation clocks
      // explicitly so the exported 8 FPS video preserves the actual motion speed.
      await evaluate(`window.__captureAnimations=document.querySelector('.launch-screen').getAnimations({subtree:true}).map(animation=>({animation,time:animation.currentTime??0}));window.__captureAnimations.forEach(({animation})=>animation.pause());true`)
      for (let i = 0; i < 64; i++) {
        await evaluate(`window.__captureAnimations.forEach(({animation,time})=>{animation.currentTime=time+${i * 125}});true`)
        fs.writeFileSync(path.join(frames, `${String(i).padStart(3, '0')}.png`), (await window.webContents.capturePage()).toPNG())
      }
      await evaluate(`window.__captureAnimations.forEach(({animation,time})=>{animation.currentTime=time;animation.play()});delete window.__captureAnimations;true`)
    }
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`)
    await wait(250)
    const clocks = await evaluate(`document.getAnimations().map(a=>a.currentTime)`)
    await wait(200)
    assert.deepEqual(await evaluate(`document.getAnimations().map(a=>a.currentTime)`), clocks)
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`)
    await wait(100)
    window.webContents.invalidate()
    await window.webContents.capturePage()
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.eclipse-loader__corona')).animationPlayState`), 'running')
    window.setSize(1024, 640)
    await wait(250)
    assert.equal(await evaluate(`window.__initialLaunch===document.querySelector('.launch-screen') && window.__initialAtmosphere===document.querySelector('.launch-atmosphere')`), true)
    await capture(software ? `eclipse-${version}-fallback-small.png` : `eclipse-${version}-small.png`)
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await wait(250)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.eclipse-loader__corona')).animationName`), 'none')
    assert.equal(await evaluate(`[...document.querySelectorAll('.launch-atmosphere__scene *')].every(element=>getComputedStyle(element).animationName==='none')`), true)
    assert.equal(await evaluate(`window.__initialAtmosphere===document.querySelector('.launch-atmosphere')`), true)
    {
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
      window.setSize(exitVideo ? 1120 : 1400, exitVideo ? 720 : 900)
      const shop = path.join(root, '.cache/store-polish/store-fixture.png')
      const backdrop = fs.existsSync(shop) ? `url(data:image/png;base64,${fs.readFileSync(shop).toString('base64')}) center/cover no-repeat` : '#28323b'
      await evaluate(`document.getElementById('root').style.background=${JSON.stringify(backdrop)};document.querySelector('.launch-screen').setAttribute('data-closing','true');window.__exitAnimations=document.querySelector('.launch-screen').getAnimations({subtree:true}).map(animation=>({animation,time:['launch-lift-away','launch-edge-away','launch-content-away'].includes(animation.animationName)?0:animation.currentTime??0}));window.__exitAnimations.forEach(({animation,time})=>{animation.pause();animation.currentTime=time});true`)
      const exitDuration = await evaluate(`parseFloat(getComputedStyle(document.querySelector('.launch-screen')).getPropertyValue('--launch-exit-duration'))`)
      const sampleExit = async elapsed => {
        await evaluate(`window.__exitAnimations.forEach(({animation,time})=>{animation.currentTime=time+${elapsed}});true`)
        window.webContents.invalidate()
        await window.webContents.capturePage()
        await wait(25)
      }
      await sampleExit(exitDuration * .43)
      const exit = await evaluate(`(()=>{const root=document.querySelector('.launch-screen');const style=getComputedStyle(root);return{animation:style.animationName,mask:style.maskImage,transform:style.transform}})()`)
      assert.deepEqual(exit.animation.split(', '),['launch-lift-away','launch-edge-away'])
      assert.notEqual(exit.mask,'none')
      assert.notEqual(exit.transform,'none')
      await capture(software ? 'eclipse-exit-software-mid.png' : 'eclipse-exit-mid.png')
      if (exitVideo) {
        const frames = path.join(output, 'exit-frames')
        fs.mkdirSync(frames, {recursive:true})
        const fps = 60
        const frameCount = Math.ceil((exitDuration + 1000) / 1000 * fps)
        for (let frame=0;frame<frameCount;frame++) {
          await sampleExit(Math.max(0,frame*1000/fps-400))
          fs.writeFileSync(path.join(frames,`${String(frame).padStart(3,'0')}.png`),(await window.webContents.capturePage()).toPNG())
        }
        fs.writeFileSync(path.join(output,'exit-video.json'),JSON.stringify({fps,frameCount,durationMs:frameCount/fps*1000}))
      }
      await sampleExit(exitDuration + 100)
      assert.ok(await evaluate(`document.querySelector('.launch-screen').getBoundingClientRect().bottom<0`))
      await evaluate(`document.querySelector('.launch-screen').removeAttribute('data-closing');window.__exitAnimations.forEach(({animation})=>animation.play());delete window.__exitAnimations;document.getElementById('root').style.background='';true`)
    }
    assert.deepEqual(errors, [])
    const report = { ...state, backgroundMotion: true, oneSurface: true, noWebGLContext: true, localFont: true, hiddenPaused: true, restored: true, reducedMotionRespected: true, smallViewport: true, liquidExit: true, errors }
    if (!software) {
      await window.loadFile(path.join(output, `eclipse-${version}.html`))
      await evaluate('document.fonts.ready.then(()=>true)')
      assert.equal(await evaluate(`document.fonts.check('800 72px "Eclipse Display"')`), true)
      report.standalonePreview = true
    }
    fs.writeFileSync(path.join(output, software ? 'fallback-verification.json' : 'verification.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    window.destroy()
    app.exit(0)
  } catch (error) { console.error(error); console.error(errors); app.exit(1) }
}).catch(error => { console.error(error); app.exit(1) })
setTimeout(() => { console.error('Launch preview timed out'); app.exit(1) }, exitVideo ? 180000 : 60000).unref()
