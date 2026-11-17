const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkAtmosphere(window, output) {
  const contents = window.webContents
  const evaluate = expression => contents.executeJavaScript(expression)
  const capture = async name => {
    // Hidden GPU windows can return the previous submitted compositor frame.
    // Flush it before judging the current page's surfaces from a screenshot.
    for (let frame=0;frame<4;frame++) {
      contents.invalidate()
      await contents.capturePage()
      await wait(60)
    }
    fs.writeFileSync(path.join(output, name), (await contents.capturePage()).toPNG())
  }
  const headerSurface = () => evaluate(`(() => {const s=getComputedStyle(document.querySelector('.topbar'));return {color:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter}})()`)
  const ready = async expression => {
    for(let attempt=0;attempt<100;attempt++) {
      if(await evaluate(expression))return
      await wait(50)
    }
    throw new Error('Material readiness timeout: '+expression)
  }
  fs.mkdirSync(output, { recursive: true })
  contents.debugger.attach('1.3')
  await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))`)
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate(`getComputedStyle(document.querySelector('.launcher-atmosphere')).opacity==='1'`)) break
    await wait(100)
  }
  const inspect = `(() => {
    const root = document.querySelector('.launcher-atmosphere');
    return {sameSurface:root===window.__startupAtmosphere,visible:root.hasAttribute('data-visible'),opacity:Number(getComputedStyle(root).opacity),
      pointerEvents:getComputedStyle(root).pointerEvents,text:root.textContent.trim(),
      layers:[...root.children].map(layer=>{const s=getComputedStyle(layer);return{width:parseFloat(s.width),height:parseFloat(s.height),filter:s.filter,playState:s.animationPlayState,name:s.animationName,duration:s.animationDuration,iterations:s.animationIterationCount,animations:layer.getAnimations().length}})};
  })()`
  const state = await evaluate(inspect)
  assert.equal(state.sameSurface, true, 'The startup handoff must preserve the atmosphere DOM')
  assert.equal(state.visible, true)
  assert.equal(state.opacity, 1)
  assert.equal(state.pointerEvents, 'none')
  assert.equal(state.text, '', 'The ambient background must contain no version or loading text')
  assert.equal(state.layers.length, 2)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.home-view')).backgroundColor`), 'rgba(0, 0, 0, 0)', 'The Home surface must expose the ambient background')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.store-hero')).backgroundColor`), 'rgba(0, 0, 0, 0)', 'The hero must blend into the ambient background')
  assert.ok(state.layers.every(layer => layer.filter === 'none' && layer.playState === 'running'))
  assert.ok(state.layers.every(layer => layer.animations === 1), JSON.stringify(state))
  assert.ok(state.layers.every(layer => layer.iterations === 'infinite' && parseFloat(layer.duration) >= 26), JSON.stringify(state))
  await capture('home.png')
  const focusedHeader = await headerSurface()
  assert.equal(focusedHeader.blur, 'blur(18px)')
  assert.match(focusedHeader.color, /^rgba\(/, 'The header must reveal the shared background')
  const edges = []
  for (const layer of ['ember', 'copper']) {
    await evaluate(`(() => {
      const probe=document.createElement('div');probe.id='gradient-edge-probe';
      probe.style.cssText='position:fixed;left:0;top:0;width:768px;height:512px;background:#000;z-index:2147483647;pointer-events:none;isolation:isolate';
      const texture=document.createElement('div');texture.style.cssText='position:absolute;inset:0';
      texture.style.background=getComputedStyle(document.querySelector('.launcher-atmosphere__${layer}')).backgroundImage;
      probe.append(texture);document.body.append(probe);
    })()`)
    try {
      contents.invalidate()
      await contents.capturePage({ x: 0, y: 0, width: 768, height: 512 })
      await wait(80)
      const image = await contents.capturePage({ x: 0, y: 0, width: 768, height: 512 })
      const { width, height } = image.getSize()
      const pixels = image.toBitmap()
      assert.equal(pixels.length,width*height*4)
      fs.writeFileSync(path.join(output,`layer-${layer}.png`),image.toPNG())
      const rgbMax = (x,y) => Math.max(...pixels.subarray((y*width+x)*4,(y*width+x)*4+3))
      let edgeMax = 0, interiorMax = 0
      for (let x=0;x<width;x+=4) edgeMax=Math.max(edgeMax,rgbMax(x,0),rgbMax(x,height-1))
      for (let y=0;y<height;y+=4) edgeMax=Math.max(edgeMax,rgbMax(0,y),rgbMax(width-1,y))
      for (let y=8;y<height;y+=8) for(let x=8;x<width;x+=8) interiorMax=Math.max(interiorMax,rgbMax(x,y))
      assert.ok(edgeMax<=1, `${layer} must fade completely before every texture edge; observed RGB ${edgeMax}`)
      assert.ok(interiorMax>8, 'The edge check must render a visible gradient, not an empty capture')
      edges.push({layer,edgeMax,interiorMax})
    } finally { await evaluate(`document.getElementById('gradient-edge-probe').remove()`) }
  }
  const before = await evaluate(`document.querySelector('.launcher-atmosphere__ember').getAnimations()[0].currentTime`)
  await wait(250)
  assert.ok(await evaluate(`document.querySelector('.launcher-atmosphere__ember').getAnimations()[0].currentTime`) > before, 'The visible background must move')

  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))`)
  await wait(150)
  assert.ok((await evaluate(inspect)).layers.every(layer => layer.playState === 'paused'))
  assert.equal(await evaluate(`document.body.classList.contains('performance-mode')`),true,'The header comparison must exercise performance mode')
  assert.deepEqual(await headerSurface(), {...focusedHeader,blur:'none'}, 'Focus loss must disable blur while preserving the header tint')
  await ready(`getComputedStyle(document.querySelector('.launcher-atmosphere')).opacity==='0.25'`)
  assert.equal(await evaluate(`document.querySelector('.launcher-atmosphere').hasAttribute('data-dimmed')`),true,'The whole orange atmosphere must dim when Eclipse loses focus')
  const held = await evaluate(`[...document.querySelector('.launcher-atmosphere').children].map(layer=>({time:layer.getAnimations()[0].currentTime,transform:getComputedStyle(layer).transform}))`)
  await wait(250)
  assert.deepEqual(await evaluate(`[...document.querySelector('.launcher-atmosphere').children].map(layer=>({time:layer.getAnimations()[0].currentTime,transform:getComputedStyle(layer).transform}))`), held, 'Both background transforms and animation clocks must stop when Eclipse loses focus')
  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
  await ready(`getComputedStyle(document.querySelector('.launcher-atmosphere')).opacity==='1'`)
  assert.ok((await evaluate(inspect)).layers.every(layer => layer.playState === 'running'))

  contents.send('app:minimized')
  await wait(150)
  const minimizedTime = await evaluate(`[...document.querySelector('.launcher-atmosphere').children].map(layer=>layer.getAnimations()[0].currentTime)`)
  await wait(200)
  assert.deepEqual(await evaluate(`[...document.querySelector('.launcher-atmosphere').children].map(layer=>layer.getAnimations()[0].currentTime)`), minimizedTime, 'Minimizing must preserve both animation phases')
  contents.send('app:restored')
  await wait(100)
  assert.ok((await evaluate(inspect)).layers.every(layer => layer.playState === 'running'))

  try {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await wait(100)
    assert.equal(await evaluate(`document.querySelector('.launcher-atmosphere').getAnimations({subtree:true}).length`), 0, 'Reduced motion must fully disable ambient animations')
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  } finally { contents.debugger.detach() }

  const originalSize = window.getSize()
  window.setSize(3840, 2160)
  await wait(150)
  const large = await evaluate(inspect)
  assert.ok(large.layers.every(layer => layer.width <= 1100 && layer.height <= 850), '4K windows must not create 4K-sized animated gradient textures')
  window.setSize(...originalSize)
  await wait(100)
  await evaluate(`document.getElementById('nav-library').click()`)
  await wait(250)
  assert.equal((await evaluate(inspect)).sameSurface, true, 'Navigation must not restart the background')
  await capture('library.png')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launcher-toolbar')).backgroundColor`), focusedHeader.color, 'Library and global navigation must share the same surface palette')
  window.setSize(1920,1080)
  await evaluate(`document.getElementById('nav-settings').click()`)
  for(let attempt=0;attempt<40;attempt++) {
    if(await evaluate(`!!document.querySelector('.launcher-page-surface .launcher-panel')`)) break
    await wait(50)
  }
  await wait(250)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launcher-page-surface')).backgroundColor`),'rgba(0, 0, 0, 0)','Settings must share the continuous content backdrop')
  await capture('settings-focused.png')
  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))`)
  await wait(150)
  assert.deepEqual(await headerSurface(),{...focusedHeader,blur:'none'})
  await capture('settings-unfocused.png')
  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
  await ready(`getComputedStyle(document.querySelector('.launcher-atmosphere')).opacity==='1'`)
  const extendedViews=[]
  for(const destination of ['clips','profile','notifications']) {
    await evaluate(`document.getElementById('sidebar-profile-menu').click()`)
    await ready(`!!document.getElementById('sidebar-open-${destination}')`)
    await evaluate(`document.getElementById('sidebar-open-${destination}').click()`)
    await ready(`document.querySelector('.topbar')?.dataset.view==='${destination}' && !!document.querySelector('.launcher-view .launcher-page-surface')?.getClientRects().length`)
    await wait(250)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launcher-view .launcher-page-surface')).backgroundColor`),'rgba(0, 0, 0, 0)',`${destination} must use the shared matte backdrop`)
    await capture(`${destination}-matte.png`)
    if(destination==='clips') {
      await ready(`!!document.getElementById('clips-open-settings')`)
      await evaluate(`document.getElementById('clips-open-settings').click()`)
      await ready(`!!document.querySelector('.clips-studio .launcher-panel')`)
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.clips-studio .launcher-page-surface')).backgroundColor`),'rgba(0, 0, 0, 0)')
      await capture('clips-settings-matte.png')
    }
    extendedViews.push(destination)
  }
  await evaluate(`document.getElementById('sidebar-open-info').click()`)
  await ready(`document.querySelector('.topbar')?.dataset.view==='eclipse-info' && !!document.querySelector('.launcher-view .launcher-page-surface')?.getClientRects().length`)
  await capture('info-matte.png')
  extendedViews.push('eclipse-info')
  window.setSize(...originalSize)
  await evaluate(`document.getElementById('nav-home').click()`)
  await wait(250)
  assert.equal((await evaluate(inspect)).sameSurface, true)
  return { layers: 2, startupHandoff: true, noVersionText: true, focusPauseAndResume: true, backgroundDimOpacity:.25, minimizePreservesPhase: true, reducedMotion: true, bounded4KTextures: true, persistsAcrossNavigation: true, gradientEdges:edges, consistentHeaderOnBlur:true, sharedSurfaces:true, extendedViews }
}
