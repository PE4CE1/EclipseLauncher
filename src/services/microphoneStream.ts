import workletUrl from './nativeMicrophone.worklet.js?url&no-inline'
import { microphoneConstraints } from './microphoneDevices'

export async function requestMicrophoneStream(deviceId?: string): Promise<MediaStream> {
  const api = window.electronAPI?.nativeMicrophone
  if (!api || !(await api.list()).supported) return navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(deviceId), video: false })
  const id = crypto.randomUUID()
  const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  let node: AudioWorkletNode | undefined, off: (() => void) | undefined, stream: MediaStream | undefined, closed = false
  const close = () => {
    if (closed) return
    closed = true; off?.(); node?.disconnect(); node?.port.close()
    window.removeEventListener('pagehide', close)
    void api.stop(id).catch(() => {})
    if (context.state !== 'closed') void context.close().catch(() => {})
  }
  try {
    await context.audioWorklet.addModule(workletUrl)
    node = new AudioWorkletNode(context, 'eclipse-native-microphone', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
    const destination = context.createMediaStreamDestination()
    node.connect(destination); stream = destination.stream
    const track = stream.getAudioTracks()[0], stopTrack = track.stop.bind(track)
    track.stop = () => { stopTrack(); close() }
    window.addEventListener('pagehide', close, { once: true })
    off = api.onData(packet => {
      if (packet.id !== id || closed) return
      if (packet.ended) { track.stop(); track.dispatchEvent(new Event('ended')); return }
      if (packet.pcm?.length) { const pcm = Uint8Array.from(packet.pcm); node!.port.postMessage(pcm.buffer, [pcm.buffer]) }
    })
    await context.resume()
    // Old browser-hashed device IDs cannot identify a Windows endpoint. The
    // default device is used until a native input is explicitly selected.
    await api.start(id, deviceId?.startsWith('wasapi:') ? deviceId : 'auto')
    if (closed) throw new Error('The Windows microphone stopped before capture was ready')
    return stream
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop()); close()
    if (error instanceof Error && error.message.includes('[MICROPHONE_BUSY]'))
      throw new DOMException('Eclipse microphone capture is already in use. Stop the microphone test and reconnect.', 'QuotaExceededError')
    throw error
  }
}
