import { useEffect, useRef, useState } from 'react'

const FRAMES = 8, WIDTH = 160, HEIGHT = 90

function waitForFrame(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', failed) }
    const ready = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('Video preview unavailable')) }
    const timeout = setTimeout(failed, 4000)
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', failed, { once: true })
    try { if (signal.aborted) failed(); else action() } catch { failed() }
  })
}

/** A single short-lived decoder fills a small canvas; no video stays running in the timeline. */
export function ClipVideoStrip({ src, label, loadingLabel, enabled=true, poster, durationHint=0 }: { src: string; label: string; loadingLabel:string; enabled?:boolean; poster?:string; durationHint?:number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [frames, setFrames] = useState(0)
  const [failed,setFailed]=useState(false)
  useEffect(() => {
    const target = canvas.current, context = target?.getContext('2d')
    if (!target || !context) return
    setFrames(0);setFailed(false);context.clearRect(0, 0, target.width, target.height)
    if(!enabled)return
    const controller = new AbortController(), video = document.createElement('video')
    video.muted = true; video.preload = 'auto'; video.playsInline = true
    const release = () => { video.pause(); video.removeAttribute('src'); video.load() }
    void (async () => {
      try {
        await waitForFrame(video, 'loadeddata', controller.signal, () => { video.src = src; video.load() })
        const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:durationHint
        if (!duration || !video.videoWidth || !video.videoHeight) throw new Error('No video frames')
        const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight)
        const width = WIDTH / scale, height = HEIGHT / scale
        const draw = (index: number) => context.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2, width, height, index * WIDTH, 0, WIDTH, HEIGHT)
        for (let index = 0; index < FRAMES && !controller.signal.aborted; index++) {
          const time = Math.min(Math.max(0, duration - .05), (index + .5) / FRAMES * duration)
          if (Math.abs(video.currentTime - time) > .005) await waitForFrame(video, 'seeked', controller.signal, () => { video.currentTime = time })
          if (controller.signal.aborted) return
          if (!index) for (let placeholder = 0; placeholder < FRAMES; placeholder++) draw(placeholder)
          else draw(index)
          setFrames(index + 1)
        }
      } catch { if(!controller.signal.aborted)setFailed(true) }
      finally { release() }
    })()
    return () => { controller.abort(); release(); target.width = target.width }
  }, [src,enabled,durationHint])
  return <div className="clip-video-strip-wrap" aria-busy={!frames&&!failed}>{!frames&&poster&&<img className="clip-strip-poster" src={poster} alt=""/>}<canvas ref={canvas} width={FRAMES * WIDTH} height={HEIGHT} role="img" aria-label={label} className="clip-video-strip" data-clip-video-strip data-frames={frames}/>{!frames&&!failed&&<span className="clip-strip-loading" role="status"><i/>{loadingLabel}</span>}</div>
}
