// Sound synthesis service for customizable UI sounds via Web Audio API

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export type SoundPreset = {
  id: string
  name: string
  desc: string
}

export function getSoundPresets(lang: 'en' | 'de' = 'en'): SoundPreset[] {
  if (lang === 'de') {
    return [
      { id: 'eclipse_calm', name: 'Eclipse Calm (Standard)', desc: 'Ultra-entspannter, warmer Akustik-Akkord (Sehr weich)' },
      { id: 'cosmic_shimmer', name: 'Cosmic Shimmer', desc: 'Kristalliner Sternen-Chime mit sanftem Nachklang' },
      { id: 'minimal_pop', name: 'Minimal Pop', desc: 'Dezenter, knackiger Glas-Bubble-Ton' },
      { id: 'soft_velvet', name: 'Soft Velvet', desc: 'Tiefer, warmer Marimba-Doppelton' },
      { id: 'arcade_chime', name: 'Retro Chime', desc: 'Klassischer, harmonischer 8-Bit Chime' },
      { id: 'cyber_pulse', name: 'Cyber Pulse', desc: 'Futuristischer Sci-Fi-Blip' },
      { id: 'silent', name: 'Stumm (Silent)', desc: 'Kein Sound bei Benachrichtigungen' },
    ]
  }

  return [
    { id: 'eclipse_calm', name: 'Eclipse Calm (Default)', desc: 'Ultra-relaxed, warm acoustic chord (Very soft)' },
    { id: 'cosmic_shimmer', name: 'Cosmic Shimmer', desc: 'Crystalline celestial chime with gentle shimmer' },
    { id: 'minimal_pop', name: 'Minimal Pop', desc: 'Subtle, crisp glass bubble tone' },
    { id: 'soft_velvet', name: 'Soft Velvet', desc: 'Deep, warm acoustic marimba double note' },
    { id: 'arcade_chime', name: 'Retro Chime', desc: 'Classic, harmonic 8-bit chime' },
    { id: 'cyber_pulse', name: 'Cyber Pulse', desc: 'Futuristic sci-fi blip' },
    { id: 'silent', name: 'Silent', desc: 'No sound on notifications' },
  ]
}

export const SOUND_PRESETS = getSoundPresets('en')

/**
 * Play a specific sound preset by ID
 */
export function playNotificationSound(presetId: string = 'eclipse_calm') {
  if (presetId === 'silent') return

  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime

  switch (presetId) {
    case 'cosmic_shimmer': {
      const master = ctx.createGain()
      master.gain.setValueAtTime(0.12, now)
      master.connect(ctx.destination)

      const freqs = [523.25, 783.99, 1046.5] // C5, G5, C6
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(f, now + i * 0.03)
        g.gain.setValueAtTime(0.0001, now + i * 0.03)
        g.gain.exponentialRampToValueAtTime(0.1 / (i + 1), now + i * 0.03 + 0.025)
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.03 + 0.6)
        osc.connect(g)
        g.connect(master)
        osc.start(now + i * 0.03)
        osc.stop(now + i * 0.03 + 0.6)
      })
      break
    }

    case 'minimal_pop': {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.02)
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.06)

      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)

      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.1)
      break
    }

    case 'soft_velvet': {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(700, now)
      filter.connect(ctx.destination)

      const notes = [261.63, 392.0] // C4, G4
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(f, now + i * 0.06)

        g.gain.setValueAtTime(0.0001, now + i * 0.06)
        g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.06 + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.45)

        osc.connect(g)
        g.connect(filter)
        osc.start(now + i * 0.06)
        osc.stop(now + i * 0.06 + 0.45)
      })
      break
    }

    case 'arcade_chime': {
      const notes = [523.25, 659.25, 783.99] // C5, E5, G5
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(f, now + i * 0.04)

        g.gain.setValueAtTime(0.0001, now + i * 0.04)
        g.gain.exponentialRampToValueAtTime(0.04, now + i * 0.04 + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.18)

        osc.connect(g)
        g.connect(ctx.destination)
        osc.start(now + i * 0.04)
        osc.stop(now + i * 0.04 + 0.18)
      })
      break
    }

    case 'cyber_pulse': {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(350, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1600, now)

      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

      osc.connect(filter)
      filter.connect(g)
      g.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.25)
      break
    }

    case 'eclipse_calm':
    default: {
      // Standard & Best: Ultra-relaxed warm Major triad (A4 -> C#5 -> E5)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(1100, now)
      filter.Q.setValueAtTime(0.5, now)
      filter.connect(ctx.destination)

      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.12, now)
      masterGain.connect(filter)

      // Note 1: A4 (440 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(440, now)
      gain1.gain.setValueAtTime(0.0001, now)
      gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.035)
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
      osc1.connect(gain1)
      gain1.connect(masterGain)
      osc1.start(now)
      osc1.stop(now + 0.45)

      // Note 2: C#5 (554.37 Hz)
      const note2Start = now + 0.04
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(554.37, note2Start)
      gain2.gain.setValueAtTime(0.0001, note2Start)
      gain2.gain.exponentialRampToValueAtTime(0.1, note2Start + 0.035)
      gain2.gain.exponentialRampToValueAtTime(0.0001, note2Start + 0.5)
      osc2.connect(gain2)
      gain2.connect(masterGain)
      osc2.start(note2Start)
      osc2.stop(note2Start + 0.5)

      // Note 3: E5 (659.25 Hz)
      const note3Start = now + 0.08
      const osc3 = ctx.createOscillator()
      const gain3 = ctx.createGain()
      osc3.type = 'sine'
      osc3.frequency.setValueAtTime(659.25, note3Start)
      gain3.gain.setValueAtTime(0.0001, note3Start)
      gain3.gain.exponentialRampToValueAtTime(0.08, note3Start + 0.035)
      gain3.gain.exponentialRampToValueAtTime(0.0001, note3Start + 0.55)
      osc3.connect(gain3)
      gain3.connect(masterGain)
      osc3.start(note3Start)
      osc3.stop(note3Start + 0.55)
      break
    }
  }
}

/**
 * Default notification chime wrapper (uses current preset)
 */
export function playNotificationChime(presetId?: string) {
  playNotificationSound(presetId || 'eclipse_calm')
}

/**
 * Play a subtle tactile click sound
 */
export function playTactileClick() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(280, now)
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.03)
    gain.gain.setValueAtTime(0.02, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.03)
  } catch (e) {}
}

/**
 * Play a warm game launch cue
 */
export function playLaunchCue() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(220.0, now)
    osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.2)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
  } catch (e) {}
}
