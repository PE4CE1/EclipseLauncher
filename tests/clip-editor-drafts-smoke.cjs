const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async({window,evaluate,until,click,pointer,position,output,clip})=>{
  const field=async(selector,value)=>{
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();return true})()`)
    await wait(60)
  }
  const value=selector=>evaluate(`Number(document.querySelector(${JSON.stringify(selector)}).value)`)
  const shortcut=async(key,shift=false)=>{
    for(const type of ['keyDown','keyUp'])await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key,code:'Key'+key.toUpperCase(),modifiers:2+(shift?8:0)})
    await wait(70)
  }
  await field('[data-clip-title]','Draft checkpoint')
  await field('[data-track-volume=desktop]',.35)
  await click('[data-clip-undo]');assert.equal(await value('[data-track-volume=desktop]'),1)
  assert.equal(await evaluate('document.querySelector("[data-clip-title]").value'),'Draft checkpoint')
  await click('[data-clip-redo]');assert.equal(await value('[data-track-volume=desktop]'),.35)
  await shortcut('z');await shortcut('z');assert.equal(await evaluate('document.querySelector("[data-clip-title]").value'),clip.title)
  await shortcut('z',true);await shortcut('y');assert.equal(await value('[data-track-volume=desktop]'),.35)
  await field('[data-clip-trim-start]',.8);await field('[data-clip-trim-end]',3.4)
  const handle=await position('[data-trim-handle=start]'),target=await position('[data-clip-timeline]',1.1/clip.duration,.4)
  // The wider grip preserves where it was grabbed instead of snapping its edge to the pointer.
  const boundary=await position('[data-clip-timeline]',.8/clip.duration,.4)
  target.x+=handle.x-boundary.x
  await pointer('mousePressed',handle,{button:'left',clickCount:1})
  for(let i=1;i<=12;i++)await pointer('mouseMoved',{x:handle.x+(target.x-handle.x)*i/12,y:handle.y},{button:'left',buttons:1})
  await pointer('mouseReleased',target,{button:'left',clickCount:1});await wait(80)
  assert.ok(Math.abs(await value('[data-clip-trim-start]')-1.1)<.03)
  await click('[data-clip-undo]');assert.equal(await value('[data-clip-trim-start]'),.8,'One undo must reverse the entire drag')
  await click('[data-clip-redo]');assert.ok(Math.abs(await value('[data-clip-trim-start]')-1.1)<.03)

  await field('[data-clip-trim-start]',.75);await field('[data-clip-trim-end]',2.2)
  await click('[data-clip-timeline]',.99,.4);await until('Math.abs(document.querySelector("[data-clip-stage] video").currentTime-2.2)<.02')
  await click('[data-clip-timeline]',.01,.4);await until('Math.abs(document.querySelector("[data-clip-stage] video").currentTime-.75)<.02')
  await evaluate('(()=>{const select=document.querySelector(".clip-transport select");select.value="2";select.dispatchEvent(new Event("change",{bubbles:true}));return true})()')
  await click('[data-clip-play]')
  const playback=await evaluate(`new Promise(resolve=>{let max=0,outside=false;const video=document.querySelector('[data-clip-stage] video'),end=2.2,start=.75,started=performance.now();const timer=setInterval(()=>{
    max=Math.max(max,video.currentTime);const marker=document.querySelector('[data-clip-playhead]'),x=parseFloat(marker.style.left)/100*video.duration;outside||=x<start-.005||x>end+.005;
    if(video.paused||performance.now()-started>2200){clearInterval(timer);resolve({max,outside,paused:video.paused,time:video.currentTime,audio:[...document.querySelectorAll('[data-clip-editor] audio')].map(audio=>({paused:audio.paused,time:audio.currentTime}))})}
  },12)})`)
  assert.equal(playback.paused,true);assert.ok(Math.abs(playback.time-2.2)<.02,JSON.stringify(playback));assert.ok(playback.max<=2.24,JSON.stringify(playback));assert.equal(playback.outside,false);assert.ok(playback.audio.every(audio=>audio.paused&&audio.time<=2.24))
  await field('[data-clip-trim-end]',3.5);await click('[data-clip-timeline]',.16,.4);await click('[data-clip-play]');await wait(300)
  await field('[data-clip-trim-end]',.95)
  assert.equal(await evaluate('document.querySelector("[data-clip-stage] video").paused'),true)
  assert.ok(Math.abs(await evaluate('document.querySelector("[data-clip-stage] video").currentTime')-.95)<.02)

  await field('[data-clip-trim-end]',3.25);await field('[data-track-volume=mic]',.6)
  await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="saved"')
  await field('[data-track-volume=desktop]',.55);await click('[data-clip-undo]')
  assert.equal(await value('[data-track-volume=desktop]'),.35)
  await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="saved"')
  // The fixture's real metadata file is found via the temporary user-data root.
  const metadataFile=path.join(process.env.ECLIPSE_SMOKE_TEMP,'userData','clips_metadata.json')
  const saved=JSON.parse(fs.readFileSync(metadataFile,'utf8'))[clip.id].editDraft
  assert.equal(saved.state.title,'Draft checkpoint');assert.equal(saved.state.start,.75);assert.equal(saved.state.end,3.25);assert.equal(saved.state.desktopVolume,.35);assert.equal(saved.state.micVolume,.6)
  fs.writeFileSync(path.join(output,'draft-verification.json'),JSON.stringify({playback,saved},null,2))
  await click('[data-clip-close]');await until('!document.querySelector("[data-clip-editor]")')
  await click('[data-clip-draft-filter]');assert.ok(await evaluate(`!!document.querySelector('[data-clip-card="${clip.id}"] .clip-library-draft-label')`))
  await click('[data-clip-draft-filter]')
  await evaluate('window.__clipFixture.stop();true')
  const loaded=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));window.reload();await loaded
  await until('!!window.__clipFixture&&document.querySelectorAll("[data-clip-card]").length>=2')
  await evaluate(`window.__clipFixture.open(${JSON.stringify(clip.id)})`)
  await until('document.querySelector("[data-clip-trim-start]")?.value==="0.75"');await click('[data-clip-open-editor]')
  assert.equal(await value('[data-clip-trim-end]'),3.25);assert.equal(await value('[data-track-volume=desktop]'),.35);assert.equal(await value('[data-track-volume=mic]'),.6)
  assert.equal(await evaluate('document.querySelector("[data-clip-title]").value'),'Draft checkpoint')
  await click('.clip-menu>.clip-icon-button');await click('[data-clip-discard-draft]')
  await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="clean"')
  assert.equal(await value('[data-clip-trim-start]'),0);assert.equal(await value('[data-track-volume=desktop]'),1)
  assert.equal(JSON.parse(fs.readFileSync(metadataFile,'utf8'))[clip.id].editDraft,undefined)
  await click('[data-clip-undo]');assert.equal(await value('[data-clip-trim-start]'),.75)
  await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="saved"')
  await click('[data-clip-redo]')
  await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="clean"')
  assert.equal(JSON.parse(fs.readFileSync(metadataFile,'utf8'))[clip.id].editDraft,undefined,'Redo of discard must remove the draft again')
  await click('[data-clip-undo]');await until('document.querySelector("[data-clip-draft-status]").dataset.clipDraftStatus==="saved"')
  await click('[data-clip-export]');await until('!document.querySelector("[data-clip-export]").disabled',45000)
  const exported=path.join(output,'export-2.mp4')
  assert.ok(fs.existsSync(exported),'A restored draft must export successfully')
  const {inspectMedia}=require('./download-loader.cjs')()('electron/clipMedia.ts')
  const exportedFacts=await inspectMedia(require('ffmpeg-static'),exported)
  assert.ok(Math.abs(exportedFacts.duration-2.5)<.1,'Export must contain only the selected 2.5 seconds: '+exportedFacts.duration)
  await click('[data-clip-close]');await until('!document.querySelector("[data-clip-editor]")')
  await click('[data-clip-actions="'+clip.id+'"]');await click('[role=menu] button:nth-of-type(2)')
  await until('document.querySelector(".clip-library-menu button:nth-of-type(2)")?.disabled!==true')
  const galleryExport=path.join(output,'export-3.mp4')
  await until('window.__clipFixture.state().clips.length>=2')
  const deadline=Date.now()+30000
  while(!fs.existsSync(galleryExport)){assert.ok(Date.now()<deadline,'Gallery draft export must finish');await wait(50)}
  const galleryFacts=await inspectMedia(require('ffmpeg-static'),galleryExport)
  assert.ok(Math.abs(galleryFacts.duration-2.5)<.1,'Gallery export must also respect the saved draft')
  await evaluate('window.__clipFixture.open('+JSON.stringify(clip.id)+')');await until('!!document.querySelector("[data-clip-editor]")')
  assert.equal(await evaluate('window.__clipFixture.start()',true),true)
  return{playbackBounded:true,seekBounded:true,shrinkStopsPlayback:true,oneUndoPerDrag:true,undoRedoShortcuts:true,draftSurvivesReload:true,discardUndoable:true,discardRedoable:true,restoredDraftExportsSelectedDuration:true,galleryDraftExport:true}
}
