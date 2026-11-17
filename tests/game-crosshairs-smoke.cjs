const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./download-loader.cjs')
exports.setup=ipcMain=>{
  global.fetch=async()=>new Response('<a class="cxc-card--crosshair" href="/crosshairs/test-design/"><img src="/assets/crosshairs/test-design-1234.webp"><span class="cxc-card-name">Test design</span></a>',{headers:{'content-type':'text/html'}})
  load({'./ipcSecurity':{ipcMain}})('electron/networkService.ts').initNetworkIPC()
}
exports.run=async({window,manager,evaluate,until,click,capture,settings,errors,setGame})=>{
  const games=[['valorant','VALORANT','x'],['fortnite','Fortnite','circle'],['cs2','Counter-Strike 2','dot']]
  await until(()=>evaluate('!!window.__overlaySettings&&!!document.querySelector("#overlay-game-cs2")'))
  const general=await evaluate('JSON.stringify(window.__overlaySettings.state().crosshairConfig)')
  assert.equal(await evaluate('document.querySelectorAll(".game-crosshair-settings").length'),3)
  await until(()=>evaluate('[...document.querySelectorAll(".game-crosshair-icon img")].every(image=>image.complete&&image.naturalWidth>0)'))
  await evaluate('(()=>{const main=document.querySelector("main"),row=document.querySelector("#overlay-game-valorant").getBoundingClientRect();main.scrollTo({top:main.scrollTop+row.top-140,behavior:"instant"});return true})()')
  await capture('game-crosshairs-collapsed-de.png')
  for(const [id,,preset]of games){
    const scope='#overlay-game-'+id
    await click(scope+' .game-crosshair-trigger')
    await until(()=>evaluate(`!!document.querySelector('${scope} [data-crosshair-expand]')`))
    await click(scope+' [role=switch]')
    await until(()=>settings().overlayGameCrosshairs?.[id]?.enabled===true)
    assert.equal(manager.getOverlayWindow()?.isVisible()||false,false,'Enabling a game profile does not show it on the desktop')
    assert.equal(await evaluate(`!!document.querySelector('${scope} [data-crosshair-tab=presets]')`),false,'Crosshair editor starts collapsed inside each game')
    await click(scope+' [data-crosshair-expand]')
    await until(()=>evaluate(`!!document.querySelector('${scope} [data-crosshair-tab=presets]')`))
    await click(scope+' [data-crosshair-tab=presets]')
    await click(scope+` [data-crosshair-preset=${preset}]`)
    await until(()=>settings().overlayGameCrosshairs[id].config.preset===preset)
    await click(scope+' [data-crosshair-move=right]')
    await until(()=>settings().overlayGameCrosshairs[id].config.offsetX===1)
    await capture(`game-crosshair-${id}-de.png`)
    if(id==='cs2'){
      await click(scope+' .cs2-stats-settings [role=switch]')
      await until(()=>settings().overlayCS2Stats===true)
    }
  }
  assert.equal(await evaluate('JSON.stringify(window.__overlaySettings.state().crosshairConfig)'),general,'Editing games must not change the general crosshair')
  assert.equal(await evaluate('document.querySelectorAll("[id=overlay-crosshair]").length'),1,'Editors have distinct DOM identities')

  for(const [id,name,preset]of games){
    setGame({name})
    await until(()=>manager.getOverlayWindow()?.isVisible())
    await until(()=>manager.getOverlayWindow().webContents.executeJavaScript(`document.querySelector('#widget-crosshair svg')?.dataset.crosshairStyle==='${preset==='dot'?'cross':preset}'`))
    const hud=manager.getOverlayWindow()
    if(id==='cs2'){
      await until(()=>hud.webContents.executeJavaScript('!!document.querySelector("#widget-cs2Stats")'))
      hud.webContents.send('cs2:stats',{kills:8,deaths:4,assists:3,headshots:4,headshotKills:8,ct:5,t:3,round:8,map:'de_dust2',lastSeenAt:Date.now()})
      await until(()=>hud.webContents.executeJavaScript('document.querySelector("#widget-cs2Stats").textContent.includes("2.00")'))
      await capture('cs2-session-hud.png',hud)
    }
    assert.equal(await hud.webContents.executeJavaScript('document.querySelectorAll("#widget-crosshair").length'),1)
    assert.equal(await hud.webContents.executeJavaScript('!!document.getElementById("widget-media")'),false)
  }

  // A local PNG uses the same import path but remains isolated to Fortnite.
  await click('#overlay-game-fortnite [data-crosshair-tab=image]')
  await evaluate(`(()=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(6,0,4,16);context.fillRect(0,6,16,4);const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),char=>char.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'Fortnite test.png',{type:'image/png'}));const input=document.querySelector('#overlay-game-fortnite [data-crosshair-file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  await until(()=>settings().overlayGameCrosshairs.fortnite.config.mode==='image')
  assert.equal(settings().overlayGameCrosshairs.valorant.config.preset,'x')
  assert.equal(settings().overlayGameCrosshairs.cs2.config.preset,'dot')
  setGame({name:'Fortnite'})
  await until(()=>manager.getOverlayWindow()?.isVisible())
  await until(()=>manager.getOverlayWindow().webContents.executeJavaScript('!!document.querySelector("#widget-crosshair image")'))

  await click('#overlay-game-cs2 .game-crosshair-info button')
  await until(()=>manager.isEditModeActive())
  await until(()=>manager.getOverlayWindow().webContents.executeJavaScript('!!document.getElementById("dot-grid")&&!!document.querySelector("#widget-crosshair svg")'))
  assert.equal(await manager.getOverlayWindow().webContents.executeJavaScript('document.querySelector("#widget-crosshair svg").dataset.crosshairStyle'),'cross','CS2 desktop preview must use CS2 even while Fortnite is running')
  await evaluate('window.electronAPI.exitOverlayEdit();true')
  await until(()=>!manager.isEditModeActive())
  await until(()=>manager.getOverlayWindow().webContents.executeJavaScript('!!document.querySelector("#widget-crosshair image")'))

  await click('#overlay-game-fortnite [role=switch]')
  await until(()=>settings().overlayGameCrosshairs.fortnite.enabled===false)
  await until(()=>!manager.getOverlayWindow()?.isVisible())
  assert.equal(settings().overlayGameCrosshairs.fortnite.config.mode,'image','Disabling preserves the selected image')
  setGame(null)
  assert.equal(manager.getOverlayWindow()?.isVisible()||false,false)

  await evaluate('window.__overlaySettings.language("en");true')
  await until(()=>evaluate('document.querySelector("#overlay-game-valorant .game-crosshair-title").textContent.includes("1 overlay active")'))
  for(const width of [1120,540,400]){
    window.setSize(width,920)
    await new Promise(resolve=>setTimeout(resolve,180))
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Profiles must fit narrow windows')
    await capture(`game-crosshairs-${width}-en.png`)
  }
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.resolve(__dirname,'../.cache/overlay-settings/game-crosshairs-verification.json'),JSON.stringify({localGameIcons:true,independentProfiles:true,generalPreserved:true,automaticGameSwitch:true,oneCrosshair:true,desktopHidden:true,pngImport:true,scopedDesktopPreview:true,disabledPreservesDesign:true,responsive:true,translated:true,rendererErrors:errors},null,2))
}
