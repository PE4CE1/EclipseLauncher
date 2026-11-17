const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async function checkProfileControls(window,output){
  const contents=window.webContents
  const evaluate=code=>contents.executeJavaScript(code)
  const ready=async code=>{for(let count=0;count<160;count++){if(await evaluate(code))return;await wait(25)}throw new Error('Profile controls timeout: '+code)}
  const clickAt=async(x,y)=>{
    await contents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x,y})
    await contents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1})
    await contents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})
  }
  const click=async id=>{
    await ready(`!!document.getElementById('${id}')`)
    const point=await evaluate(`(() => {const element=document.getElementById('${id}'),r=element.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,target:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')?.id}})()`)
    assert.equal(point.target,id,'A native click must hit '+id+', not an underlying control')
    await clickAt(point.x,point.y)
  }
  const capture=async name=>{for(let frame=0;frame<4;frame++){contents.invalidate();await contents.capturePage();await wait(50)}fs.writeFileSync(path.join(output,name),(await contents.capturePage()).toPNG())}
  const box=selector=>evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  const report={}
  fs.mkdirSync(output,{recursive:true})
  contents.debugger.attach('1.3')
  try{
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
    await click('nav-settings')
    await ready(`!!document.getElementById('settings-tab-system')`)
    await click('settings-tab-system')
    await ready(`!!document.getElementById('settings-background-lighting')`)
    assert.equal(await evaluate(`document.getElementById('settings-background-lighting').getAttribute('aria-checked')`),'true','Lighting must default to enabled')
    assert.equal(await evaluate(`document.querySelector('.settings-scroll').textContent.includes('Performance Mode')||document.querySelector('.settings-scroll').textContent.includes('Performance-Modus')`),false)
    await click('settings-background-lighting')
    await ready(`document.querySelector('.launcher-atmosphere').hidden`)
    assert.equal(await evaluate(`window.electronAPI.getSettings().then(settings=>settings.backgroundLighting)`),false)
    await capture('lighting-off.png')
    await click('nav-home')
    await ready(`!!document.querySelector('.home-view')`)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launcher-atmosphere')).display`),'none')
    await click('nav-settings')
    await ready(`!!document.getElementById('settings-background-lighting')`)
    assert.equal(await evaluate(`document.getElementById('settings-background-lighting').getAttribute('aria-checked')`),'false')
    await click('settings-background-lighting')
    await ready(`!document.querySelector('.launcher-atmosphere').hidden`)
    assert.equal(await evaluate(`window.electronAPI.getSettings().then(settings=>settings.backgroundLighting)`),true)
    report.lighting={defaultOn:true,savedOff:true,survivesNavigation:true,restoredOn:true}

    await click('nav-home')
    await ready(`!!document.querySelector('.home-view')`)
    const identity=await box('#sidebar-profile-menu p')
    assert.equal(await evaluate(`document.querySelector('#sidebar-profile-menu [data-profile-chevron]').dataset.profileChevron`),'down')
    await click('sidebar-profile-menu')
    await ready(`!!document.querySelector('#sidebar-profile-dropdown[data-positioned]')`)
    const openIdentity=await box('#sidebar-profile-collapse p')
    assert.ok(Math.abs(identity.x-openIdentity.x)<.01&&Math.abs(identity.y-openIdentity.y)<.01&&Math.abs(identity.width-openIdentity.width)<.01,'The profile identity must keep its exact position and truncation width: '+JSON.stringify({identity,openIdentity}))
    assert.equal(await evaluate(`document.querySelector('#sidebar-profile-collapse [data-profile-chevron]').dataset.profileChevron`),'up')
    const positions=[]
    for(let frame=0;frame<7;frame++){
      contents.invalidate();await contents.capturePage();positions.push(await box('#sidebar-profile-dropdown'));await wait(30)
    }
    for(const position of positions)for(const key of ['x','y','width','height'])assert.ok(Math.abs(position[key]-positions[0][key])<.5,'Popup geometry must remain stable: '+JSON.stringify(positions))
    assert.equal(await evaluate(`document.getElementById('sidebar-profile-dropdown').getAnimations({subtree:true}).length`),0,'Popup text must not be animated onto fractional positions')
    await capture('attached-profile-menu.png')
    await click('sidebar-profile-collapse')
    await ready(`!document.getElementById('sidebar-profile-dropdown')`)
    report.menu={identityPositionStable:true,geometryStable:true,closedArrow:'down',openArrow:'up',nativeCollapse:true}

    report.freeGames=[]
    for(const origin of ['home','settings','game']){
      await click(origin==='settings'?'nav-settings':'nav-home')
      await ready(`!!document.querySelector('[data-view-scene="${origin==='settings'?'settings':'home'}"]')`)
      if(origin==='game'){
        await ready(`!!document.querySelector('.store-hero button[id^="hero-view-"]')`)
        const id=await evaluate(`document.querySelector('.store-hero button[id^="hero-view-"]').id`)
        await click(id)
        await ready(`!!document.querySelector('.game-detail-modal-overlay')`)
      }
      await click('sidebar-profile-menu')
      await ready(`!!document.getElementById('sidebar-open-free-games')`)
      assert.equal(await evaluate(`document.getElementById('sidebar-open-free-games').textContent.trim()`),'Free Games')
      await click('sidebar-open-free-games')
      await ready(`!!document.querySelector('[data-view-scene="free-games"] [data-free-games]')`)
      assert.equal(await evaluate(`!!document.querySelector('.home-view')||!!document.querySelector('.game-detail-modal-overlay')`),false,'Native gift-menu clicks must never leave Home or a game preview visible')
      assert.equal(await evaluate(`document.querySelector('.topbar').textContent.includes('Free Games')`),true)
      report.freeGames.push({origin,nativeClick:true,correctView:true})
    }
    await capture('free-games-native.png')
    await click('nav-home')
    await ready(`!!document.querySelector('.home-view')`)
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2))
    return report
  }finally{contents.debugger.detach()}
}
