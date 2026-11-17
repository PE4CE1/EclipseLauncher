import { requestMicrophoneStream } from '../src/services/microphoneStream'
import { createMicrophoneGate } from '../src/services/micNoiseGate'
Object.assign(window,{nativeMicrophoneProbe:async(deviceId='')=>{
  let stream:MediaStream|undefined,recorder:MediaRecorder|undefined,context:AudioContext|undefined,gate:Awaited<ReturnType<typeof createMicrophoneGate>>|undefined
  try{
    stream=await requestMicrophoneStream(deviceId)
    const track=stream.getAudioTracks()[0],chunks:Blob[]=[]
    context=new AudioContext({sampleRate:48000,latencyHint:'playback'});await context.resume()
    gate=await createMicrophoneGate(context,-36)
    const destination=context.createMediaStreamDestination()
    context.createMediaStreamSource(stream).connect(gate.node).connect(destination)
    recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus'})
    const stopped=new Promise<void>(resolve=>{recorder!.onstop=()=>resolve()})
    recorder.ondataavailable=event=>chunks.push(event.data);recorder.start()
    await new Promise(resolve=>setTimeout(resolve,650));recorder.stop();await stopped
    return{success:true,state:track.readyState,bytes:chunks.reduce((total,chunk)=>total+chunk.size,0)}
  }catch(error){return{success:false,name:(error as Error).name,message:(error as Error).message}}
  finally{if(recorder?.state==='recording')recorder.stop();gate?.dispose();stream?.getTracks().forEach(track=>track.stop());if(context?.state!=='closed')await context?.close()}
}})
