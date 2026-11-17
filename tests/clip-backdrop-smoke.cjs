const assert = require('node:assert/strict')

module.exports = async ({ window, evaluate, until, click, change, calls }) => {
  const send = (type, x, y) => window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  await evaluate('window.__clipFixture.open("gallery-0");true')
  await until('!!document.querySelector("[data-clip-title]")')
  await click('[data-clip-title]')
  await change('[data-clip-title]', 'Backdrop saved draft')
  const point = await evaluate('(()=>{const r=document.querySelector("[data-clip-title]").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send('mousePressed', point.x, point.y)
  await send('mouseMoved', 4, 400)
  await send('mouseReleased', 4, 400)
  assert.equal(await evaluate('!!document.querySelector("[data-clip-editor]")'), true, 'Dragging out of the editor must not dismiss it')
  await send('mousePressed', 4, 400)
  await send('mouseReleased', 4, 400)
  await until('!document.querySelector("[data-clip-editor]")')
  await until('window.__clipFixture.state().clips[0].editDraft?.state.title === "Backdrop saved draft"')
  assert.ok(calls.some(call => call.name === 'save-draft' && call.payload.draft?.state.title === 'Backdrop saved draft'))
  await evaluate('window.__clipFixture.open("gallery-0");true')
  await until('document.querySelector("[data-clip-title]")?.value === "Backdrop saved draft"')
  await click('[data-clip-close]')
  await until('!document.querySelector("[data-clip-editor]")')
  return { outsideClickCloses: true, insideClickPreserved: true, dragOutPreserved: true, draftSavedAndRestored: true, closeButtonPreserved: true }
}
