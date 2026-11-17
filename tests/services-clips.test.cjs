const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const loadTs = require('./download-loader.cjs')

function clipsFixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(__dirname, 'clips-fixture-'))
  const handlers = new Map()
  const registeredHotkeys = []
  const service = loadTs({
    electron: {
      app: { getPath: () => directory, getAppPath: () => directory },
      globalShortcut: { register: hotkey => { registeredHotkeys.push(hotkey); return true }, unregister() {} },
      BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.join(directory, 'export.mp4') }) },
    },
    './ipcSecurity': { ipcMain: { handle: (name, callback) => handlers.set(name, callback) } },
    './overlayManager': { showClipSavedToast() {} },
    'ffmpeg-static': null,
    ...overrides,
  })('electron/clipService.ts')
  service.initClipsIPC()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { service, handlers, registeredHotkeys, directory, clipsDirectory: path.join(directory, 'Eclipse Clips') }
}

test('new audio defaults agree between renderer and native service and preserve saved preferences',async t=>{
  const {service,handlers}=clipsFixture(t)
  const expected={separateApplications:true,captureDesktop:true,captureMic:true,monoAudioInput:true,captureDiscord:false}
  const {DEFAULT_CLIP_AUDIO_SETTINGS}=loadTs()('src/services/clipAudioDefaults.ts')
  assert.deepEqual(DEFAULT_CLIP_AUDIO_SETTINGS,expected)
  const defaults=service.loadClipSettings()
  for(const[key,value]of Object.entries(expected))assert.equal(defaults[key],value)
  await handlers.get('clips:save-settings')({}, {separateApplications:false,captureDesktop:false,captureMic:false,monoAudioInput:false,captureDiscord:true})
  const saved=service.loadClipSettings()
  for(const[key,value]of Object.entries(expected))assert.equal(saved[key],!value,'Explicit preference must be preserved: '+key)
})

test('repeated managed Discord exports reuse the rendered file and changing edits invalidates the result',async t=>{
  let renders=0
  const {service,directory,clipsDirectory}=clipsFixture(t,{'ffmpeg-static':require('ffmpeg-static'),'./clipMedia':{exportEditedClip:async(_ffmpeg,_source,output,options)=>{
    renders++;fs.writeFileSync(output,JSON.stringify({volume:options.micVolume}));
  }}})
  fs.mkdirSync(clipsDirectory,{recursive:true})
  const source=path.join(clipsDirectory,'clip_cache.mp4');fs.writeFileSync(source,'original')
  const request={filePath:source,suggestedName:'Original',maxBytes:20_000_000},first=path.join(directory,'first.mp4'),second=path.join(directory,'second.mp4')
  await service.renderManagedClip(request,first)
  await service.renderManagedClip({...request,suggestedName:'Renamed'},second)
  assert.equal(renders,1);assert.deepEqual(fs.readFileSync(second),fs.readFileSync(first))
  await service.renderManagedClip({...request,micVolume:0},second);assert.equal(renders,2)
  fs.writeFileSync(source,'new original');await service.renderManagedClip(request,second);assert.equal(renders,3)
  await service.renderManagedClip(request,path.join(directory,'different-format.webm'));assert.equal(renders,4,'Different containers must not reuse an incompatible export')
})

