const assert=require('node:assert/strict')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async({evaluate,until,click,calls,finish})=>{
  const requests=()=>calls.filter(call=>call.name==='copy-discord')
  const waitForRequests=async count=>{for(let i=0;i<100&&requests().length<count;i++)await wait(20);assert.equal(requests().length,count)}
  const open=async id=>{await evaluate(`window.__clipFixture.open(${JSON.stringify(id)});true`);await until('!!document.querySelector("[data-clip-copy-discord]")')}
  const close=async()=>{await click('.clip-editor-header>button:last-child');await until('!document.querySelector("[data-clip-editor]")')}
  const copying=async()=>{await until('document.querySelector("[data-clip-copy-discord]").disabled && /vorbereitet|Preparing/.test(document.querySelector("[data-clip-copy-discord]").textContent)')}
  await open('gallery-0');await click('[data-clip-copy-discord]');await copying();await waitForRequests(1)
  await close()
  await until('!!document.querySelector("[data-clip-quick-discord=gallery-0][data-copying]")')
  assert.equal(await evaluate('document.querySelector("[data-clip-quick-discord=gallery-0]").disabled'),true)
  await evaluate('document.querySelector("[data-clip-quick-discord=gallery-1]").click();true')
  assert.equal(requests().length,1,'Closing a preview must not unlock duplicate copies')
  await open('gallery-0');await copying();await close()
  await open('gallery-1')
  assert.equal(await evaluate('document.querySelector("[data-clip-copy-discord]").disabled'),true)
  assert.equal(await evaluate('/vorbereitet|Preparing|Kopiert|Copied/.test(document.querySelector("[data-clip-copy-discord]").textContent)'),false,'Other clips must not show another clip\'s progress or success')
  finish({success:true,bytes:19_100_000})
  await until('!!document.querySelector("[data-clip-quick-discord=gallery-0][data-copied]")')
  assert.equal(await evaluate('!!document.querySelector("[data-clip-share-message]")'),false)
  await close()
  await click('[data-clip-quick-discord=gallery-1]');await waitForRequests(2)
  await open('gallery-1');await copying()
  finish({success:false,error:'Fixture export failure'})
  await until('document.querySelector("[data-clip-share-message]")?.textContent.includes("Fixture export failure")')
  assert.equal(await evaluate('document.querySelector("[data-clip-copy-discord]").disabled'),false)
  await close()
  await until('document.querySelector("[data-clip-copy-feedback=gallery-1]")?.textContent.includes("Fixture export failure")')
  await click('[data-clip-quick-discord=gallery-1]');await waitForRequests(3)
  finish({success:true,bytes:18_000_000})
  await until('!!document.querySelector("[data-clip-quick-discord=gallery-1][data-copied]")')
  assert.equal(requests().length,3)
  return{previewCloseKeepsPreparation:true,reopenKeepsPreparation:true,duplicateCopyBlocked:true,statusScopedToClip:true,libraryJobVisibleInPreview:true,completionVisibleInLibrary:true,errorVisibleAcrossViews:true,retryAfterFailure:true}
}
