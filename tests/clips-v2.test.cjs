const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),load=require('./download-loader.cjs')
const edits=load()('src/services/clipEdits.ts')
test('multiple cuts merge, persist in undo history and retain at least one playable section',()=>{
 const initial={title:'clip',start:0,end:10,gameVolume:1,micVolume:1},history=new edits.ClipEditHistory(initial,10)
 history.update({cuts:[{start:2,end:4},{start:3,end:5},{start:7,end:8}],output:'portrait',cropX:.2,discordVolume:.4})
 assert.deepEqual(history.present.cuts,[{start:2,end:5},{start:7,end:8}]);assert.equal(edits.clipOutputDuration(history.present),6);assert.equal(edits.clampClipPosition(3,history.present),5);assert.equal(edits.clipOutputTime(6,history.present),3);assert.equal(edits.clipSourceTime(3,history.present),6);assert.equal(edits.clipSourceTime(2,history.present),5);assert.equal(edits.clipSourceTime(100,history.present),10)
 assert.equal(edits.validateClipDraftInput({state:history.present,sourceDuration:10}).state.output,'portrait');history.undo();assert.equal(history.present.cuts,undefined);history.redo();assert.equal(history.present.discordVolume,.4)
 for(const patch of [{cuts:[{start:0,end:10}]},{cuts:[{start:-1,end:3}]},{cropX:2},{output:'invalid'},{discordVolume:NaN}])assert.throws(()=>edits.validateClipDraftInput({state:{...initial,...patch},sourceDuration:10}))
})
test('process audio snapshots preserve wall-clock offsets, real silence and bounded memory',()=>{
 const {PcmTimeline}=load({electron:{app:{}},'./ipcSecurity':{ipcMain:{}}})('electron/processAudioCapture.ts'),timeline=new PcmTimeline(32)
 timeline.append(1000,Buffer.alloc(16,1));timeline.append(1001,Buffer.alloc(16,2));const wav=timeline.wav(1000,.01);assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav[44],1);assert.equal(wav[44+48*4],2);assert.equal(wav[44+80*4],0)
 timeline.append(1002,Buffer.alloc(16,3));assert.equal(timeline.wav(1000,.01)[44],0);assert.throws(()=>timeline.wav(0,700))
})

test('queued process audio keeps its original snapshot when the live ring discards old chunks',()=>{
 const {PcmTimeline}=load({electron:{app:{}},'./ipcSecurity':{ipcMain:{}}})('electron/processAudioCapture.ts'),live=new PcmTimeline(32)
 live.append(1000,Buffer.alloc(16,7));live.append(1001,Buffer.alloc(16,8));const frozen=live.snapshot()
 live.append(1002,Buffer.alloc(32,9))
 assert.equal(live.wav(1000,.01)[44],0);assert.equal(frozen.wav(1000,.01)[44],7);assert.equal(frozen.wav(1000,.01)[44+48*4],8)
})
test('Steam event covers come from the matching official announcement and localized assets',()=>{
 const {parseSteamNewsEvents}=load()('src/services/steamNews.ts'),hash='a'.repeat(40),german='b'.repeat(40),event={appid:1966720,published:1,hidden:0,event_type:14,announcement_body:{gid:'123',clanid:'42630547'},jsondata:JSON.stringify({localized_title_image:[hash+'.jpg',german+'.png'],localized_capsule_image:[hash+'.png']})}
 const result=parseSteamNewsEvents({events:[event,{...event,appid:1},{...event,hidden:1},{...event,jsondata:'invalid'}]},1966720,'de');assert.equal(result.length,1);assert.equal(result[0].type,14);assert.equal(result[0].image,'https://clan.fastly.steamstatic.com/images/42630547/'+german+'.png');assert.equal(result[0].id,'123')
})
test('real multi-cut exports join video and three independent tracks, crop and enforce byte limits',async t=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'.clip-v2-'));t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(__dirname));fs.rmSync(directory,{recursive:true,force:true})})
 const ffmpeg=require('ffmpeg-static'),media=load()('electron/clipMedia.ts'),run=args=>execFileSync(ffmpeg,['-nostdin','-v','error','-y',...args],{windowsHide:true,maxBuffer:8*1024*1024}),source=path.join(directory,'input.mp4')
 run(['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','4','-c:v','libx264','-preset','ultrafast','-c:a','aac',source])
 const paths={};for(const [kind,freq]of [['game',440],['mic',880],['discord',1320]]){paths[kind]=path.join(directory,kind+'.wav');run(['-f','lavfi','-i','sine=frequency='+freq+':sample_rate=48000','-t','4',paths[kind]])}
 const raw=path.join(directory,'clip.mp4'),game=path.join(directory,'game.m4a'),mic=path.join(directory,'mic.m4a'),discord=path.join(directory,'discord.m4a')
 await media.encodeReplay(ffmpeg,source,raw,{duration:4,fps:24,quality:'720p',bitrate:'4M',format:'mp4',encoder:'libx264',audio:{gamePath:paths.game,micPath:paths.mic,discordPath:paths.discord,gameOutputPath:game,micOutputPath:mic,discordOutputPath:discord}})
 assert.ok(fs.existsSync(discord))
 const exported=path.join(directory,'shorts.mp4');await media.exportEditedClip(ffmpeg,raw,exported,{start:0,end:4,cuts:[{start:1,end:2}],output:'portrait',cropX:.2,maxBytes:1000000,separate:true,gameFile:game,micFile:mic,discordFile:discord,gameVolume:0,micVolume:0,discordVolume:1})
 const facts=await media.inspectMedia(ffmpeg,exported);assert.ok(Math.abs(facts.duration-3)<.08);assert.equal(facts.width,202);assert.equal(facts.height,360);assert.ok(facts.fileSize<=1000000)
 const pcm=run(['-i',exported,'-map','0:a','-ac','1','-ar','8000','-f','f32le','pipe:1']),samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.byteLength/4),tone=frequency=>{let re=0,im=0;for(let i=0;i<samples.length;i++){const angle=2*Math.PI*frequency*i/8000;re+=samples[i]*Math.cos(angle);im+=samples[i]*Math.sin(angle)}return Math.hypot(re,im)*2/samples.length}
 assert.ok(tone(1320)>.02);for(const frequency of [440,660,880])assert.ok(tone(frequency)<tone(1320)*.02,'Muted or unrelated source must not leak into export')
 const square=path.join(directory,'square.mp4');await media.exportEditedClip(ffmpeg,raw,square,{start:.5,end:2.5,output:'square',separate:false,gameVolume:1,micVolume:1});const squareFacts=await media.inspectMedia(ffmpeg,square);assert.equal(squareFacts.width,360);assert.equal(squareFacts.height,360)
  const cuts=Array.from({length:10},(_,i)=>({start:.2+i*.3,end:.27+i*.3})),many=path.join(directory,'many-cuts.mp4')
  await media.exportEditedClip(ffmpeg,raw,many,{start:0,end:4,cuts,separate:true,gameFile:game,micFile:mic,discordFile:discord,gameVolume:1,micVolume:1,discordVolume:1})
  const manyFacts=await media.inspectMedia(ffmpeg,many),audio=run(['-i',many,'-map','0:a','-ac','1','-ar','48000','-f','s16le','pipe:1'])
  assert.ok(Math.abs(manyFacts.duration-3.3)<.05,'Many cuts must not accumulate frame rounding errors: '+manyFacts.duration)
  assert.ok(Math.abs(audio.length/96000-3.3)<.04,'Audio must retain sample-accurate cut duration')
})
