// This alias is used only by the isolated native test build. No real screen or mic is captured.
const live = new Set<MediaStreamTrack>()
let sequence = 0
let microphoneLevel = .2
let microphoneFailures = 0
export function fixtureMicrophoneFailures(count:number) { microphoneFailures=count }
export function fixtureDisconnectMicrophone() { for(const track of [...microphoneTracks]){track.stop();track.dispatchEvent(new Event('ended'))} }
const microphoneTracks = new Set<MediaStreamTrack>()
const microphoneGains = new Set<GainNode>()
export function fixtureMicrophoneLevel(value: number) { microphoneLevel=value; for(const gain of microphoneGains)gain.gain.value=value }
export function fixtureCaptureStarts() { return sequence }
export const describeCaptureError = (error: unknown) => String(error)
export function liveFixtureTracks() { return [...live].filter(track=>track.readyState==='live').length }

function tone(frequency: number, microphone = false) {
  const context = new AudioContext({sampleRate:48000})
  const oscillator = context.createOscillator(), gain=context.createGain(), destination=context.createMediaStreamDestination()
  oscillator.frequency.value=frequency; gain.gain.value=microphone?microphoneLevel:.2
  if(microphone)microphoneGains.add(gain)
  oscillator.connect(gain).connect(destination); oscillator.start(); void context.resume()
  const track=destination.stream.getAudioTracks()[0], stop=track.stop.bind(track)
  live.add(track)
  if(microphone)microphoneTracks.add(track)
  track.stop=()=>{if(!live.has(track))return;stop();live.delete(track);microphoneTracks.delete(track);microphoneGains.delete(gain);oscillator.stop();void context.close()}
  return track
}
export async function fixtureMicrophone() { return new MediaStream([tone(880,true)]) }
export async function requestDesktopStream(_source: unknown, fps: number, width: number, height: number, audio: boolean) {
  const canvas=document.createElement('canvas');canvas.width=Math.min(width,1280);canvas.height=Math.min(height,720)
  const context=canvas.getContext('2d')!,rate=Math.min(fps,30),version=++sequence
  let frame=0
  const paint=()=>{
    context.fillStyle='#111416';context.fillRect(0,0,canvas.width,canvas.height)
    context.fillStyle='#5f3922';context.fillRect(0,canvas.height*.4,canvas.width,canvas.height*.6)
    context.fillStyle='#dca060';context.fillRect((frame++*9)%(canvas.width-80),canvas.height*.48,80,80)
    context.fillStyle='#ddd6c9';context.font=`bold ${Math.round(canvas.width/28)}px sans-serif`;context.fillText('ECLIPSE · CAPTURE TEST',canvas.width*.07,canvas.height*.2)
    context.fillStyle='#8a8b8e';context.font=`${Math.round(canvas.width/50)}px monospace`;context.fillText(`SOURCE ${canvas.width}×${canvas.height} / ${rate} FPS / SESSION ${version}`,canvas.width*.07,canvas.height*.3)
  }
  paint();const timer=setInterval(paint,1000/rate),stream=canvas.captureStream(rate),track=stream.getVideoTracks()[0],stop=track.stop.bind(track)
  live.add(track)
  track.stop=()=>{stop();clearInterval(timer);live.delete(track)}
  if(audio)stream.addTrack(tone(440))
  return stream
}
export async function requestMicrophoneStream(): Promise<MediaStream> { if(microphoneFailures>0){microphoneFailures--;throw new DOMException('Fixture input is temporarily busy','NotReadableError')}return fixtureMicrophone() }
