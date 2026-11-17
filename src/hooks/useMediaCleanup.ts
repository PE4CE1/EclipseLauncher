import {useEffect, type RefObject} from 'react'
import {retainMediaMemory} from '../services/mediaMemory'

/** Detaching React nodes alone can leave Chromium's decoder/read-ahead buffers alive. */
export function useMediaCleanup(root:RefObject<HTMLElement>,heavy=false) {
  useEffect(()=>{
    const element=root.current
    const releaseMemory=retainMediaMemory(heavy)
    return()=>{
      releaseMemory()
      // StrictMode replays effects while the same DOM remains mounted.
      queueMicrotask(()=>{
        if(!element||element.isConnected)return
        element.querySelectorAll<HTMLMediaElement>('video,audio').forEach(media=>{
          try {
            media.pause()
            media.srcObject=null
            media.removeAttribute('src')
            media.querySelectorAll('source').forEach(source=>source.removeAttribute('src'))
            media.load()
          }catch{ /* A destroyed renderer may already have released the media pipeline. */ }
        })
      })
    }
  },[root,heavy])
}
