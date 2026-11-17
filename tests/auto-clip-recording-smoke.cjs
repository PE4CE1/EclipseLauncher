const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http')
const load=require('./download-loader.cjs')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async({window,evaluate,until,capture,service,media,output,errors,toasts})=>{
  await evaluate('window.__clipFixture.game("730","Counter-Strike 2");window.__clipFixture.configure({autoClipEnabled:true,autoClipCS2Kills:true,autoClipCS2Wins:true});true')
  await until('window.__clipFixture.state().settings.autoClipEnabled===true')
  await evaluate('window.electronAPI.clips.getSettings()')
  const rules=service.loadClipSettings()
  assert.equal(rules.autoClipEnabled,true)
  const auto=load({'./autoClipConfig':{installGsiConfiguration(){throw new Error('Real game configuration is forbidden in this test')}}})('electron/autoClipService.ts')
  auto.initAutoClipService(()=>window,()=>rules)
  const token='f'.repeat(64),server=http.createServer(auto.createCS2RequestHandler(rules,token))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const send=async(kills,steamid='76561198000000001')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}`,{method:'POST',body:JSON.stringify({auth:{token},provider:{appid:730,steamid:'76561198000000001'},player:{steamid,activity:'playing',team:'CT',state:{round_kills:kills},match_stats:{kills}},map:{name:'de_fixture',phase:'live',round:0}})})
    assert.equal(response.status,200);await response.text()
  }
  try{
    await send(7,'76561198000000002');await send(0);await wait(200)
    assert.equal((await evaluate('window.__clipFixture.state().clips')).length,0,'Spectators and initial counters cannot save a clip')
    const start=performance.now();await send(1)
    await until('!!document.querySelector("[data-clip-pending]")')
    await capture('autoclip-preparing.png')
    await until('window.__clipFixture.state().clips.length===1',45000)
    const clip=await evaluate('({...window.__clipFixture.state().clips[0],thumbnailUrl:"[omitted]"})')
    assert.equal(clip.title,'Kill (Counter-Strike 2)');assert.equal(clip.gameTitle,'Counter-Strike 2')
    assert.ok(clip.tags.includes('autoclip')&&clip.tags.includes('kill'))
    assert.equal(await evaluate('!!document.querySelector("[data-clip-editor]")'),false,'An automatic save must not interrupt gameplay by opening the editor')
    const facts=await media.inspectMedia(require('ffmpeg-static'),clip.filePath)
    assert.equal(facts.width,1280);assert.equal(facts.height,720);assert.ok(facts.duration>2&&facts.duration<=5.1)
    assert.ok(fs.statSync(clip.filePath).size>1000)
    for(const name of [clip.gameAudioFileName,clip.micFileName])assert.ok(name&&fs.existsSync(path.join(path.dirname(clip.filePath),name)))
    assert.equal(toasts.length,1)
    await send(2);await wait(300)
    assert.equal((await evaluate('window.__clipFixture.state().clips')).length,1,'The shared cooldown must prevent a duplicate recording')
    await evaluate('window.__clipFixture.stop();true')
    window.webContents.send('clip:auto-triggered',{game:'Counter-Strike 2',eventType:'kill',title:'Paused event',timestamp:Date.now()})
    await wait(250)
    assert.equal(await evaluate('window.__clipFixture.state().buffer'),false)
    assert.equal(await evaluate('window.__clipFixture.state().liveTracks'),0)
    assert.equal((await evaluate('window.__clipFixture.state().clips')).length,1)
    assert.deepEqual(errors,[])
    return{simulatedGameData:true,realSavedVideo:true,saveMilliseconds:Math.round(performance.now()-start),ownPlayerOnly:true,initialHistorySkipped:true,cooldown:true,gameAndMicTracks:true,noEditorInterruption:true,pausedBufferPreserved:true,clip,facts,rendererErrors:errors}
  }finally{
    auto.onGameStoppedAutoClip();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
}
