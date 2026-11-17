import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Mic, Square } from 'lucide-react'
import { SettingsRange } from './ClipSettingsControls'
import { createMicrophoneGate, type MicrophoneGate, type MicrophoneLevel } from '../../services/micNoiseGate'
import { microphoneError } from '../../services/microphoneDevices'
import { requestMicrophoneStream } from '../../services/microphoneStream'

export function ClipMicMeter({ deviceId, threshold, onChange, de }: { deviceId?: string; threshold: number; onChange: (value: number) => void; de: boolean }) {
  const [testing, setTesting] = useState(false)
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState<MicrophoneLevel>({ db: -60, open: false })
  const [draft, setDraft] = useState(threshold)
  const [error, setError] = useState<unknown>()
  const gate = useRef<MicrophoneGate>()
  const currentThreshold = useRef(threshold)
  useEffect(() => { setDraft(threshold); currentThreshold.current = threshold; gate.current?.setThreshold(threshold) }, [threshold])
  useEffect(() => {
    if (!testing) return
    let active = true, stream: MediaStream | undefined, context: AudioContext | undefined, controller: MicrophoneGate | undefined
    const release = () => {
      controller?.dispose()
      if (gate.current === controller) gate.current = undefined
      stream?.getTracks().forEach(track => track.stop())
      stream = undefined
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
    setReady(false); setLevel({ db: -60, open: false })
    void (async () => {
      try {
        stream = await requestMicrophoneStream(deviceId)
        if (!active) { release(); return }
        const track = stream.getAudioTracks()[0]
        if (!track) throw new DOMException('No microphone track', 'NotFoundError')
        track.addEventListener('ended', () => {
          if (active) { setError(new DOMException('Disconnected', 'NotFoundError')); setTesting(false) }
        }, { once: true })
        context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
        controller = await createMicrophoneGate(context, currentThreshold.current, value => { if (active) setLevel(value) })
        if (!active) { release(); return }
        gate.current = controller
        controller.setThreshold(currentThreshold.current)
        const source = context.createMediaStreamSource(stream)
        // A muted destination keeps the graph running without playing the mic through speakers.
        const silent = context.createGain(); silent.gain.value = 0
        source.connect(controller.node).connect(silent).connect(context.destination)
        await context.resume()
        if (active) setReady(true)
      } catch (reason) {
        release()
        if (active) { setError(reason); setTesting(false) }
      }
    })()
    const hide = () => { if (document.hidden) setTesting(false) }
    document.addEventListener('visibilitychange', hide)
    return () => { active = false; document.removeEventListener('visibilitychange', hide); release() }
  }, [testing, deviceId])

  const preview = (value: number) => { setDraft(value); currentThreshold.current = value; gate.current?.setThreshold(value) }
  const active = testing && ready
  const status = !testing ? (de ? 'Test inaktiv' : 'Test inactive') : !ready ? (de ? 'Mikrofon wird geöffnet…' : 'Opening microphone…')
    : level.open ? (de ? 'Signal wird durchgelassen' : 'Input passing through') : (de ? 'Signal wird ausgeblendet' : 'Input muted by gate')
  const percent = (db: number) => (db + 60) / 60 * 100
  return <div className="clip-mic-gate" data-gate-open={active && level.open} data-testing={active}>
    <SettingsRange id="clip-setting-noise-gate" title={de ? 'Noise Gate' : 'Noise gate'} description={de ? 'Signale unter der Schwelle werden ausgeblendet. −60 dB lässt alles durch.' : 'Signals below the threshold are muted. −60 dB lets everything through.'} min={-60} max={-10} value={threshold} unit=" dB" onPreview={preview} onChange={onChange} />
    <div className="clip-mic-gate-heading">
      <span><i aria-hidden="true" />{status}</span>
      <output>{active ? (level.db <= -60 ? '−∞' : Math.round(level.db)) : '—'} dBFS</output>
    </div>
    <div className="clip-mic-gate-track" style={{ '--threshold': percent(draft) + '%' } as CSSProperties}>
      <div className="clip-mic-gate-meter" role="meter" aria-label={de ? 'Mikrofon-Eingangspegel vor dem Noise Gate' : 'Microphone input level before noise gate'} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={active ? Math.round(level.db) : -60} aria-valuetext={active ? `${Math.round(level.db)} dBFS · ${status}` : status}>
        <span className="clip-mic-gate-fill" style={{ transform: `scaleX(${active ? percent(level.db) / 100 : 0})` }} />
      </div>
      <span className="clip-mic-gate-threshold" aria-hidden="true"><span style={draft <= -58 ? { transform: 'none' } : undefined}>{draft} dB</span></span>
    </div>
    <div className="clip-mic-gate-scale" aria-hidden="true">{[-60, -50, -40, -30, -20, -10, 0].map(db => <span key={db} style={{ left: percent(db) + '%' }}>{db}</span>)}</div>
    <div className="clip-settings-mic-test">
      <button type="button" aria-pressed={testing} onClick={() => { setError(undefined); setTesting(value => !value) }}>{testing ? <Square size={12} /> : <Mic size={13} />}{testing ? (de ? 'Test beenden' : 'Stop test') : (de ? 'Mikrofon testen' : 'Test microphone')}</button>
      <p>{de ? 'Sprich normal und setze die Schwelle knapp über deinen Ruhepegel. Grün wird durchgelassen; leise Pausen schließen sanft.' : 'Speak normally and set the threshold just above your background level. Green passes through; quiet pauses close gently.'}</p>
    </div>
    {error !== undefined && <p className="clip-mic-gate-error" role="alert">{microphoneError(error, de)}</p>}
  </div>
}