test('native replay files save through real FFmpeg without copying a clip-sized buffer through IPC',async t=>{
  const ffmpeg=require('ffmpeg-static'),{EventEmitter}=require('node:events'),{execFileSync}=require('node:child_process')
  let input,released=0
  const {handlers,directory,clipsDirectory}=clipsFixture(t,{'ffmpeg-static':ffmpeg,'./nativeCaptureService':{initNativeCapture(){},takeNativeSnapshot:(owner,id)=>{assert.equal(owner.id,42);assert.equal(id,'native-fixture');return{lease:{get:part=>part==='video'?{path:input,size:fs.statSync(input).size}:undefined,release:()=>released++},mic:false,audio:{},start:Date.now()-1500,desktop:false,width:640,height:360,fps:30}}}})
  await handlers.get('clips:save-settings')({}, {videoEncoder:'cpu',notifyOnClip:false,captureMic:false})
  input=path.join(directory,'fixture.mp4')
  execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','1.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',input],{windowsHide:true})
  const sender=new EventEmitter();sender.id=42;sender.isDestroyed=()=>false
  const event={sender},data=fs.readFileSync(input)
  const result=await handlers.get('clips:save')(event,{nativeSnapshotId:'native-fixture',title:'Disk replay',gameTitle:'Fixture',duration:1,resolution:'360p',fps:30,bitrate:'2M',thumbnailDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII='})
  assert.equal(result.success,true,result.error)
  assert.equal(result.clip.width,640);assert.equal(result.clip.height,360)
  assert.ok(result.clip.duration>.9&&result.clip.duration<1.2)
  assert.match(result.clip.thumbnailUrl,/^local-media:\/\//)
  assert.ok(fs.statSync(path.join(directory,'clips_metadata.json')).size<3000)
  assert.deepEqual(fs.readFileSync(input),data,'Saving a snapshot must preserve the live recorder source')
  assert.equal(released,1)
  await handlers.get('clips:delete')({},result.clip.id)
  assert.equal(fs.readdirSync(clipsDirectory).filter(file=>file.includes('.thumb.')).length,0)
})

test('legacy base64 thumbnails migrate once to files without changing their bytes',async t=>{
  const {handlers,directory,clipsDirectory}=clipsFixture(t)
  fs.mkdirSync(clipsDirectory,{recursive:true});fs.writeFileSync(path.join(clipsDirectory,'clip_legacy.mp4'),Buffer.alloc(700))
  const image=Buffer.alloc(50000,19),thumbnail='data:image/jpeg;base64,'+image.toString('base64')
  fs.writeFileSync(path.join(directory,'clips_metadata.json'),JSON.stringify({clip_legacy:{id:'clip_legacy',fileName:'clip_legacy.mp4',thumbnailUrl:thumbnail,title:'Legacy',gameTitle:'Fixture',duration:1,createdAt:1}}))
  const clips=await handlers.get('clips:list')()
  assert.equal(clips.length,1);assert.match(clips[0].thumbnailUrl,/^local-media:\/\//)
  assert.deepEqual(fs.readFileSync(path.join(clipsDirectory,'clip_legacy.thumb.jpg')),image)
  assert.ok(fs.statSync(path.join(directory,'clips_metadata.json')).size<1000)
  assert.equal((await handlers.get('clips:list')())[0].thumbnailUrl,clips[0].thumbnailUrl)
})

test('unchanged clip metadata is parsed once and external file updates invalidate that cache',async t=>{
  let reads=0
  const {handlers,directory,clipsDirectory}=clipsFixture(t,{fs:{...fs,readFileSync:(file,...args)=>{if(String(file).endsWith('clips_metadata.json'))reads++;return fs.readFileSync(file,...args)}}})
  fs.mkdirSync(clipsDirectory,{recursive:true});fs.writeFileSync(path.join(clipsDirectory,'clip_cached.mp4'),Buffer.alloc(700))
  const metadata={clip_cached:{id:'clip_cached',fileName:'clip_cached.mp4',title:'First',thumbnailUrl:'',duration:1}}
  const file=path.join(directory,'clips_metadata.json');fs.writeFileSync(file,JSON.stringify(metadata))
  await handlers.get('clips:list')();await handlers.get('clips:list')()
  assert.equal(reads,1)
  metadata.clip_cached.title='Externally updated title';fs.writeFileSync(file,JSON.stringify(metadata))
  const result=await handlers.get('clips:list')()
  assert.equal(reads,2);assert.equal(result[0].title,'Externally updated title')
})

test('a rename committed during thumbnail migration is preserved in the list and metadata',async t=>{
  let unblock,started
  const blocked=new Promise(resolve=>{unblock=resolve}),ready=new Promise(resolve=>{started=resolve})
  const io={...fs,promises:{...fs.promises,writeFile:async(file,...args)=>{if(String(file).includes('.thumb.')&&String(file).endsWith('.tmp')){started();await blocked}return fs.promises.writeFile(file,...args)}}}
  const {handlers,directory,clipsDirectory}=clipsFixture(t,{fs:io})
  fs.mkdirSync(clipsDirectory,{recursive:true});fs.writeFileSync(path.join(clipsDirectory,'clip_rename.mp4'),Buffer.alloc(700))
  fs.writeFileSync(path.join(directory,'clips_metadata.json'),JSON.stringify({clip_rename:{id:'clip_rename',fileName:'clip_rename.mp4',title:'Before',thumbnailUrl:'data:image/jpeg;base64,'+Buffer.from('image').toString('base64'),duration:1}}))
  const loading=handlers.get('clips:list')();await ready
  assert.equal((await handlers.get('clips:update-meta')({}, {clipId:'clip_rename',title:'After rename'})).success,true)
  unblock();const result=await loading
  assert.equal(result[0].title,'After rename')
  const metadata=JSON.parse(fs.readFileSync(path.join(directory,'clips_metadata.json'),'utf8'))
  assert.equal(metadata.clip_rename.title,'After rename');assert.match(metadata.clip_rename.thumbnailUrl,/^local-media:\/\//)
})

test('only replay hotkeys are registered while full recording is unavailable', t => {
  const { registeredHotkeys } = clipsFixture(t)
  assert.deepEqual(registeredHotkeys, ['F8'])
})

test('ordinary clip settings never re-register the global hotkey', async t => {
  const { handlers, registeredHotkeys } = clipsFixture(t)
  const save = handlers.get('clips:save-settings')
  for (const duration of [45,60,90,120,30]) await save({}, { replayDurationSeconds: duration })
  await save({}, { micVolume: 42 }); await save({}, { notifyOnClip: false })
  assert.deepEqual(registeredHotkeys, ['F8'])
  await save({}, { hotkey: 'F8' })
  assert.deepEqual(registeredHotkeys, ['F8'])
  await save({}, { hotkey: 'F9' })
  assert.deepEqual(registeredHotkeys, ['F8','F9'])
})

test('live audio history can shrink and grow while queued snapshots stay intact', () => {
  const { PcmTimeline } = loadTs({ electron: {}, './ipcSecurity': { ipcMain: {} } })('electron/processAudioCapture.ts')
  const timeline = new PcmTimeline(100_000, 600_000), pcm = Buffer.from([1,0,2,0])
  timeline.append(1000, pcm); timeline.append(20_000, pcm)
  const frozen = timeline.snapshot()
  timeline.setRetention(5)
  assert.equal(timeline.wav(1000, .001).readInt16LE(44), 0)
  assert.equal(frozen.wav(1000, .001).readInt16LE(44), 1)
  timeline.setRetention(60); timeline.append(21_000, pcm)
  assert.equal(timeline.wav(20_000, .001).readInt16LE(44), 1)
  assert.throws(() => timeline.setRetention(0), /Invalid/)
})

test('clip deletion rejects empty/traversal IDs and only deletes an exact legacy basename', async t => {
  const { handlers, clipsDirectory } = clipsFixture(t)
  const first = path.join(clipsDirectory, 'clip_123.mp4')
  const second = path.join(clipsDirectory, 'clip_1234.mp4')
  fs.writeFileSync(first, 'video')
  fs.writeFileSync(second, 'different video')
  for (const id of ['', '..', '../other', '__proto__']) {
    assert.equal((await handlers.get('clips:delete')({}, id)).success, false)
  }
  assert.deepEqual(fs.readdirSync(clipsDirectory).sort(), ['clip_123.mp4', 'clip_1234.mp4'])
  assert.equal((await handlers.get('clips:delete')({}, 'clip_123')).success, true)
  assert.equal(fs.existsSync(first), false)
  assert.equal(fs.readFileSync(second, 'utf8'), 'different video')
})

test('clip deletion ignores a corrupt metadata filename outside the clips directory', async t => {
  const { handlers, clipsDirectory, directory } = clipsFixture(t)
  fs.writeFileSync(path.join(directory, 'important.txt'), 'keep')
  fs.writeFileSync(path.join(directory, 'clips_metadata.json'), JSON.stringify({ clip_test: { fileName: '../important.txt' } }))
  assert.equal((await handlers.get('clips:delete')({}, 'clip_test')).success, true)
  assert.equal(fs.readFileSync(path.join(directory, 'important.txt'), 'utf8'), 'keep')
  assert.deepEqual(fs.readdirSync(clipsDirectory), [])
})

test('listing clips does not delete an in-progress video or unrelated temp file', async t => {
  const { handlers, clipsDirectory } = clipsFixture(t)
  fs.writeFileSync(path.join(clipsDirectory, 'temp_clip_123.mp4'), 'encoding')
  fs.writeFileSync(path.join(clipsDirectory, 'temp_personal.txt'), 'keep')
  assert.deepEqual(await handlers.get('clips:list')({}), [])
  assert.deepEqual(fs.readdirSync(clipsDirectory).sort(), ['temp_clip_123.mp4', 'temp_personal.txt'])
})

test('clip reads reject arbitrary files outside the configured video directory', async t => {
  const { handlers, directory } = clipsFixture(t)
  const privateFile = path.join(directory, 'account.mp4')
  fs.writeFileSync(privateFile, 'PRIVATE')
  const result = await handlers.get('clips:read-video-data')({}, privateFile)
  assert.equal(result.success, false)
  assert.equal(result.dataUrl, undefined)
})

test('deleting a clip removes exactly its audio sidecars and preserves another clip',async t=>{
  const {handlers,clipsDirectory,directory}=clipsFixture(t)
  for(const name of ['clip_one.mp4','clip_one.game.m4a','clip_one.mic.m4a','clip_two.mp4','clip_two.mic.m4a'])fs.writeFileSync(path.join(clipsDirectory,name),'fixture')
  fs.writeFileSync(path.join(directory,'clips_metadata.json'),JSON.stringify({clip_one:{id:'clip_one',fileName:'clip_one.mp4',gameAudioFileName:'clip_one.game.m4a',micFileName:'clip_one.mic.m4a'},clip_two:{id:'clip_two',fileName:'clip_two.mp4',micFileName:'clip_two.mic.m4a'}}))
  assert.equal((await handlers.get('clips:delete')({},'clip_one')).success,true)
  assert.deepEqual(fs.readdirSync(clipsDirectory).sort(),['clip_two.mic.m4a','clip_two.mp4'])
})

test('clip settings reject impossible resolution, FPS, bitrate and audio levels',async t=>{
  const {handlers}=clipsFixture(t)
  for(const settings of [{quality:'fake8k'},{fps:999},{bitrate:'5000M'},{micVolume:NaN},{audioOutputVolume:-10},{micSensitivity:-200}])await assert.rejects(handlers.get('clips:save-settings')({},settings))
})

test('automatic clip settings are persisted in clip settings and validated at IPC',async t=>{
  let refreshed=0
  const {handlers,directory,service}=clipsFixture(t,{'./autoClipService':{getAutoClipStatus:()=>({activeGame:null,games:{}}),setupAutoClipGame:async id=>({success:id==='cs2'}),refreshAutoClipSettings:()=>refreshed++}})
  const save=handlers.get('clips:save-settings')
  for(const invalid of [{autoClipEnabled:'true'},{autoClipDota2Enabled:1},{autoClipLoLDeaths:null},{autoClipCooldownSeconds:NaN},{autoClipCooldownSeconds:0}])await assert.rejects(save({},invalid))
  for(const invalid of [{autoClipRocketLeaguePlayerId:'../../bad'},{rocketLeagueClipDurationSeconds:NaN},{overwatchClipDurationSeconds:601},{overwatchClipDurationSeconds:'30'}])await assert.rejects(save({},invalid))
  await save({},{autoClipEnabled:true,autoClipDota2Enabled:true,autoClipLoLEnabled:false,autoClipCooldownSeconds:20})
  assert.equal(refreshed,1)
  const settings=service.loadClipSettings();assert.equal(settings.autoClipDota2Enabled,true);assert.equal(settings.autoClipEnabled,true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'clip_settings.json'),'utf8')).autoClipCooldownSeconds,20)
  assert.deepEqual(await handlers.get('clips:autoclip-status')({}),{activeGame:null,games:{}})
  assert.equal((await handlers.get('clips:autoclip-setup')({},'cs2')).success,true)
})

test('drafts persist atomically with the clip, restore their title, and cannot recreate deleted clips',async t=>{
  const {handlers,directory,clipsDirectory}=clipsFixture(t),metadata=path.join(directory,'clips_metadata.json')
  const file=path.join(clipsDirectory,'clip_draft.mp4');fs.writeFileSync(file,'original media')
  fs.writeFileSync(metadata,JSON.stringify({clip_draft:{id:'clip_draft',fileName:'clip_draft.mp4',title:'Original',gameTitle:'Fixture',duration:20,width:1280,height:720}}))
  const save=handlers.get('clips:save-draft'),draft={sourceDuration:20,state:{title:'My cut',start:3,end:8,gameVolume:.4,micVolume:0}}
  const result=await save({},{clipId:'clip_draft',draft:{...draft,baseTitle:'Injected'}})
  assert.equal(result.success,true);assert.equal(result.draft.baseTitle,'Original');assert.equal(result.title,'My cut')
  assert.deepEqual(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_draft.editDraft.state,draft.state)
  assert.equal((await handlers.get('clips:list')({}))[0].editDraft.state.end,8)
  const second=await save({},{clipId:'clip_draft',draft:{...draft,state:{...draft.state,title:'Another cut'}}})
  assert.equal(second.draft.baseTitle,'Original')
  const cleared=await save({},{clipId:'clip_draft',draft:null});assert.equal(cleared.draft,null);assert.equal(cleared.title,'Original')
  assert.equal(fs.readFileSync(file,'utf8'),'original media')
  await handlers.get('clips:delete')({},'clip_draft')
  assert.equal((await save({},{clipId:'clip_draft',draft})).success,false)
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_draft,undefined)
})

test('quick renaming persists the name and preserves edits when a draft is discarded later',async t=>{
  const {handlers,directory,clipsDirectory}=clipsFixture(t),metadata=path.join(directory,'clips_metadata.json')
  const file=path.join(clipsDirectory,'clip_rename.mp4');fs.writeFileSync(file,'original media')
  fs.writeFileSync(metadata,JSON.stringify({clip_rename:{id:'clip_rename',fileName:'clip_rename.mp4',title:'Original',gameTitle:'Fixture',duration:20,tags:['keep']}}))
  const state={title:'Draft title',start:3,end:8,gameVolume:.4,micVolume:0,discordVolume:.2,cuts:[{start:4,end:5}],output:'portrait',cropX:.3}
  await handlers.get('clips:save-draft')({},{clipId:'clip_rename',draft:{sourceDuration:20,state}})
  const result=await handlers.get('clips:update-meta')({},{clipId:'clip_rename',title:'  Neuer Name 🎮  '})
  assert.equal(result.success,true);assert.equal(result.meta.title,'Neuer Name 🎮');assert.equal(result.meta.editDraft.baseTitle,'Neuer Name 🎮');assert.deepEqual(result.meta.editDraft.state,{...state,title:'Neuer Name 🎮'});assert.deepEqual(result.meta.tags,['keep'])
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_rename.title,'Neuer Name 🎮')
  for(const title of ['', '   ', 'x'.repeat(501)])assert.equal((await handlers.get('clips:update-meta')({},{clipId:'clip_rename',title})).success,false)
  const cleared=await handlers.get('clips:save-draft')({},{clipId:'clip_rename',draft:null});assert.equal(cleared.title,'Neuer Name 🎮');assert.equal(fs.readFileSync(file,'utf8'),'original media')
})

