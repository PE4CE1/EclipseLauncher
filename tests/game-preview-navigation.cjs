const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkPreviewNavigation(window) {
  const evaluate = code => window.webContents.executeJavaScript(code)
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
  const ready = async expression => {
    for (let attempt=0;attempt<100;attempt++) {
      if(await evaluate(expression)) return
      await wait(50)
    }
    throw new Error('Preview navigation timeout: '+expression)
  }
  const cases = [
    {underlying:'home',close:'sidebar',target:'home'},
    {underlying:'library',close:'sidebar',target:'home'},
    {underlying:'home',close:'history',target:'home'},
    {underlying:'library',close:'history',target:'library'},
    {underlying:'home',close:'label',target:'home'},
    {underlying:'home',close:'escape',target:'home'},
    {underlying:'library',close:'escape',target:'library'},
    {underlying:'home',close:'mouse',target:'home'},
    {underlying:'home',close:'rapid',target:'home'},
    {underlying:'home',close:'history',target:'home',source:'hero'},
    {underlying:'library',close:'escape',target:'library',source:'card'},
  ]
  const results=[]
  for(const item of cases) {
    await evaluate(`document.getElementById('nav-${item.underlying}').click()`)
    await wait(200)
    await ready(`[...document.querySelectorAll('.sidebar-game-item')].some(game=>game.textContent.includes('Rocket League'))`)
    await evaluate(`window.__previewHome=document.querySelector('.store-hero');window.__previewHomeScroller=document.querySelector('.home-view');if(window.__previewHomeScroller)window.__previewHomeScroller.scrollTop=140;window.__previewScroll=window.__previewHomeScroller?.scrollTop`)
    if(item.source==='hero') {
      await evaluate(`[...document.querySelectorAll('.store-hero button')].find(button=>/ansehen|view game/i.test(button.textContent)).click()`)
    } else if(item.source==='card') {
      await ready(`[...document.querySelectorAll('main .game-card')].some(card=>card.textContent.includes('Rocket League'))`)
      await evaluate(`[...document.querySelectorAll('main .game-card')].find(card=>card.textContent.includes('Rocket League')).click()`)
    } else {
      await evaluate(`[...document.querySelectorAll('.sidebar-game-item')].find(game=>game.textContent.includes('Rocket League')).dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`)
    }
    await ready(`!!document.querySelector('.game-detail-modal-overlay')`)
    await wait(200)
    const covered = await evaluate(`(() => {const base=document.querySelector('.launcher-view');return {inert:base.inert,opacity:getComputedStyle(base).opacity,detailBackground:getComputedStyle(document.querySelector('.game-detail-modal-overlay')).backgroundColor}})()`)
    assert.equal(covered.inert,true,'Covered pages must not receive input')
    assert.equal(covered.opacity,'0','The game page must not reveal the underlying Home through its translucent surfaces')
    assert.equal(covered.detailBackground,'rgba(0, 0, 0, 0)')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.topbar')).backdropFilter`),'blur(18px)','The game preview header must blur the artwork behind its controls')
    if(results.length===0) {
      const colors=await evaluate(`[...document.querySelectorAll('.game-detail-modal-overlay .launcher-card')].map(card=>getComputedStyle(card).backgroundColor)`)
      assert.ok(colors.length>0,'Game details must render their shared material panels')
      assert.ok(colors.every(color=>color.startsWith('rgba(11, 12, 16,')),JSON.stringify(colors))
      const output=path.join(__dirname,'../.cache/launcher-atmosphere')
      fs.mkdirSync(output,{recursive:true})
      for(let frame=0;frame<4;frame++){window.webContents.invalidate();await window.webContents.capturePage();await wait(60)}
      fs.writeFileSync(path.join(output,'game-matte.png'),(await window.webContents.capturePage()).toPNG())
    }
    const action = item.close==='sidebar' ? `document.getElementById('nav-${item.target}').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`
      : item.close==='history' ? `document.getElementById('topbar-history-back').click()`
      : item.close==='label' ? `document.getElementById('topbar-game-back').click()`
      : item.close==='mouse' ? `window.dispatchEvent(new MouseEvent('mouseup',{button:3,bubbles:true}))`
      : item.close==='rapid' ? `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.getElementById('nav-home').click()`
      : `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    const transition = await evaluate(`new Promise(resolve=>{
      let first=null,reappeared=false;
      const inspect=()=>{
        if(first===null && document.querySelector('.topbar').hasAttribute('data-game-open'))return;
        const base=document.querySelector('.launcher-view');
        const sample={oldPage:!!document.querySelector('.game-detail-modal-overlay'),baseVisible:getComputedStyle(base).opacity==='1',inert:base.inert,homeReused:window.__previewHome===document.querySelector('.store-hero'),scrollPreserved:!window.__previewHomeScroller||window.__previewHomeScroller.scrollTop===window.__previewScroll};
        if(first===null)first=sample;else if(sample.oldPage)reappeared=true;
      };
      const observer=new MutationObserver(inspect);observer.observe(document.body,{subtree:true,childList:true,attributes:true});
      ${action};queueMicrotask(inspect);
      setTimeout(()=>{inspect();observer.disconnect();resolve({first,reappeared})},350);
    })`)
    assert.ok(transition.first,JSON.stringify(item))
    assert.equal(transition.first.oldPage,false,`${item.close}: old preview must be absent in the first restored-page commit`)
    assert.equal(transition.reappeared,false,`${item.close}: old preview must never reappear`)
    assert.equal(transition.first.baseVisible,true)
    assert.equal(transition.first.inert,false)
    if(item.underlying===item.target) {
      assert.equal(transition.first.homeReused,true)
      assert.equal(transition.first.scrollPreserved,true,'Closing the preview must preserve the underlying page scroll')
    }
    results.push({...item,...transition})
  }
  return results
}
