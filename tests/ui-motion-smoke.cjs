const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkUIMotion(window, output) {
  const evaluate = code => window.webContents.executeJavaScript(code)
  const ready = async expression => {
    for(let attempt=0;attempt<100;attempt++) { if(await evaluate(expression))return; await wait(50) }
    throw new Error('Motion UI timeout: '+expression)
  }
  const heights = async name => {
    const values=[]
    for(let step=0;step<12;step++) {
      window.webContents.invalidate()
      await window.webContents.capturePage()
      values.push(await evaluate(`window.${name}.getBoundingClientRect().height`))
      await wait(30)
    }
    return values
  }
  const monotonic = (values,growing,label) => {
    assert.ok(values.at(-1)>0 || !growing,label+' must reach its final state: '+JSON.stringify(values))
    for(let index=1;index<values.length;index++) assert.ok(growing?values[index]>=values[index-1]-1:values[index]<=values[index-1]+1,`${label}: ${JSON.stringify(values)}`)
  }
  window.webContents.debugger.attach('1.3')
  try {
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
  await evaluate(`document.getElementById('nav-settings').click()`)
  await ready(`!!document.getElementById('settings-tab-gameplay')`)
  await evaluate(`document.getElementById('settings-tab-gameplay').click()`)
  await ready(`!!document.querySelector('.gameplay-overlay-tab .smooth-collapse')`)
  await evaluate(`window.__motionPanel=document.querySelector('.gameplay-overlay-tab .smooth-collapse');window.__motionHeader=window.__motionPanel.previousElementSibling;true`)
  const initialY=await evaluate(`window.__motionHeader.getBoundingClientRect().y`)
  await evaluate(`window.__motionHeader.click()`)
  const opening=await heights('__motionPanel')
  if(opening.every(height=>height===0)) console.error(await evaluate(`({open:window.__motionPanel.dataset.open,rows:getComputedStyle(window.__motionPanel).gridTemplateRows,duration:getComputedStyle(window.__motionPanel).transitionDuration,children:window.__motionPanel.textContent.slice(0,150),trigger:window.__motionHeader.outerHTML.slice(0,180),performance:document.body.className})`))
  monotonic(opening,true,'Performance accordion opening')
  assert.ok(new Set(opening.map(value=>Math.round(value))).size>2,'The accordion must interpolate rather than jump open')
  assert.ok(Math.abs(await evaluate(`window.__motionHeader.getBoundingClientRect().y`)-initialY)<.5,'Opening must not trigger scroll anchoring')
  await evaluate(`window.__motionHeader.click()`)
  await wait(70)
  await evaluate(`window.__motionHeader.click()`)
  await wait(350)
  assert.equal(await evaluate(`window.__motionPanel.inert`),false)
  assert.equal(await evaluate(`document.querySelectorAll('#fps-enable-access').length`),1,'Rapid toggles must not duplicate the panel')
  await evaluate(`window.__motionHeader.click()`)
  const closing=await heights('__motionPanel')
  monotonic(closing,false,'Performance accordion closing')
  assert.ok(closing.at(-1)<.5)
  assert.equal(await evaluate(`window.__motionPanel.inert`),true)
  assert.equal(await evaluate(`window.__motionPanel.firstElementChild.childElementCount`),0,'Closed settings must release their content')

  await evaluate(`window.__motionParent=[...document.querySelectorAll('.gameplay-overlay-tab .smooth-collapse')].find(panel=>/Rocket League/.test(panel.parentElement.textContent));window.__motionParent.previousElementSibling.click()`)
  await wait(380)
  await evaluate(`window.__motionNested=[...window.__motionParent.querySelectorAll('.smooth-collapse')].find(panel=>!panel.hasAttribute('data-open'));window.__motionNested.previousElementSibling.click()`)
  const nestedOpening=await heights('__motionParent')
  monotonic(nestedOpening,true,'Nested accordion opening')
  await evaluate(`window.__motionNested.previousElementSibling.click()`)
  const nestedClosing=await heights('__motionParent')
  monotonic(nestedClosing,false,'Nested accordion closing')
  const report={opening,closing,nestedOpening,nestedClosing,rapidToggle:true,closedContentReleased:true,noScrollAnchorJump:true}
  fs.mkdirSync(output,{recursive:true})
  fs.writeFileSync(path.join(output,'overlay-motion-verification.json'),JSON.stringify(report,null,2))
  await evaluate(`document.getElementById('nav-home').click()`)
  await ready(`!!document.querySelector('.store-hero button[id^="hero-view-"]')`)
  await evaluate(`document.querySelector('.store-hero button[id^="hero-view-"]').click()`)
  await ready(`!!document.querySelector('.game-detail-modal-overlay')`)
  await wait(300)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
  await ready(`!document.querySelector('.game-detail-modal-overlay')`)
  assert.equal(await evaluate(`document.querySelector('[data-view-scene="home"]').getAnimations().some(animation=>animation.effect.getKeyframes().some(frame=>Number(frame.opacity)===.78)&&animation.effect.getKeyframes().every(frame=>!frame.transform))`),true,'Returning Home must reveal only the destination, without moving its text')
  report.destinationReveal=true
  fs.writeFileSync(path.join(output,'overlay-motion-verification.json'),JSON.stringify(report,null,2))
  return report
  } finally { window.webContents.debugger.detach() }
}
