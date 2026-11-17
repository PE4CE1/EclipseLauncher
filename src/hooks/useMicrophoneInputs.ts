import { useEffect, useState } from 'react'
import { listMicrophones, type MicrophoneDevices } from '../services/microphoneDevices'

export function useMicrophoneInputs(enabled: boolean, refreshKey: number) {
  const [state, setState] = useState<MicrophoneDevices & { loading: boolean }>({ inputs: [], defaultLabel: '', loading: false })
  useEffect(() => {
    if (!enabled) return
    const media = navigator.mediaDevices
    let active = true, request: AbortController | undefined
    const refresh = async (access = false) => {
      request?.abort()
      const current = request = new AbortController()
      setState(previous => ({ ...previous, loading: true, error: undefined }))
      try {
        const native = await window.electronAPI?.nativeMicrophone?.list()
        const result = native?.supported
          ? { inputs: native.inputs, defaultLabel: native.inputs.find(input => input.default)?.label || '' }
          : await listMicrophones(media, access, current.signal)
        if (active && !current.signal.aborted) setState({ ...result, loading: false })
      } catch (error) {
        if (active && !current.signal.aborted) setState(previous => ({ ...previous, error, loading: false }))
      }
    }
    const changed = () => { void refresh() }
    const visible = () => { if (!document.hidden) changed() }
    void refresh(true)
    media?.addEventListener('devicechange', changed)
    window.addEventListener('focus', changed)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false; request?.abort()
      media?.removeEventListener('devicechange', changed)
      window.removeEventListener('focus', changed)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [enabled, refreshKey])
  return { ...state, loading: enabled && state.loading }
}
