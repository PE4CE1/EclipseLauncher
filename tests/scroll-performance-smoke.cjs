const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function measureScroll(window, output) {
  const contents = window.webContents
  const evaluate = code => contents.executeJavaScript(code)
  const ready = async code => {
    for (let i = 0; i < 200; i++) { if (await evaluate(code)) return; await wait(50) }
    throw new Error('Scroll fixture not ready: ' + code)
  }
  const send = (command, args) => contents.debugger.sendCommand(command, args)
  const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
  const report = { mode: 'GPU-enabled isolated Electron; 590 cached library covers; native mouse wheel gesture; no frame captures during timing', menu: [], samples: [] }
  fs.mkdirSync(output, { recursive: true })
  contents.debugger.attach('1.3')
  let layers = []
  const trace = []
  let traceFinished
  const onMessage = (_event, method, params) => {
    if (method === 'LayerTree.layerTreeDidChange') layers = params.layers || []
    if (method === 'Tracing.dataCollected') trace.push(...params.value)
    if (method === 'Tracing.tracingComplete') traceFinished?.()
  }
  contents.debugger.on('message', onMessage)
  try {
    window.showInactive()
    await wait(300)
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await send('LayerTree.enable')
    await send('Performance.enable')
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
    await evaluate(`document.getElementById('nav-home').click()`)
    await ready(`!!document.getElementById('sidebar-profile-menu')`)
    for (const scale of [1, 1.25, 1.5]) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: scale, mobile: false })
      const before = await evaluate(`(()=>{const b=document.querySelector('#sidebar-profile-menu p').getBoundingClientRect();return{x:b.x,y:b.y,width:b.width}})()`)
      await evaluate(`document.getElementById('sidebar-profile-menu').click()`)
      await ready(`!!document.querySelector('#sidebar-profile-dropdown[data-positioned]')`)
      const after = await evaluate(`(()=>{const b=document.querySelector('#sidebar-profile-collapse p').getBoundingClientRect();return{x:b.x,y:b.y,width:b.width}})()`)
      report.menu.push({ scale, before, after, deltaX: after.x-before.x, deltaY: after.y-before.y, deltaWidth: after.width-before.width })
      if (process.env.ECLIPSE_SMOKE_SCROLL !== 'before') {
        for (const key of ['x', 'y', 'width']) assert.ok(Math.abs(after[key]-before[key])<.01, 'Opening the profile must preserve '+key+' at scale '+scale)
      }
      await evaluate(`document.getElementById('sidebar-profile-collapse').click()`)
    }
    await send('Emulation.clearDeviceMetricsOverride')
    await evaluate(`document.getElementById('nav-library').click()`)
    await ready(`Number(document.querySelector('[data-total-items]')?.getAttribute('data-total-items'))>=590 && !!document.querySelector('[id^="library-grid-item-"]')`)
    await wait(800)
    const selector = '.view-scroll'
    const geometry = () => evaluate(`(()=>{const n=document.querySelector('${selector}'),r=n.getBoundingClientRect();return{height:n.scrollHeight,top:n.scrollTop,x:r.x+r.width*.65,y:r.y+r.height*.65}})()`)
    report.initialHeight = (await geometry()).height
    for (let run = 0; run < 3; run++) {
      await evaluate(`document.querySelector('${selector}').scrollTop=0`)
      await wait(350)
      const start = await geometry()
      await evaluate(`window.__scrollMeasure={frames:[],longTasks:[],last:0,active:true};window.__scrollObserver=new PerformanceObserver(list=>window.__scrollMeasure.longTasks.push(...list.getEntries().map(e=>e.duration)));window.__scrollObserver.observe({type:'longtask'});requestAnimationFrame(function sample(time){const s=window.__scrollMeasure;if(!s.active)return;if(s.last)s.frames.push(time-s.last);s.last=time;requestAnimationFrame(sample)})`)
      const before = await metrics()
      await send('Input.synthesizeScrollGesture', { x: start.x, y: start.y, yDistance: -4500, speed: 1800, gestureSourceType: 'mouse' })
      const after = await metrics()
      const result = await evaluate(`(()=>{const s=window.__scrollMeasure;s.active=false;window.__scrollObserver.disconnect();const f=s.frames.sort((a,b)=>a-b);return{frames:f.length,p50Ms:f[Math.floor(f.length*.5)],p95Ms:f[Math.floor(f.length*.95)],longTasks:s.longTasks.length,longTaskMs:s.longTasks.reduce((a,b)=>a+b,0)}})()`)
      const end = await geometry()
      report.samples.push({ run: run+1, ...result, scrollDistance: end.top, scrollHeight: end.height,
        taskMs: (after.TaskDuration-before.TaskDuration)*1000,
        layoutMs: (after.LayoutDuration-before.LayoutDuration)*1000,
        styleMs: (after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,
        layers: layers.length, drawingLayers: layers.filter(layer=>layer.drawsContent).length,
        forcedCardLayers: await evaluate(`document.querySelectorAll('[id^="library-grid-item-"][style*="translateZ"]').length`),
      })
      assert.ok(end.top > 1000, 'Native wheel gesture must actually scroll the library')
    }
    await evaluate(`document.querySelector('${selector}').scrollTop=0`)
    await wait(300)
    report.returnHeight = (await geometry()).height
    fs.writeFileSync(path.join(output, 'library.png'), (await contents.capturePage()).toPNG())
    if (process.env.ECLIPSE_SMOKE_SCROLL !== 'before') {
      assert.equal(report.returnHeight, report.initialHeight, 'Scrolling must not resize the grid or move its scrollbar')
      for (const sample of report.samples) {
        assert.equal(sample.scrollHeight, report.initialHeight)
        assert.equal(sample.forcedCardLayers, 0, 'Cards must not force a GPU texture for every library entry')
      }
      await evaluate(`document.getElementById('library-view-list').click()`)
      await ready(`Number(document.querySelector('[data-total-items]')?.getAttribute('data-total-items'))>=590 && !!document.querySelector('[id^="library-item-"]')`)
      await wait(350)
      const listStart = await geometry()
      await send('Input.synthesizeScrollGesture', { x: listStart.x, y: listStart.y, yDistance: -4500, speed: 1800, gestureSourceType: 'mouse' })
      const listEnd = await geometry()
      assert.equal(listEnd.height, listStart.height, 'Offscreen list rows must retain their measured height')
      report.list = { initialHeight: listStart.height, afterHeight: listEnd.height, scrollDistance: listEnd.top }
      const tracingDone = new Promise(resolve => { traceFinished = resolve })
      await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc', transferMode: 'ReportEvents' })
      await send('Input.synthesizeScrollGesture', { x: listStart.x, y: listStart.y, yDistance: -1400, speed: 1800, gestureSourceType: 'mouse' })
      await send('Tracing.end')
      await Promise.race([tracingDone, wait(5000).then(() => { throw new Error('Scroll trace did not finish') })])
      fs.writeFileSync(path.join(output, 'scroll-trace.json'), JSON.stringify({ traceEvents: trace }))
      report.traceMs = Object.fromEntries(['Paint', 'Layout', 'UpdateLayoutTree', 'RasterTask'].map(name => [name, trace.filter(event=>event.name===name&&event.ph==='X').reduce((sum,event)=>sum+(event.dur||0),0)/1000]))
      await evaluate(`document.getElementById('nav-home').click()`)
      await ready(`!!document.querySelector('.store-hero')`)
      await evaluate(`document.querySelector('.home-view').style.height='240px';document.querySelector('.home-view').scrollTop=800`)
      await ready(`document.querySelector('.store-hero').hasAttribute('data-hero-paused')`)
      await evaluate(`document.querySelector('.home-view').scrollTop=0;document.querySelector('.home-view').style.removeProperty('height')`)
      await ready(`!document.querySelector('.store-hero').hasAttribute('data-hero-paused')`)
      report.offscreenHeroPauses = true
    }
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2))
    return report
  } finally {
    contents.debugger.removeListener('message', onMessage)
    await evaluate(`if(window.__scrollMeasure)window.__scrollMeasure.active=false;window.__scrollObserver?.disconnect()`).catch(()=>{})
    contents.debugger.detach()
  }
}