test('draft IPC rejects invalid IDs, malformed edits and media outside the clip directory',async t=>{
  const {handlers,directory,clipsDirectory}=clipsFixture(t),metadata=path.join(directory,'clips_metadata.json')
  fs.writeFileSync(path.join(clipsDirectory,'clip_valid.mp4'),'keep')
  fs.writeFileSync(metadata,JSON.stringify({clip_valid:{id:'clip_valid',fileName:'clip_valid.mp4',title:'Original'}}))
  const save=handlers.get('clips:save-draft'),draft={sourceDuration:10,state:{title:'Draft',start:1,end:8,gameVolume:1,micVolume:1}}
  for(const payload of [null,{clipId:'../file',draft},{clipId:'__proto__',draft},{clipId:'clip_valid',draft:{}},{clipId:'clip_valid',draft:{...draft,state:{...draft.state,end:Infinity}}}])assert.equal((await save({},payload)).success,false)
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_valid.title,'Original')
})

test('failed atomic draft writes preserve the old metadata and can be retried',async t=>{
  let fail=false
  const {handlers,directory,clipsDirectory}=clipsFixture(t,{fs:{...fs,writeFileSync(file,...args){if(fail&&String(file).endsWith('.tmp'))throw Error('Disk full');return fs.writeFileSync(file,...args)}}})
  fs.writeFileSync(path.join(clipsDirectory,'clip_retry.mp4'),'media')
  const metadata=path.join(directory,'clips_metadata.json')
  fs.writeFileSync(metadata,JSON.stringify({clip_retry:{id:'clip_retry',fileName:'clip_retry.mp4',title:'Original'}}))
  const payload={clipId:'clip_retry',draft:{sourceDuration:10,state:{title:'Saved draft',start:1,end:8,gameVolume:.5,micVolume:1}}}
  fail=true;assert.equal((await handlers.get('clips:save-draft')({},payload)).success,false)
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_retry.title,'Original')
  fail=false;assert.equal((await handlers.get('clips:save-draft')({},payload)).success,true)
  assert.equal(JSON.parse(fs.readFileSync(metadata,'utf8')).clip_retry.editDraft.state.title,'Saved draft')
})

