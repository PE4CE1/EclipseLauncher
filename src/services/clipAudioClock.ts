export interface ClipAudioPlaybackState {
  playing: boolean
  seeking: boolean
  currentTime: number
  playbackRate: number
}

interface TrackClock {
  lastSeek: number
  largeDriftSince: number | null
  playPending: Promise<void> | null
}

/** Keep independent audio on the video clock without restarting its decoder on readiness events. */
export function createClipAudioClock(onError: (error: unknown) => void, now = () => performance.now()) {
  const tracks = new WeakMap<HTMLMediaElement, TrackClock>()
  return function sync(source: ClipAudioPlaybackState, audio: HTMLMediaElement, interrupted: boolean, discontinuity = false): void {
    let clock = tracks.get(audio)
    if (!clock) {
      clock = { lastSeek: -Infinity, largeDriftSince: null, playPending: null }
      tracks.set(audio, clock)
    }
    const timestamp = now()
    const drift = audio.currentTime - source.currentTime
    const distance = Math.abs(drift)
    const baseRate = source.playbackRate
    const pause = !source.playing || source.seeking || interrupted

    if (pause && !audio.paused) audio.pause()
    if (pause) clock.largeDriftSince = null

    // Only a user/source discontinuity may force alignment. canplay/playing can
    // fire again after a seek and must never force another seek in response.
    const align = (discontinuity || (!pause && audio.paused && !clock.playPending && timestamp-clock.lastSeek >= 1500)) && distance > .025
    if (align && !audio.seeking) {
      try {
        audio.currentTime = source.currentTime
        clock.lastSeek = timestamp
        clock.largeDriftSince = null
      } catch { /* A track that has no metadata yet is aligned when it becomes ready. */ }
    }

    if (pause || audio.seeking || audio.readyState < 2) {
      if (audio.playbackRate !== baseRate) audio.playbackRate = baseRate
      return
    }

    if (!audio.paused && timestamp-clock.lastSeek >= 1500) {
      if (distance > .35) {
        clock.largeDriftSince ??= timestamp
        if (timestamp-clock.largeDriftSince >= 300) {
          audio.currentTime = source.currentTime
          clock.lastSeek = timestamp
          clock.largeDriftSince = null
          return
        }
      } else clock.largeDriftSince = null
    }

    // Small clock differences are corrected gradually by varying speed by at
    // most 3%, rather than repeatedly dropping or replaying audio samples.
    const adjustment = distance > .04 && distance <= .35 ? Math.max(-.03, Math.min(.03, drift*.15)) : 0
    const rate = baseRate*(1-adjustment)
    if (Math.abs(audio.playbackRate-rate) > .0005) audio.playbackRate = rate
    if (audio.paused && !clock.playPending && !audio.ended) {
      const pending = audio.play()
      clock.playPending = pending
      void pending.catch(error => {
        // Pause/seek/unmount intentionally interrupts an outstanding play().
        if ((error as { name?: string })?.name !== 'AbortError') onError(error)
      }).finally(() => { if (clock!.playPending === pending) clock!.playPending = null })
    }
  }
}
