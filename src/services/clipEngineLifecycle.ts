import * as engine from './clipEngine'
import {useClipStore} from '../store/clipStore'

let current=engine
export function initClipEngine(){current.initClipEngine();return()=>current.disposeClipEngine()}
export function triggerInstantClip(...args:Parameters<typeof engine.triggerInstantClip>){return current.triggerInstantClip(...args)}
export function startReplayBuffer(...args:Parameters<typeof engine.startReplayBuffer>){return current.startReplayBuffer(...args)}
export function stopReplayBuffer(){return current.stopReplayBuffer()}
export function retryMicrophoneCapture(){return current.retryMicrophoneCapture()}

// Vite replaces modules while the window survives. Old native recorders and IPC
// listeners must stop before a new engine can claim the same replay controls.
if(import.meta.hot){
  import.meta.hot.accept('./clipEngine',next=>{
    if(!next||typeof next.initClipEngine!=='function'||typeof next.disposeClipEngine!=='function')return
    const resume=useClipStore.getState().isReplayBufferActive
    current.disposeClipEngine();current=next as unknown as typeof engine;current.initClipEngine()
    if(resume&&useClipStore.getState().settings.enabled)void current.startReplayBuffer()
  })
  import.meta.hot.dispose(()=>current.disposeClipEngine())
}