test('media analysis and cached results preserve edits saved during and after analysis',async t=>{
  let release,started
  const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve)
  const {handlers,directory,clipsDirectory}=clipsFixture(t,{'ffmpeg-static':process.execPath,'./clipMedia':{
    inspectMedia:async()=>({hasVideo:true,hasAudio:true,duration:10,width:640,height:360,fps:30,averageFps:30,fileSize:5,bitrate:1000}),
    extractWaveform:async()=>{started();await gate;return[.1,.3]},
  }})
  fs.writeFileSync(path.join(clipsDirectory,'clip_analysis.mp4'),'media')
  const metadata=path.join(directory,'clips_metadata.json')
  fs.writeFileSync(metadata,JSON.stringify({clip_analysis:{id:'clip_analysis',fileName:'clip_analysis.mp4',title:'Original'}}))
  const analysis=handlers.get('clips:analyze')({},'clip_analysis');await ready
  const draft={sourceDuration:10,state:{title:'During analysis',start:2,end:7,gameVolume:.5,micVolume:1}}
  await handlers.get('clips:save-draft')({},{clipId:'clip_analysis',draft});release()
  const result=await analysis;assert.equal(result.clip.editDraft.state.start,2);assert.equal(result.clip.title,'During analysis')
  draft.state.title='After analysis';await handlers.get('clips:save-draft')({},{clipId:'clip_analysis',draft})
  const cached=await handlers.get('clips:analyze')({},'clip_analysis');assert.equal(cached.clip.title,'After analysis');assert.equal(cached.clip.editDraft.state.end,7)
})

