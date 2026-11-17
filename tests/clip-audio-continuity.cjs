const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const wait = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds))

module.exports = async function checkClipAudioContinuity(window, output) {
  const evaluate = (code,gesture=false) => window.webContents.executeJavaScript(code,gesture)
  // Inspect the actual rendered PCM, not just two clocks that repeatedly seek together.
  const processor = `class ContinuityProbe extends AudioWorkletProcessor {
    constructor(){super();this.enabled=false;this.blocks=0;this.silent=0;this.run=0;this.longest=0;this.energy=0;this.frames=0;
      this.port.onmessage=event=>{if(event.data==='begin'){this.enabled=true;this.blocks=0;this.silent=0;this.run=0;this.longest=0;this.energy=0;this.frames=0;}else if(event.data==='stop')this.enabled=false;
        else if(event.data==='read')this.port.postMessage({blocks:this.blocks,silentBlocks:this.silent,longestSilentSeconds:this.longest*128/sampleRate,rms:Math.sqrt(this.energy/Math.max(1,this.frames))});};}
    process(inputs,outputs){const input=inputs[0]&&inputs[0][0];if(this.enabled){let energy=0;if(input)for(const value of input)energy+=value*value;const frames=input&&input.length||128;
      this.blocks++;this.energy+=energy;this.frames+=frames;if(energy/frames<1e-8){this.silent++;this.run++;this.longest=Math.max(this.longest,this.run);}else this.run=0;
      if(this.frames>=sampleRate*1.2)this.enabled=false;}
      for(const output of outputs)for(const channel of output)channel.fill(0);return true;}
  }registerProcessor('clip-continuity-probe',ContinuityProbe);`
  await evaluate(`(async()=>{
    const player=document.querySelector('[data-clip-stage] video');player.pause();player.currentTime=.15;
    const context=new AudioContext({sampleRate:48000});await context.resume();
    const url=URL.createObjectURL(new Blob([${JSON.stringify(processor)}],{type:'text/javascript'}));
    await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
    const tracks=[...document.querySelectorAll('[data-clip-editor] audio')].map(audio=>{
      audio.crossOrigin='anonymous';audio.load();
      const events={seeking:0,seeked:0,canplay:0,playing:0,waiting:0,pause:0};
      for(const name of Object.keys(events))audio.addEventListener(name,()=>events[name]++);
      const source=context.createMediaElementSource(audio),probe=new AudioWorkletNode(context,'clip-continuity-probe');
      source.connect(probe).connect(context.destination);return{audio,source,probe,events};
    });
    window.__audioContinuity={context,tracks};return true;
  })()`,true)
  // Both media elements are now routed through worklets whose outputs are all
  // zeros. Unmute the renderer so Chromium does not mute the measurement too.
  window.webContents.setAudioMuted(false)
  const ready = async () => {
    const deadline=Date.now()+5000
    while (!await evaluate(`window.__audioContinuity.tracks.every(({audio})=>!audio.seeking&&audio.readyState===4&&audio.buffered.length&&audio.buffered.end(audio.buffered.length-1)>=audio.duration-.05)`)) {
      assert.ok(Date.now()<deadline,'Load the complete short audio tracks before sampling steady playback')
      await wait(25)
    }
  }
  await ready()
  await evaluate(`document.querySelector('[data-clip-play]').click();true`,true)
  const begin = async () => {
    const state = await evaluate(`(()=>{const video=document.querySelector('[data-clip-stage] video');window.__audioContinuity.tracks.forEach(track=>{for(const key of Object.keys(track.events))track.events[key]=0;track.probe.port.postMessage('begin')});return{time:video.currentTime,duration:video.duration,rate:video.playbackRate,paused:video.paused}})()`)
    assert.ok(!state.paused && (state.duration-state.time)/state.rate>1.25,'The continuity sample needs enough playing media before the endpoint: '+JSON.stringify(state))
    return state
  }
  const read = () => evaluate(`Promise.all(window.__audioContinuity.tracks.map(track=>new Promise(resolve=>{
      track.probe.port.onmessage=event=>resolve({...event.data,events:track.events,currentTime:track.audio.currentTime,paused:track.audio.paused});track.probe.port.postMessage('read');
    })))`)
  await wait(400);const initialState=await begin();await wait(1200)
  const result = await read()
  const scenarios = [{ name:'normal playback',start:initialState,tracks:result }]
  for(const speed of [1.5,1]){
    await evaluate(`(()=>{const video=document.querySelector('[data-clip-stage] video');video.pause();video.currentTime=.15;const select=document.querySelector('.clip-transport select');select.value=${JSON.stringify(speed)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    const seekDeadline=Date.now()+5000
    while (!await evaluate(`(()=>{const video=document.querySelector('[data-clip-stage] video');return !video.seeking&&Math.abs(video.currentTime-.15)<.05&&[...document.querySelectorAll('[data-clip-editor] audio')].every(audio=>!audio.seeking)})()`)) {
      assert.ok(Date.now()<seekDeadline,'The seek must finish before starting a continuity sample')
      await wait(25)
    }
    await ready()
    await evaluate(`document.querySelector('[data-clip-play]').click();true`,true)
    await wait(400);const start=await begin();await wait(600)
    if(speed===1)await evaluate(`(()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [kind,value]of [['desktop',.5],['mic',.7]]){const input=document.querySelector('[data-track-volume='+kind+']');setter.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}return true})()`)
    await wait(600)
    scenarios.push({name:speed===1.5?'seek and 1.5x playback':'seek, resume and volume changes',start,tracks:await read()})
  }
  const peaks=await evaluate(`window.electronAPI.clips.analyzeClip(window.__clipFixture.state().active.id).then(result=>({game:Math.max(...result.desktop.peaks),mic:Math.max(...result.mic.peaks)}))`)
  window.webContents.setAudioMuted(true)
  await evaluate(`document.querySelector('[data-clip-stage] video').pause();window.__audioContinuity.tracks.forEach(track=>track.probe.port.postMessage('stop'));true`)
  const report={sampleSeconds:1.2,sourcePeaks:peaks,tracks:result,scenarios}
  fs.writeFileSync(path.join(output,'audio-continuity.json'),JSON.stringify(report,null,2))
  assert.equal(result.length,2)
  for (const track of scenarios.flatMap(scenario=>scenario.tracks)) {
    assert.ok(track.blocks>250,'The probe must observe real audio rendering')
    assert.ok(track.rms>.02,'The continuous test tone must reach the output: '+JSON.stringify(track))
    assert.ok(track.silentBlocks/track.blocks<.02,'Steady playback must not cut audio repeatedly: '+JSON.stringify(track))
    assert.ok(track.longestSilentSeconds<.025,'Audible gaps must not recur: '+JSON.stringify(track))
    assert.equal(track.events.seeking,0,'A playing audio track must not be continuously reset: '+JSON.stringify(track))
  }
  return report
}

module.exports.cleanup = async window => window.webContents.executeJavaScript(`(async()=>{if(!window.__audioContinuity)return;for(const track of window.__audioContinuity.tracks){track.source.disconnect();track.probe.disconnect()}await window.__audioContinuity.context.close();delete window.__audioContinuity;return true})()`)
