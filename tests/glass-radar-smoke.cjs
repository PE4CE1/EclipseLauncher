const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async function checkGlassRadar(window,output){
  const contents=window.webContents
  const evaluate=code=>contents.executeJavaScript(code)
  const ready=async code=>{for(let count=0;count<160;count++){if(await evaluate(code))return;await wait(35)}throw new Error('Glass/radar timeout: '+code)}
  const capture=async name=>{for(let frame=0;frame<3;frame++){contents.invalidate();await contents.capturePage();await wait(60)}fs.writeFileSync(path.join(output,name),(await contents.capturePage()).toPNG())}
  const menu=async()=>{await evaluate(`document.getElementById('sidebar-profile-menu').click()`);await ready(`!!document.getElementById('sidebar-open-free-games')`)}
  const report={}
  fs.mkdirSync(output,{recursive:true})
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));document.getElementById('nav-settings').click()`)
  await ready(`!!document.getElementById('settings-tab-profile')`)
  await evaluate(`document.getElementById('settings-tab-profile').click()`)
  await ready(`!!document.getElementById('settings-steam-profile-url')`)
  const materials=await evaluate(`[...document.querySelectorAll('.settings-glass-card')].map(card=>({color:getComputedStyle(card).backgroundColor,blur:getComputedStyle(card).backdropFilter}))`)
  assert.ok(materials.length>=2)
  assert.ok(materials.every(card=>card.color==='rgba(255, 255, 255, 0.02)'&&card.blur==='none'),JSON.stringify(materials))
  const directMaterials=await evaluate(`(() => {const cards=[...document.querySelectorAll('.settings-glass-card')];cards.forEach(card=>card.classList.remove('settings-glass-card'));const colors=cards.map(card=>getComputedStyle(card).backgroundColor);cards.forEach(card=>card.classList.add('settings-glass-card'));return colors})()`)
  assert.ok(directMaterials.every(color=>color==='rgba(255, 255, 255, 0.02)'),'Card transparency must be present in the markup, without the material override: '+JSON.stringify(directMaterials))
  await menu()
  await ready(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).backdropFilter==='blur(28px)'`)
  assert.equal(await evaluate(`document.getElementById('sidebar-profile-dropdown').parentElement===document.body`),true,'The popup must escape sidebar clipping and backdrop roots')
  const material=await evaluate(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).backgroundColor`)
  assert.equal(material,'rgba(16, 16, 18, 0.58)')
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).opacity`),'1','The glass surface must not fade its backdrop and expose sharp text underneath')
  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))`)
  await ready(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).backdropFilter==='none'`)
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).backgroundColor`),'rgba(16, 16, 18, 0.98)','Without blur, the popup must hide navigation text with a stronger tint')
  await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
  await ready(`getComputedStyle(document.getElementById('sidebar-profile-dropdown')).backdropFilter==='blur(28px)'`)
  await evaluate(`(() => {const menu=document.getElementById('sidebar-profile-dropdown'),r=menu.getBoundingClientRect();const probe=document.createElement('div');probe.id='material-stripes';Object.assign(probe.style,{position:'fixed',left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',background:'repeating-linear-gradient(90deg,white 0px,white 5px,black 5px,black 10px)',zIndex:'999',pointerEvents:'none'});document.getElementById('sidebar-profile-menu').parentElement.append(probe)})()`)
  const popupBounds=await evaluate(`(() => {const r=document.getElementById('sidebar-profile-dropdown').getBoundingClientRect();return{x:Math.round(r.x+20),y:Math.round(r.y+4),width:Math.round(r.width-40),height:9}})()`)
  const contrast=async()=>{
    for(let frame=0;frame<4;frame++){contents.invalidate();await contents.capturePage();await wait(45)}
    const image=(await contents.capturePage(popupBounds)).resize({width:popupBounds.width,height:9})
    const bitmap=image.toBitmap(),values=[]
    for(let x=0;x<popupBounds.width;x++){const offset=(4*popupBounds.width+x)*4;values.push((bitmap[offset]+bitmap[offset+1]+bitmap[offset+2])/3)}
    return Math.max(...values)-Math.min(...values)
  }
  const blurredContrast=await contrast()
  await evaluate(`Object.assign(document.getElementById('sidebar-profile-dropdown').style,{backdropFilter:'none',webkitBackdropFilter:'none'});true`)
  const sharpContrast=await contrast()
  assert.ok(sharpContrast>blurredContrast+18,JSON.stringify({blurredContrast,sharpContrast}))
  await evaluate(`document.getElementById('material-stripes').remove();document.getElementById('sidebar-profile-dropdown').style.removeProperty('backdrop-filter');document.getElementById('sidebar-profile-dropdown').style.removeProperty('-webkit-backdrop-filter')`)
  report.blurPixels={blurredContrast,sharpContrast}
  await capture('profile-glass.png')
  await evaluate(`document.getElementById('sidebar-open-free-games').click()`)
  await ready(`!!document.querySelector('[data-free-games]')`)
  assert.equal(await evaluate(`document.querySelectorAll('[data-free-games] article').length`),0)
  await evaluate(`document.getElementById('free-games-refresh').click()`)
  await ready(`document.querySelectorAll('[data-free-games] article').length===1&&!document.getElementById('free-games-refresh').disabled`)
  await capture('free-games.png')
  await evaluate(`document.getElementById('free-games-refresh').click()`)
  await ready(`!!document.querySelector('[data-free-games] [role=alert]')`)
  assert.equal(await evaluate(`document.querySelectorAll('[data-free-games] article').length`),1,'Failed refreshes must preserve cached offers')
  await evaluate(`document.getElementById('free-games-refresh').click()`)
  await ready(`document.querySelectorAll('[data-free-games] article').length===0&&!document.getElementById('free-games-refresh').disabled`)
  assert.equal(await evaluate(`!!document.querySelector('[data-free-games] [role=alert]')`),false)
  report.radar={giftMenu:true,transparentBlur:true,refresh:true,failureRetainsOffers:true,emptyRefreshClearsOffers:true}
  await evaluate(`document.getElementById('nav-settings').click()`)
  await ready(`!!document.getElementById('settings-tab-general')`)
  await evaluate(`document.getElementById('settings-tab-general').click()`)
  assert.equal(await evaluate(`document.querySelector('.settings-scroll').textContent.includes('Gratis-Spiele Radar')`),false,'Radar content must leave General settings')
  await evaluate(`document.getElementById('settings-tab-notifications').click()`)
  await ready(`!![...document.querySelectorAll('.settings-scroll label')].find(label=>label.textContent.includes('Gratis-Spielen'))`)
  await evaluate(`document.getElementById('nav-library').click()`)
  await ready(`!!document.getElementById('library-grid-item-steam_4704030')`)
  await evaluate(`document.getElementById('library-grid-item-steam_4704030').scrollIntoView({block:'center',behavior:'instant'})`)
  await ready(`['Invokyr Demo','Screen Stocks Demo'].every(name=>[...document.querySelectorAll('.poster-art img')].some(img=>img.alt===name&&img.complete&&img.naturalWidth>0))`)
  const covers=await evaluate(`[...document.querySelectorAll('.poster-art img')].filter(img=>['Invokyr Demo','Screen Stocks Demo'].includes(img.alt)).map(img=>({name:img.alt,url:img.src,kind:img.closest('.poster-art').dataset.artwork}))`)
  assert.equal(covers.length,2)
  assert.ok(covers.every(cover=>cover.kind==='poster'))
  assert.ok(covers.find(cover=>cover.name==='Invokyr Demo').url.includes('/3883570/'))
  assert.ok(covers.find(cover=>cover.name==='Screen Stocks Demo').url.includes('/4356780/'))
  report.covers=covers
  report.materials=materials
  await capture('demo-covers.png')
  await evaluate(`document.getElementById('nav-home').click()`)
  await ready(`!!document.querySelector('.store-hero button[id^="hero-view-"]')`)
  await evaluate(`document.querySelector('.store-hero button[id^="hero-view-"]').click()`)
  await ready(`!!document.querySelector('.game-detail-scenery')`)
  await wait(400)
  const scenery=await evaluate(`(() => {const node=document.querySelector('.game-detail-scenery'),r=node.getBoundingClientRect();const probe=document.createElement('div');probe.id='game-edge-probe';Object.assign(probe.style,{position:'absolute',inset:'0',background:'#50b4dc',zIndex:'100'});node.append(probe);return{x:Math.round(r.x),y:Math.round(r.y+r.height*.22),width:200,height:8,mask:getComputedStyle(node).maskImage,composite:getComputedStyle(node).maskComposite}})()`)
  assert.ok(scenery.composite.split(',').every(value=>value.trim()==='intersect'))
  assert.ok(scenery.mask.includes('linear-gradient'))
  for(let frame=0;frame<4;frame++){contents.invalidate();await contents.capturePage();await wait(50)}
  const pixels=(await contents.capturePage({x:scenery.x,y:scenery.y,width:200,height:8})).resize({width:200,height:8}).toBitmap()
  const edge=[]
  for(const x of [1,16,32,64,96,160]){const offset=(4*200+x)*4;edge.push(pixels[offset])}
  assert.ok(edge.at(-1)-edge[0]>120,'Artwork must blend into the sidebar edge: '+JSON.stringify(edge))
  for(let index=1;index<edge.length;index++)assert.ok(edge[index]>=edge[index-1]-8,'The edge fade must progress smoothly: '+JSON.stringify(edge))
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.game-heading')).maskImage`),'none','Titles and controls must remain fully opaque')
  await evaluate(`document.getElementById('game-edge-probe').remove()`)
  report.edgeFade={samples:edge,composite:scenery.composite,controlsUnmasked:true}
  await capture('game-edge-fade.png')
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
  await ready(`!document.querySelector('.game-detail-modal-overlay')`)
  contents.send('freegames:open')
  await ready(`!!document.querySelector('[data-free-games]')`)
  report.nativeNotificationDestination='Free Games'
  await evaluate(`document.getElementById('nav-home').click()`)
  await ready(`!!document.querySelector('.home-view')`)
  report.stickyToolbars=await require('./sticky-toolbar-smoke.cjs')(window,path.join(output,'toolbars'))
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2))
  return report
}
