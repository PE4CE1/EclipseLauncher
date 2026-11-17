import { useEffect, useState } from 'react'
import { ClipToastOverlay, type ClipToastData } from './widgets/ClipToastOverlay'

export default function ClipsToastApp() {
  const [toast, setToast] = useState<ClipToastData | null>(null)
  useEffect(() => {
    let disposed = false, revision = 0
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const receive = (data: any) => {
      if (!data || disposed) return
      setToast({ id: data.id || data.timestamp || Date.now(), title: data.title || 'Highlight Clip', gameTitle: data.gameTitle || 'Gameplay', duration: data.duration || 30, thumbnailUrl: data.thumbnailUrl || data.thumbnailDataUrl, status: data.status, language: data.language, color: data.color || '#ff6600' })
    }
    const off = window.electronAPI?.onClipSavedToast?.(data => { revision++; receive(data) })
    // Subscribing first and requesting the snapshot also acknowledges readiness
    // to the native window; a late snapshot must not replay an older toast.
    void window.electronAPI?.getOverlayState?.().then((state: any) => { if (!revision) receive(state?.pendingClipToast) }).catch(() => {})
    return () => { disposed = true; off?.() }
  }, [])
  return toast ? <ClipToastOverlay key={toast.id} toast={toast} onDismiss={() => { setToast(null); void window.electronAPI?.dismissClipToast?.() }}/> : null
}
