import { Loader2, RefreshCw } from 'lucide-react'
import { retryMicrophoneCapture } from '../../services/clipEngineLifecycle'
import { microphoneError } from '../../services/microphoneDevices'
import type { ClipCaptureStatus } from '../../types/game'

export function ClipMicrophoneStatus({ status, de }: { status: ClipCaptureStatus; de: boolean }) {
  if (status.micAvailable !== false) return null
  return <div className="clip-microphone-status" data-microphone-unavailable>
    <span>{status.micRecovering ? (de ? 'Mikrofon wird erneut verbunden…' : 'Reconnecting microphone…') : microphoneError({ name: status.micError }, de)}{status.micErrorDetail && <details><summary>{de ? 'Technische Details' : 'Technical details'}</summary><code>{status.micErrorDetail}</code></details>}</span>
    <button type="button" className="clip-settings-button" disabled={status.micRecovering} onClick={() => void retryMicrophoneCapture()}>
      {status.micRecovering ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {de ? 'Mikrofon erneut verbinden' : 'Reconnect microphone'}
    </button>
  </div>
}
