const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const load=require('./download-loader.cjs'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async({window,evaluate,until,service,media,errors,toasts})=>{
  const id='Steam|76561198000000001|0';let receive,closed=false
  await evaluate(`window.__clipFixture.stop();window.__clipFixture.game('252950','Rocket League');window.__clipFixture.configure({replayDurationSeconds:15,rocketLeagueClipDurationSeconds:5,overwatchClipDurationSeconds:5,autoClipEnabled:true,autoClipRocketLeagueEnabled:true,autoClipRocketLeaguePlayerId:${JSON.stringify(id)}});true`)
  await evaluate('window.electronAPI.clips.getSettings()')
  const auto=load({
    './autoClipConfig':{installGsiConfiguration(){throw new Error('Real game configuration is forbidden in this test')}},
    './rocketLeagueClient':{connectRocketLeagueStats(onData){receive=onData;return{close(){closed=true}}}},
  })('electron/autoClipService.ts')
  auto.initAutoClipService(()=>window,()=>service.loadClipSettings());auto.onGameStartedAutoClip('Rocket League')
  const send=goals=>receive({Event:'UpdateState',Data:{MatchGuid:'fixture-match',Players:[{Name:'Eclipse',PrimaryId:id,TeamNum:0,Goals:goals,Saves:0,Demos:0}],Game:{bReplay:false,bHasWinner:false}}})
  try{
    window.webContents.send('games:started',{name:'Rocket League',startTime:Date.now()})
    // autoStartOnGame is explicitly off in this fixture, so start manually.
    assert.equal(await evaluate('window.__clipFixture.start()',true),true)
    await until('window.__clipFixture.state().status.historyLimitSeconds===5')
    await wait(6200)
    send(0);send(1)
    await until('window.__clipFixture.state().clips.length===1',45000)
    const rocket=await evaluate('({...window.__clipFixture.state().clips[0],thumbnailUrl:"[omitted]"})')
    assert.equal(rocket.title,'Goal (Rocket League)');assert.equal(rocket.gameTitle,'Rocket League')
    const facts=await media.inspectMedia(require('ffmpeg-static'),rocket.filePath)
    assert.ok(Math.abs(facts.duration-5)<.15,JSON.stringify(facts));assert.ok(rocket.tags.includes('goal'))
    assert.equal(await evaluate('!!document.querySelector("[data-clip-editor]")'),false)
    assert.equal(toasts.length,1)
    send(2);await wait(200);assert.equal((await evaluate('window.__clipFixture.state().clips')).length,1)
    auto.onGameStoppedAutoClip();assert.equal(closed,true)
    await evaluate('window.__clipFixture.game("overwatch","Overwatch 2");true')
    window.webContents.send('games:started',{name:'Overwatch 2',startTime:Date.now()})
    await until('window.__clipFixture.state().buffer && window.__clipFixture.state().status.historyLimitSeconds===5')
    await wait(6200)
    assert.equal(await evaluate('window.__clipFixture.save()',true),true)
    await until('window.__clipFixture.state().clips.length===2',45000)
    const overwatch=await evaluate('({...window.__clipFixture.state().clips[0],thumbnailUrl:"[omitted]"})')
    assert.equal(overwatch.gameTitle,'Overwatch 2')
    const owFacts=await media.inspectMedia(require('ffmpeg-static'),overwatch.filePath)
    assert.ok(Math.abs(owFacts.duration-5)<.15,JSON.stringify(owFacts))
    for(const clip of [rocket,overwatch])for(const name of [clip.gameAudioFileName,clip.micFileName])assert.ok(name&&fs.existsSync(path.join(path.dirname(clip.filePath),name)))
    await evaluate('window.__clipFixture.close();window.__clipFixture.stop();true')
    assert.equal(await evaluate('window.__clipFixture.state().liveTracks'),0);assert.deepEqual(errors,[])
    return{syntheticGameData:true,realEncodedVideos:true,rocketGoal:true,gameProfilesOverrideGlobal15SecondsWith5Seconds:true,overwatchManualRecording:true,separateGameAndMicTracks:true,sharedCooldown:true,transportClosed:true,rocketFacts:facts,overwatchFacts:owFacts,rendererErrors:errors}
  }finally{auto.onGameStoppedAutoClip()}
}
