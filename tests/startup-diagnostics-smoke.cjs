const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = async function checkStartupDiagnostics(window, output) {
  const contents = window.webContents
  const evaluate = code => contents.executeJavaScript(code)
  const corsErrors = []
  const onMessage = details => { if (/CORS policy|Access-Control-Allow-Origin/.test(details.message)) corsErrors.push(details.message) }
  contents.on('console-message', onMessage)
  fs.mkdirSync(output,{recursive:true})
  try {
    const artwork = await evaluate(`(async()=>{const base='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/';return{valid:await window.electronAPI.prefetchArtwork({id:'diagnostic-valid',url:base+'990001/library_600x900.jpg'}),missing:await window.electronAPI.prefetchArtwork({id:'diagnostic-missing',url:base+'990002/library_600x900.jpg'}),invalid:await window.electronAPI.prefetchArtwork({id:'diagnostic-invalid',url:'file:///secret.jpg'})}})()`)
    assert.deepEqual(artwork,{valid:true,missing:false,invalid:false},'Missing CORS headers must not prevent encoded image prefetch')
    assert.deepEqual(corsErrors,[])
    window.showInactive()
    window.moveTop()
    await wait(400)
    await evaluate(`(()=>{const probe=document.createElement('div');probe.id='capture-test-motion';Object.assign(probe.style,{position:'fixed',inset:'100px auto auto 300px',width:'80px',height:'80px',zIndex:99999});document.body.append(probe);probe.animate([{backgroundColor:'#ef682c'},{backgroundColor:'#15171b'}],{duration:300,iterations:Infinity,direction:'alternate'})})()`)
    const source = window.getMediaSourceId()
    const capture = await evaluate(`(async()=>{
      const prepared=await window.electronAPI.clips.prepareCapture(${JSON.stringify(source)},false);
      if(!prepared.success)return prepared;
      try{
        const stream=await navigator.mediaDevices.getDisplayMedia({audio:false,video:{width:{max:640},height:{max:360},frameRate:{max:30}}});
        try {
          const tracks=stream.getVideoTracks(),settings=tracks[0]?.getSettings(),chunks=[];
          const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
          recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
          await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>recorder.stop(),3000);
            recorder.onstop=()=>{clearTimeout(timer);resolve()};
            recorder.onerror=event=>{clearTimeout(timer);reject(event.error||new Error('MediaRecorder failed'))};
            recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);if(recorder.state==='recording')recorder.stop()}};
            recorder.start(100);
          });
          const encodedBytes=chunks.reduce((total,chunk)=>total+chunk.size,0);
          return{success:true,videoTracks:tracks.length,audioTracks:stream.getAudioTracks().length,source:prepared.sourceId,settings,encodedBytes};
        } finally { stream.getTracks().forEach(track=>track.stop()) }
      }catch(error){return{success:false,name:error.name,message:error.message}}
    })()`)
    assert.equal(capture.success,true,'Prepared capture must start without a click for auto-start: '+JSON.stringify(capture))
    assert.equal(capture.videoTracks,1)
    assert.equal(capture.audioTracks,0)
    assert.ok(capture.encodedBytes>0,'MediaRecorder must produce actual WebM data, discarded after the test: '+JSON.stringify(capture))
    assert.equal(capture.source,source,'Capture must target only the isolated launcher test window')
    const denied = await evaluate(`navigator.mediaDevices.getDisplayMedia({video:true,audio:false}).then(stream=>{stream.getTracks().forEach(track=>track.stop());return false},()=>true)`)
    assert.equal(denied,true,'An unprepared second request must be denied')
    const result={artwork,corsErrors,capture,unpreparedCaptureDenied:denied}
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2))
    return result
  } finally {
    await evaluate(`document.getElementById('capture-test-motion')?.remove()`)
    contents.removeListener('console-message',onMessage)
  }
}
