const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkStoreMotion(window, output) {
  const evaluate = code => window.webContents.executeJavaScript(code)
  assert.equal(await evaluate(`document.fonts.load('900 48px Inter').then(faces=>faces.some(face=>face.family==='Inter'&&face.status==='loaded'))`),true,'Inter must be available with remote networking blocked')
  const measure = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  const stable = (before,after,message) => {
    for(const property of ['x','y','width','height']) assert.ok(Math.abs(before[property]-after[property])<.5,`${message}: ${property} shifted ${after[property]-before[property]}px`)
  }
  const title=await measure('.hero-copy h2')
  const button=await measure('.hero-actions .btn-primary')
  const description=await evaluate(`document.querySelector('.hero-description').textContent`)
  await evaluate(`window.__storeFixture.refreshFeed();true`)
  await wait(250)
  stable(title,await measure('.hero-copy h2'),'Visible hero title after a sparse feed refresh')
  stable(button,await measure('.hero-actions .btn-primary'),'Hero button after a sparse feed refresh')
  assert.equal(await evaluate(`document.querySelector('.hero-description').textContent`),description,'Keep one metadata snapshot while a hero slide is visible')
  const dom=await window.webContents.debugger.sendCommand('DOM.getDocument')
  const node=await window.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.hero-actions .btn-primary'})
  await window.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['hover']})
  await wait(180)
  stable(button,await measure('.hero-actions .btn-primary'),'Hover must not scale hero text/buttons')
  await window.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:[]})

  await evaluate(`window.__storeFixture.openDetails(3);true`)
  await wait(360)
  assert.equal(await evaluate(`document.querySelector('.game-title-slot h1').classList.contains('opacity-100')`),true,'The title presentation must settle before a delayed logo arrives')
  for(let frame=0;frame<4;frame++){window.webContents.invalidate();await window.webContents.capturePage();await wait(60)}
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.game-title-slot h1')).opacity`),'1','A slow optional logo must fall back to a visible title during entry')
  const selectors=['.game-title-slot','.game-title-slot h1','.game-facts','.game-actions']
  const before=await Promise.all(selectors.map(measure))
  await evaluate(`window.__storeFixture.enrichDetails(3);true`)
  await wait(1000)
  for(let index=0;index<selectors.length;index++)stable(before[index],await measure(selectors[index]),`Late logo/metadata: ${selectors[index]}`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.game-title-slot h1')).opacity`),'1','A late logo must not replace an already visible title')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.game-title-slot > img')).opacity`),'0')
  fs.writeFileSync(path.join(output,'game-stable-title.png'),(await window.webContents.capturePage()).toPNG())
  await evaluate(`window.__storeFixture.closeDetails();true`)
  assert.equal(await evaluate(`!!document.querySelector('.game-detail-modal-overlay')`),false)
  const report={localFont:true,sparseFeedKeepsHeroGeometry:true,heroHoverNoScale:true,lateLogoDoesNotReplaceTitle:true,lateMetadataKeepsHeaderGeometry:true}
  fs.writeFileSync(path.join(output,'motion-verification.json'),JSON.stringify(report,null,2))
  return report
}
