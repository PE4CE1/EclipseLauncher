import processorUrl from './micNoiseGate.worklet.js?url&no-inline'

export type MicrophoneLevel = { db: number; open: boolean }
export type MicrophoneGate = { node: AudioWorkletNode; setThreshold: (value: number) => void; dispose: () => void }
const registrations = new WeakMap<AudioContext, Promise<void>>()

export async function createMicrophoneGate(context: AudioContext, threshold: number, onLevel?: (value: MicrophoneLevel) => void): Promise<MicrophoneGate> {
  let registered = registrations.get(context)
  if (!registered) {
    registered = context.audioWorklet.addModule(processorUrl)
    registrations.set(context, registered)
    void registered.catch(() => registrations.delete(context))
  }
  await registered
  const node = new AudioWorkletNode(context, 'eclipse-mic-gate', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    processorOptions: { threshold, meter: !!onLevel },
  })
  let active = true
  node.port.onmessage = event => {
    const value = event.data
    if (active && Number.isFinite(value?.db) && typeof value.open === 'boolean') onLevel?.({ db: Math.max(-60, Math.min(0, value.db)), open: value.open })
  }
  return {
    node,
    setThreshold: value => { if (active) node.port.postMessage({ threshold: value }) },
    dispose: () => { if (!active) return; active = false; node.port.onmessage = null; node.port.postMessage({ dispose: true }); node.disconnect(); node.port.close() },
  }
}