test('unavailable FFmpeg fails explicitly instead of saving WebM bytes under an MP4 extension', async t => {
  const { service, directory } = clipsFixture(t)
  const input = path.join(directory, 'input.webm')
  const output = path.join(directory, 'output.mp4')
  fs.writeFileSync(input, 'WEBM DATA')
  await assert.rejects(service.processVideoFile(input, output, 'mp4', 30), /FFmpeg is unavailable/)
  assert.equal(fs.existsSync(output), false)
})

test('FFmpeg executable resolves to the physical unpacked path in packaged builds', () => {
  const packed = path.join('C:/Program Files/Eclipse/resources/app.asar', 'node_modules/ffmpeg-static/ffmpeg.exe')
  const unpacked = packed.replace('app.asar', 'app.asar.unpacked')
  const { getFFmpegPath } = loadTs({
    electron: { app: { getAppPath: () => 'C:/app.asar' } },
    './ipcSecurity': { ipcMain: {} },
    './overlayManager': {},
    'ffmpeg-static': packed,
    fs: { existsSync: name => name === unpacked },
  })('electron/clipService.ts')
  assert.equal(getFFmpegPath(), unpacked)
})

test('FFmpeg preparation failures reject rather than leaving an async Promise executor hanging', async () => {
  const { processVideoFile } = loadTs({
    electron: { app: {} },
    './ipcSecurity': { ipcMain: {} },
    './overlayManager': {},
    'ffmpeg-static': 'ffmpeg.exe',
    fs: { existsSync: () => true, statSync: () => { throw new Error('file disappeared') } },
    child_process: { execFile: (_file, _args, _options, callback) => queueMicrotask(() => callback(null, '', '')) },
  })('electron/clipService.ts')
  await assert.rejects(processVideoFile('input.webm', 'output.mp4', 'mp4', 30), /file disappeared/)
})

