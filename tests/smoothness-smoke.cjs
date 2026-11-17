const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function measureSmoothness(window, output) {
  const contents = window.webContents
  const evaluate = code => contents.executeJavaScript(code, true)
  const send = (command, args) => contents.debugger.sendCommand(command, args)
  const ready = async code => {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await evaluate(code)) return
      await wait(50)
    }
    throw new Error('Smoothness fixture not ready: ' + code)
  }
  const report = { mode: 'Isolated production Electron renderer, GPU enabled, 590 cached games, identical local artwork; garbage collection only before memory samples, never during scrolling', views: {} }
  fs.mkdirSync(output, {recursive: true})
  contents.debugger.attach('1.3')
  try {
    window.showInactive()
    await wait(300)
    await send('Performance.enable')
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));true`)
    const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
    const memory = async () => {
      await send('HeapProfiler.collectGarbage')
      const current = await metrics(), dom = await send('Memory.getDOMCounters')
      return {heapMiB: current.JSHeapUsedSize / 1048576, nodes: dom.nodes, listeners: dom.jsEventListeners, mountedCards: await evaluate(`document.querySelectorAll('[id^="library-grid-item-"],[id^="library-item-"]').length`)}
    }
    await evaluate(`document.getElementById('nav-library').click();true`)
    await ready(`!!document.querySelector('[id^="library-grid-item-"]')`)
    await wait(1400)
    for (const mode of ['grid', 'list']) {
      if (mode === 'list') {
        await evaluate(`document.getElementById('library-view-list').click();true`)
        await ready(`!!document.querySelector('[id^="library-item-"]')`)
        await wait(500)
      }
      const selector = mode === 'grid' ? '[id^="library-grid-item-"]' : '[id^="library-item-"]'
      const geometry = () => evaluate(`(()=>{const scroll=document.querySelector('.view-scroll'),r=scroll.getBoundingClientRect();return{height:scroll.scrollHeight,top:scroll.scrollTop,x:r.x+r.width*.6,y:r.y+r.height*.6,first:[...document.querySelectorAll('${selector}')].slice(0,6).map(node=>{const r=node.getBoundingClientRect();return{id:node.id,x:r.x,y:r.y,width:r.width,height:r.height}})}})()`)
      const initial = await geometry(), entry = report.views[mode] = {initial, memory: await memory(), samples: []}
      fs.writeFileSync(path.join(output, 'partial.json'), JSON.stringify(report,null,2))
      for (let run = 0; run < 3; run++) {
        await evaluate(`document.querySelector('.view-scroll').scrollTop=0;true`)
        await wait(250)
        const start = await geometry()
        await evaluate(`window.__smoothSample={frames:[],tasks:[],last:0,active:true};window.__smoothObserver=new PerformanceObserver(list=>window.__smoothSample.tasks.push(...list.getEntries().map(entry=>entry.duration)));window.__smoothObserver.observe({type:'longtask'});requestAnimationFrame(function sample(time){const state=window.__smoothSample;if(!state.active)return;if(state.last)state.frames.push(time-state.last);state.last=time;requestAnimationFrame(sample)});true`)
        const before = await metrics()
        await send('Input.synthesizeScrollGesture', {x: start.x, y: start.y, yDistance: -4500, speed: 1800, gestureSourceType: 'mouse'})
        const after = await metrics()
        const frames = await evaluate(`(()=>{const state=window.__smoothSample;state.active=false;window.__smoothObserver.disconnect();const sorted=state.frames.sort((a,b)=>a-b);return{frames:sorted.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],longTasks:state.tasks.length,longTaskMs:state.tasks.reduce((a,b)=>a+b,0)}})()`)
        const end = await geometry()
        assert.ok(end.top > 1000, 'The gesture must scroll real content: '+JSON.stringify({mode,start,end}))
        assert.equal(end.height, initial.height, 'Scrolling must preserve total grid height')
        entry.samples.push({...frames, distance: end.top, taskMs: (after.TaskDuration-before.TaskDuration)*1000, layoutMs: (after.LayoutDuration-before.LayoutDuration)*1000, styleMs: (after.RecalcStyleDuration-before.RecalcStyleDuration)*1000})
        fs.writeFileSync(path.join(output, 'partial.json'), JSON.stringify(report,null,2))
      }
      await evaluate(`document.querySelector('.view-scroll').scrollTop=1e9;true`)
      await wait(350)
      try { await ready(`!!document.querySelector('[id="library-${mode==='grid'?'grid-item':'item'}-steam_980590"]')`) }
      catch (error) { throw new Error('Last game unavailable: '+JSON.stringify({mode,geometry:await geometry(),last:await evaluate(`Array.from(document.querySelectorAll('${selector}')).slice(-6).map(node=>node.id)`)}),{cause:error}) }
      entry.afterScroll = await memory()
      if (await evaluate(`!!document.querySelector('[data-windowed-grid]')`)) {
        assert.ok(entry.memory.mountedCards < 100)
        assert.ok(entry.afterScroll.mountedCards < 100)
      }
      await evaluate(`document.querySelector('.view-scroll').scrollTop=0;true`)
      await wait(250)
      entry.returnHeight = (await geometry()).height
      assert.equal(entry.returnHeight, initial.height)
      fs.writeFileSync(path.join(output, mode+'.png'), (await contents.capturePage()).toPNG())
    }
    if (await evaluate(`!!document.querySelector('[data-windowed-grid]')`)) {
      const type = async value => {
        await evaluate(`(()=>{const input=document.querySelector('#library-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
      }
      await type('Startup Game 590')
      await ready(`document.querySelectorAll('[id^="library-item-"]').length===1 && !!document.querySelector('#library-item-steam_980590')`)
      await type('')
      await ready(`!!document.querySelector('#library-item-steam_980001')`)
      await evaluate(`document.querySelector('#library-fav-steam_980001').click();true`)
      await evaluate(`document.querySelector('#library-tab-favorites').click();true`)
      await ready(`document.querySelectorAll('[id^="library-item-"]').length===1 && !!document.querySelector('#library-item-steam_980001')`)
      await evaluate(`document.querySelector('#library-tab-all').click();document.querySelector('#library-view-grid').click();true`)
      await ready(`!!document.querySelector('#library-grid-item-steam_980001')`)
      for (const width of [1024, 1280, 1600, 1400]) {
        window.setSize(width,900)
        await wait(150)
        await evaluate(`document.querySelector('.view-scroll').scrollTop=1e9;true`)
        await ready(`!!document.querySelector('#library-grid-item-steam_980590')`)
        await evaluate(`document.querySelector('.view-scroll').scrollTop=0;true`)
        await ready(`!!document.querySelector('#library-grid-item-steam_980001')`)
        assert.ok(await evaluate(`document.querySelectorAll('[id^="library-grid-item-"]').length < 100`))
      }
      report.functionality = {searchLastGame: true, favorites: true, fullLibraryRetained: true, lastGameAtEveryWidth: true, resizeWidths: [1024,1280,1600,1400]}
    }
    await evaluate(`document.getElementById('nav-home').click();true`)
    await wait(600)
    report.returnedHome = await memory()
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report,null,2))
    return report
  } finally {
    await evaluate(`if(window.__smoothSample)window.__smoothSample.active=false;window.__smoothObserver?.disconnect();true`).catch(()=>{})
    contents.debugger.detach()
  }
}
