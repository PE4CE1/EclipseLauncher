type MicrophoneRecoveryOptions = {
  request: () => Promise<MediaStream>
  attach: (stream: MediaStream) => () => void
  status: (available: boolean, error?: unknown, retrying?: boolean) => void
  initial?: MediaStream | null
  error?: unknown
  delay?: number
}

export function createMicrophoneRecovery(options: MicrophoneRecoveryOptions) {
  let active = true, stream: MediaStream | null = null, attempt = 0
  let detach: (() => void) | undefined, pending: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const delay = options.delay ?? 1500
  const release = () => {
    const previous = stream
    stream = null
    previous?.getAudioTracks().forEach(track => track.removeEventListener('ended', ended))
    try { detach?.() }
    finally { detach = undefined; previous?.getTracks().forEach(track => track.stop()) }
  }
  const schedule = () => {
    clearTimeout(timer)
    if (active) timer = setTimeout(() => { void retry() }, Math.min(30000, delay * 2 ** Math.min(attempt, 5)))
  }
  const ended = () => {
    if (!active) return
    release()
    options.status(false, new DOMException('Microphone disconnected', 'NotFoundError'))
    schedule()
  }
  const adopt = (next: MediaStream) => {
    const tracks = next.getAudioTracks()
    if (!tracks.length || tracks.some(track => track.readyState === 'ended')) {
      next.getTracks().forEach(track => track.stop())
      throw new DOMException('Microphone has no live input', 'NotFoundError')
    }
    stream = next
    try {
      detach = options.attach(next)
      for (const track of tracks) track.addEventListener('ended', ended, { once: true })
    } catch (error) { release(); throw error }
    attempt = 0
    options.status(true)
  }
  const retry = (): Promise<void> => {
    clearTimeout(timer)
    if (!active || stream) return Promise.resolve()
    if (pending) return pending
    options.status(false, undefined, true)
    pending = Promise.resolve().then(options.request).then(next => {
      if (!active) { next.getTracks().forEach(track => track.stop()); return }
      adopt(next)
    }).catch(error => {
      if (active) { attempt++; options.status(false, error); schedule() }
    }).finally(() => { pending = null })
    return pending
  }
  if (options.initial) {
    try { adopt(options.initial) }
    catch (error) { options.status(false, error); schedule() }
  } else { options.status(false, options.error); schedule() }
  return {
    retry,
    dispose() { if (!active) return; active = false; clearTimeout(timer); release() },
  }
}
