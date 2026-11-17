import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipExportRequest } from '../../services/clipEdits'

export function useDiscordClipCopy(de: boolean) {
  const [status, setStatus] = useState<{ key: string; phase: 'working' | 'copied' | 'error'; message: string } | null>(null)
  const working = useRef(false)
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current) } }, [])
  const copy = useCallback(async (key: string, prepare: () => ClipExportRequest | Promise<ClipExportRequest>) => {
    if (working.current) return
    working.current = true
    clearTimeout(timer.current)
    setStatus({ key, phase: 'working', message: de ? 'Discord-Datei wird vorbereitet …' : 'Preparing Discord file…' })
    try {
      const request = await prepare()
      const result = await window.electronAPI?.clips?.copyEdited(request)
      if (!result?.success) throw new Error(result?.error || (de ? 'Kopieren fehlgeschlagen.' : 'Copy failed.'))
      if (!mounted.current) return
      const size = typeof result.bytes === 'number' ? ` · ${(result.bytes / 1e6).toFixed(1)} MB` : ''
      setStatus({ key, phase: 'copied', message: de ? `Datei kopiert${size}. In Discord mit Strg+V einfügen.` : `File copied${size}. Paste into Discord with Ctrl+V.` })
      timer.current = setTimeout(() => setStatus(null), 5000)
    } catch (error) {
      if (mounted.current) setStatus({ key, phase: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { working.current = false }
  }, [de])
  return { copy, status, busy: status?.phase === 'working' }
}

export type DiscordClipCopy = ReturnType<typeof useDiscordClipCopy>
