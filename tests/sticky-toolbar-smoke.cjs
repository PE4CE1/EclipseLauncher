const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async function checkStickyToolbars(window,output){
  const contents=window.webContents
  const evaluate=code=>contents.executeJavaScript(code)
  const ready=async code=>{for(let i=0;i<160;i++){if(await evaluate(code))return;await wait(25)}throw new Error('Sticky toolbar timeout: '+code)}
  const paint=async()=>{for(let i=0;i<4;i++){contents.invalidate();await contents.capturePage();await wait(35)}}
  const focus=async active=>{
    await evaluate(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>${active}});window.dispatchEvent(new Event('${active?'focus':'blur'}'))`)
  }
  const report=[]
  fs.mkdirSync(output,{recursive:true})
  for(const view of ['library','catalogue']){
    await focus(true)
    await evaluate(`document.getElementById('nav-${view}').click()`)
    await ready(`!!document.querySelector('.launcher-toolbar.sticky')`)
    await ready(`getComputedStyle(document.querySelector('.launcher-toolbar.sticky')).backdropFilter==='blur(18px)'`)
    await wait(250)
    const bounds=await evaluate(`(()=>{
      const bar=document.querySelector('.launcher-toolbar.sticky'),scroller=bar.parentElement;
      const probe=document.createElement('div');probe.id='sticky-toolbar-probe';
      Object.assign(probe.style,{position:'absolute',top:0,left:0,right:0,height:'1800px',zIndex:1,pointerEvents:'none',background:'repeating-linear-gradient(90deg,white 0px,white 5px,black 5px,black 10px)'});
      scroller.append(probe);scroller.scrollTop=420;
      const r=bar.getBoundingClientRect();return{x:Math.round(r.x+32),y:Math.round(r.bottom-12),width:300,height:8,scroll:scroller.scrollTop};
    })()`)
    assert.ok(bounds.scroll>=400,'The probe must scroll beneath a pinned toolbar')
    const contrast=async()=>{
      await paint()
      const {x,y,width,height}=bounds
      const bitmap=(await contents.capturePage({x,y,width,height})).resize({width,height}).toBitmap(),values=[]
      for(let column=0;column<width;column++){const offset=(4*width+column)*4;values.push((bitmap[offset]+bitmap[offset+1]+bitmap[offset+2])/3)}
      return Math.max(...values)-Math.min(...values)
    }
    const blurredContrast=await contrast()
    await evaluate(`Object.assign(document.querySelector('.launcher-toolbar.sticky').style,{backdropFilter:'none',webkitBackdropFilter:'none'});true`)
    const sharpContrast=await contrast()
    assert.ok(sharpContrast>blurredContrast+30,'The toolbar must really blur scrolling pixels: '+JSON.stringify({view,blurredContrast,sharpContrast}))
    await evaluate(`(()=>{const bar=document.querySelector('.launcher-toolbar.sticky');bar.style.removeProperty('backdrop-filter');bar.style.removeProperty('-webkit-backdrop-filter')})()`)
    await focus(false)
    await ready(`getComputedStyle(document.querySelector('.launcher-toolbar.sticky')).backdropFilter==='none'`)
    const idleContrast=await contrast()
    assert.ok(idleContrast<30,'The unfocused tint must keep underlying artwork subdued without blur')
    await focus(true)
    await ready(`getComputedStyle(document.querySelector('.launcher-toolbar.sticky')).backdropFilter==='blur(18px)'`)
    await evaluate(`document.getElementById('sticky-toolbar-probe').remove();document.querySelector('.launcher-toolbar.sticky').parentElement.scrollTop=300`)
    await paint()
    fs.writeFileSync(path.join(output,`${view}-scrolled.png`),(await contents.capturePage()).toPNG())
    report.push({view,blurredContrast,sharpContrast,idleContrast,blurRestored:true})
  }
  await evaluate(`document.getElementById('nav-home').click()`)
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2))
  return report
}