test('failed WebM transcodes retain WebM-compatible codecs through every fallback and report failure', async () => {
  const commands = []
  const { processVideoFile } = loadTs({
    electron: { app: {} },
    './ipcSecurity': { ipcMain: {} }, './overlayManager': {},
    'ffmpeg-static': 'ffmpeg.exe',
    fs: { existsSync: () => true, statSync: () => ({ size: 50000 }) },
    child_process: { execFile: (_file, args, _options, callback) => {
      if (args.includes('lavfi')) return queueMicrotask(() => callback(null, '', ''))
      if (args.includes('framecrc')) return queueMicrotask(() => callback(null, '#tb 0: 1/60\n0, 0, 0, 1, 100, 0\n0, 1799, 1799, 1, 100, 0\n', 'Duration: 00:00:30.00\nStream #0:0 Video: vp8, 1280x720, 60 fps\nStream #0:1 Audio: opus'))
      commands.push(args)
      queueMicrotask(() => callback(new Error('encoder failed'), '', ''))
    } },
  })('electron/clipService.ts')
  await assert.rejects(processVideoFile('input.webm', 'output.webm', 'webm', 30), /FFmpeg/)
  assert.equal(commands.length, 1)
  for (const command of commands) {
    assert.equal(command[command.indexOf('-c:v') + 1], 'libvpx-vp9')
    assert.equal(command[command.indexOf('-c:a') + 1], 'libopus')
    assert.equal(command.includes('-movflags'), false)
  }
})

test('failed clip trim leaves an existing export untouched and reports failure', async t => {
  const { handlers, directory, clipsDirectory } = clipsFixture(t)
  const source = path.join(clipsDirectory, 'original.mp4')
  const target = path.join(directory, 'export.mp4')
  fs.writeFileSync(source, 'ORIGINAL')
  fs.writeFileSync(target, 'PREVIOUS EXPORT')
  const result = await handlers.get('clips:export')({}, { filePath: source, suggestedName: 'clip', trimStart: 1, trimEnd: 5 })
  assert.equal(result.success, false)
  assert.match(result.error, /FFmpeg/)
  assert.equal(fs.readFileSync(target, 'utf8'), 'PREVIOUS EXPORT')
  assert.equal(fs.readFileSync(source, 'utf8'), 'ORIGINAL')
})


