import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Puzzle, Download, RefreshCw, FolderOpen, 
  Trash2, Terminal, Sparkles, Music, ExternalLink, Play, Zap
} from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import type { SpicetifyStatus, VencordStatus, MillenniumStatus, OpenAsarStatus } from '../../types/game'

// Sleek minimalist Steam icon
function SteamIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.524-4.524 4.524h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 14.819C1.905 20.071 6.703 24 12.001 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0z" />
    </svg>
  )
}

// Sleek minimalist Discord icon
function DiscordIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function PluginsSettingsTab() {
  const { language } = useTranslation()
  const isDe = language === 'de'

  // ─── Millennium State ──────────────────────────────────────────────────────
  const [millenniumStatus, setMillenniumStatus] = useState<MillenniumStatus>({
    isSteamInstalled: true,
    isMillenniumInstalled: false,
    latestVersion: 'v3.4.1',
    isInstalling: false,
  })
  const [millenniumLogs, setMillenniumLogs] = useState<string[]>([])
  const [showMillenniumLogs, setShowMillenniumLogs] = useState(false)
  const millenniumLogRef = useRef<HTMLDivElement>(null)

  // ─── Vencord State ─────────────────────────────────────────────────────────
  const [vencordStatus, setVencordStatus] = useState<VencordStatus>({
    isDiscordInstalled: true,
    isVencordInstalled: false,
    latestVersion: 'v1.15.4',
    isInstalling: false,
  })
  const [vencordLogs, setVencordLogs] = useState<string[]>([])
  const [showVencordLogs, setShowVencordLogs] = useState(false)
  const vencordLogRef = useRef<HTMLDivElement>(null)

  // ─── OpenAsar State ────────────────────────────────────────────────────────
  const [openAsarStatus, setOpenAsarStatus] = useState<OpenAsarStatus>({
    isDiscordInstalled: true,
    isOpenAsarInstalled: false,
    latestVersion: 'Nightly',
    isInstalling: false,
  })
  const [openAsarLogs, setOpenAsarLogs] = useState<string[]>([])
  const [showOpenAsarLogs, setShowOpenAsarLogs] = useState(false)
  const openAsarLogRef = useRef<HTMLDivElement>(null)

  // ─── Spicetify State ───────────────────────────────────────────────────────
  const [spicetifyStatus, setSpicetifyStatus] = useState<SpicetifyStatus>({
    isSpotifyInstalled: true,
    isSpicetifyInstalled: false,
    isInstalling: false,
  })
  const [spicetifyLogs, setSpicetifyLogs] = useState<string[]>([])
  const [showSpicetifyLogs, setShowSpicetifyLogs] = useState(false)
  const spicetifyLogRef = useRef<HTMLDivElement>(null)

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const cleanLog = (text: string) => {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '')
  }

  const refreshMillennium = async () => {
    if (!window.electronAPI?.millennium?.getStatus) return
    try {
      const res = await window.electronAPI.millennium.getStatus()
      if (res) setMillenniumStatus(res)
    } catch (_) {}
  }

  const refreshVencord = async () => {
    if (!window.electronAPI?.vencord?.getStatus) return
    try {
      const res = await window.electronAPI.vencord.getStatus()
      if (res) setVencordStatus(res)
    } catch (_) {}
  }

  const refreshOpenAsar = async () => {
    if (!window.electronAPI?.openasar?.getStatus) return
    try {
      const res = await window.electronAPI.openasar.getStatus()
      if (res) setOpenAsarStatus(res)
    } catch (_) {}
  }

  const refreshSpicetify = async () => {
    if (!window.electronAPI?.spicetify?.getStatus) return
    try {
      const res = await window.electronAPI.spicetify.getStatus()
      if (res) setSpicetifyStatus(res)
    } catch (_) {}
  }

  useEffect(() => {
    refreshMillennium()
    refreshVencord()
    refreshOpenAsar()
    refreshSpicetify()

    const unsubs: (() => void)[] = []

    // Millennium subscriptions
    if (window.electronAPI?.millennium?.onLog) {
      unsubs.push(window.electronAPI.millennium.onLog((rawLine: string) => {
        const cleaned = cleanLog(rawLine).trim()
        if (cleaned) {
          setMillenniumLogs(prev => [...prev.slice(-80), cleaned])
          setTimeout(() => {
            if (millenniumLogRef.current) {
              millenniumLogRef.current.scrollTop = millenniumLogRef.current.scrollHeight
            }
          }, 40)
        }
      }))
    }

    if (window.electronAPI?.millennium?.onStatus) {
      unsubs.push(window.electronAPI.millennium.onStatus((st: string) => {
        if (st === 'done') {
          refreshMillennium()
          setActionMessage({
            type: 'success',
            text: isDe ? 'Millennium erfolgreich eingerichtet' : 'Millennium successfully configured'
          })
        } else if (st === 'error') {
          setActionMessage({
            type: 'error',
            text: isDe ? 'Fehler bei Millennium aufgetreten' : 'Error in Millennium occurred'
          })
        }
      }))
    }

    // Vencord subscriptions
    if (window.electronAPI?.vencord?.onLog) {
      unsubs.push(window.electronAPI.vencord.onLog((rawLine: string) => {
        const cleaned = cleanLog(rawLine).trim()
        if (cleaned) {
          setVencordLogs(prev => [...prev.slice(-80), cleaned])
          setTimeout(() => {
            if (vencordLogRef.current) {
              vencordLogRef.current.scrollTop = vencordLogRef.current.scrollHeight
            }
          }, 40)
        }
      }))
    }

    if (window.electronAPI?.vencord?.onStatus) {
      unsubs.push(window.electronAPI.vencord.onStatus((st: string) => {
        if (st === 'done') {
          refreshVencord()
          setActionMessage({
            type: 'success',
            text: isDe ? 'Vencord erfolgreich eingerichtet' : 'Vencord successfully configured'
          })
        } else if (st === 'error') {
          setActionMessage({
            type: 'error',
            text: isDe ? 'Fehler bei Vencord aufgetreten' : 'Error in Vencord occurred'
          })
        }
      }))
    }

    // OpenAsar subscriptions
    if (window.electronAPI?.openasar?.onLog) {
      unsubs.push(window.electronAPI.openasar.onLog((rawLine: string) => {
        const cleaned = cleanLog(rawLine).trim()
        if (cleaned) {
          setOpenAsarLogs(prev => [...prev.slice(-80), cleaned])
          setTimeout(() => {
            if (openAsarLogRef.current) {
              openAsarLogRef.current.scrollTop = openAsarLogRef.current.scrollHeight
            }
          }, 40)
        }
      }))
    }

    if (window.electronAPI?.openasar?.onStatus) {
      unsubs.push(window.electronAPI.openasar.onStatus((st: string) => {
        if (st === 'done') {
          refreshOpenAsar()
          setActionMessage({
            type: 'success',
            text: isDe ? 'OpenAsar erfolgreich eingerichtet' : 'OpenAsar successfully configured'
          })
        } else if (st === 'error') {
          setActionMessage({
            type: 'error',
            text: isDe ? 'Fehler bei OpenAsar aufgetreten' : 'Error in OpenAsar occurred'
          })
        }
      }))
    }

    // Spicetify subscriptions
    if (window.electronAPI?.spicetify?.onLog) {
      unsubs.push(window.electronAPI.spicetify.onLog((rawLine: string) => {
        const cleaned = cleanLog(rawLine).trim()
        if (cleaned) {
          setSpicetifyLogs(prev => [...prev.slice(-80), cleaned])
          setTimeout(() => {
            if (spicetifyLogRef.current) {
              spicetifyLogRef.current.scrollTop = spicetifyLogRef.current.scrollHeight
            }
          }, 40)
        }
      }))
    }

    if (window.electronAPI?.spicetify?.onStatus) {
      unsubs.push(window.electronAPI.spicetify.onStatus((st: string) => {
        if (st === 'done') {
          refreshSpicetify()
          setActionMessage({
            type: 'success',
            text: isDe ? 'Spicetify erfolgreich ausgeführt' : 'Spicetify successfully applied'
          })
        } else if (st === 'error') {
          setActionMessage({
            type: 'error',
            text: isDe ? 'Fehler bei Spicetify aufgetreten' : 'Error in Spicetify occurred'
          })
        }
      }))
    }

    return () => unsubs.forEach(u => u())
  }, [])

  // ─── Millennium Handlers ───────────────────────────────────────────────────
  const handleMillenniumInstall = async () => {
    setActionMessage(null)
    setMillenniumLogs([])
    setMillenniumStatus(prev => ({ ...prev, isInstalling: true }))

    try {
      const res = await window.electronAPI?.millennium?.install?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Millennium erfolgreich installiert' : 'Millennium installed successfully'
        })
      } else if (res?.error) {
        setActionMessage({ type: 'error', text: res.error })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || (isDe ? 'Fehler' : 'Error') })
    } finally {
      setMillenniumStatus(prev => ({ ...prev, isInstalling: false }))
      refreshMillennium()
    }
  }

  const handleMillenniumRepair = async () => {
    setActionMessage(null)
    setMillenniumLogs([])
    try {
      const res = await window.electronAPI?.millennium?.repair?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Millennium aktualisiert / repariert' : 'Millennium updated / repaired'
        })
        refreshMillennium()
      } else {
        setActionMessage({ type: 'error', text: res?.error || (isDe ? 'Fehler' : 'Error') })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || (isDe ? 'Fehler' : 'Error') })
    }
  }

  const handleMillenniumUninstall = async () => {
    setActionMessage(null)
    setMillenniumLogs([])
    try {
      const res = await window.electronAPI?.millennium?.uninstall?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Millennium deinstalliert (Steam zurückgesetzt)' : 'Millennium uninstalled (Steam restored)'
        })
        refreshMillennium()
      } else {
        setActionMessage({ type: 'error', text: res?.error || (isDe ? 'Fehler' : 'Error') })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || (isDe ? 'Fehler' : 'Error') })
    }
  }

  const handleMillenniumLaunchInstaller = async () => {
    setActionMessage(null)
    try {
      const res = await window.electronAPI?.millennium?.launchInstaller?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Offizieller Installer gestartet' : 'Official installer launched'
        })
      } else if (res?.error) {
        setActionMessage({ type: 'error', text: res.error })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || (isDe ? 'Fehler' : 'Error') })
    }
  }

  // ─── Vencord Handlers ──────────────────────────────────────────────────────
  const handleVencordInstall = async () => {
    setActionMessage(null)
    setVencordLogs([])
    setVencordStatus(prev => ({ ...prev, isInstalling: true }))

    try {
      const res = await window.electronAPI?.vencord?.install?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Vencord erfolgreich installiert' : 'Vencord installed successfully'
        })
      } else if (res?.error) {
        setActionMessage({ type: 'error', text: res.error })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Fehler' })
    } finally {
      setVencordStatus(prev => ({ ...prev, isInstalling: false }))
      refreshVencord()
    }
  }

  const handleVencordRepair = async () => {
    setActionMessage(null)
    setVencordLogs([])
    try {
      const res = await window.electronAPI?.vencord?.repair?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Vencord erfolgreich aktualisiert' : 'Vencord successfully updated'
        })
        refreshVencord()
      } else {
        setActionMessage({ type: 'error', text: res?.error || 'Fehler' })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Fehler' })
    }
  }

  const handleVencordUninstall = async () => {
    setActionMessage(null)
    setVencordLogs([])
    try {
      const res = await window.electronAPI?.vencord?.uninstall?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Vencord deinstalliert' : 'Vencord uninstalled'
        })
        refreshVencord()
      } else {
        setActionMessage({ type: 'error', text: res?.error || 'Fehler' })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Fehler' })
    }
  }

  // ─── OpenAsar Handlers ─────────────────────────────────────────────────────
  const handleOpenAsarInstall = async () => {
    setActionMessage(null)
    setOpenAsarLogs([])
    setOpenAsarStatus(prev => ({ ...prev, isInstalling: true }))

    try {
      const res = await window.electronAPI?.openasar?.install?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'OpenAsar erfolgreich installiert' : 'OpenAsar installed successfully'
        })
      } else if (res?.error) {
        setActionMessage({ type: 'error', text: res.error })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || (isDe ? 'Fehler' : 'Error') })
    } finally {
      setOpenAsarStatus(prev => ({ ...prev, isInstalling: false }))
      refreshOpenAsar()
    }
  }

  const handleOpenAsarUninstall = async () => {
    setActionMessage(null)
    setOpenAsarLogs([])
    setOpenAsarStatus(prev => ({ ...prev, isInstalling: true }))
    try {
      const res = await window.electronAPI?.openasar?.uninstall?.(language)
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'OpenAsar deinstalliert (Original wiederhergestellt)' : 'OpenAsar uninstalled (Original restored)'
        })
      } else {
        setActionMessage({ type: 'error', text: res?.error || (isDe ? 'Fehler' : 'Error') })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || (isDe ? 'Fehler' : 'Error') })
    } finally {
      setOpenAsarStatus(prev => ({ ...prev, isInstalling: false }))
      refreshOpenAsar()
    }
  }

  // ─── Spicetify Handlers ────────────────────────────────────────────────────
  const handleSpicetifyInstall = async () => {
    setActionMessage(null)
    setSpicetifyLogs([])
    setSpicetifyStatus(prev => ({ ...prev, isInstalling: true }))

    try {
      const res = await window.electronAPI?.spicetify?.install?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Spicetify erfolgreich installiert' : 'Spicetify installed successfully'
        })
      } else if (res?.error) {
        setActionMessage({ type: 'error', text: res.error })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Fehler' })
    } finally {
      setSpicetifyStatus(prev => ({ ...prev, isInstalling: false }))
      refreshSpicetify()
    }
  }

  const handleSpicetifyApply = async () => {
    setActionMessage(null)
    try {
      const res = await window.electronAPI?.spicetify?.apply?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Spotify erfolgreich gepatcht' : 'Spotify patched successfully'
        })
      } else {
        setActionMessage({ type: 'error', text: res?.error || 'Fehler' })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Fehler' })
    }
  }

  const handleSpicetifyRestore = async () => {
    setActionMessage(null)
    try {
      const res = await window.electronAPI?.spicetify?.restore?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Spotify zurückgesetzt' : 'Spotify restored'
        })
        refreshSpicetify()
      } else {
        setActionMessage({ type: 'error', text: res?.error || 'Fehler' })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Fehler' })
    }
  }

  const handleSpicetifyUpgrade = async () => {
    setActionMessage(null)
    try {
      const res = await window.electronAPI?.spicetify?.upgrade?.()
      if (res?.success) {
        setActionMessage({
          type: 'success',
          text: isDe ? 'Spicetify aktualisiert' : 'Spicetify updated'
        })
        refreshSpicetify()
      } else {
        setActionMessage({ type: 'error', text: res?.error || 'Fehler' })
      }
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e?.message || 'Fehler' })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-5"
    >
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Puzzle size={18} className="text-white" />
            <span>Plugins</span>
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {isDe ? 'Modding-Engines & Erweiterungen für deine Gaming-Clients' : 'Modding engines & extensions for your gaming clients'}
          </p>
        </div>

        {actionMessage && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`text-xs px-3 py-1 rounded-lg border font-medium ${
              actionMessage.type === 'success'
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-red-500/10 text-red-300 border-red-500/20'
            }`}
          >
            {actionMessage.text}
          </motion.div>
        )}
      </div>

      {/* ─── Millennium Minimalist Card ─────────────────────────────────── */}
      <div className="bg-[#0b0c10] border border-white/[0.08] rounded-2xl p-5 relative overflow-hidden">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              <SteamIcon size={20} className="text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Millennium</span>
                {millenniumStatus.isMillenniumInstalled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/15">
                    {millenniumStatus.version || millenniumStatus.latestVersion || 'v3.4.1'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-white/60 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                    {millenniumStatus.latestVersion ? `${millenniumStatus.latestVersion} ${isDe ? 'verfügbar' : 'available'}` : (isDe ? 'Nicht installiert' : 'Not installed')}
                  </span>
                )}
                {millenniumStatus.isMillenniumInstalled && millenniumStatus.latestVersion && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 border border-white/[0.06]" title={isDe ? 'Aktuellste Version von GitHub' : 'Latest version on GitHub'}>
                    {isDe ? 'Neueste' : 'Latest'}: {millenniumStatus.latestVersion}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {isDe 
                  ? 'Themes (z. B. OLED Black, Fluent), Skins & Plugins für Steam' 
                  : 'Themes (e.g. OLED Black, Fluent), skins & plugins for Steam'}
              </p>
            </div>
          </div>

          {/* Minimalist Badge */}
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 border border-white/15">
              <Sparkles size={12} className="text-white" />
              <span>{isDe ? 'Empfohlen für Steam' : 'Recommended for Steam'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {!millenniumStatus.isMillenniumInstalled ? (
              <>
                <button
                  type="button"
                  onClick={handleMillenniumInstall}
                  disabled={millenniumStatus.isInstalling}
                  className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {millenniumStatus.isInstalling ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-black" />
                      <span>{isDe ? 'Wird installiert...' : 'Installing...'}</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>{isDe ? 'Millennium installieren' : 'Install Millennium'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.millennium?.openStore?.()}
                  className="px-3 py-2 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>{isDe ? 'Themes Store' : 'Themes Store'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMillenniumLaunchInstaller}
                  className="px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] text-white/60 hover:text-white text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 border border-white/[0.06] cursor-pointer"
                  title={isDe ? 'Offizielle Millennium-Installer GUI starten' : 'Launch official Millennium Installer GUI'}
                >
                  <Play size={11} />
                  <span>{isDe ? 'Offizieller Installer' : 'Official Installer'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleMillenniumRepair}
                  className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>{isDe ? 'Aktualisieren / Reparieren' : 'Update / Repair'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.millennium?.openStore?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <ExternalLink size={12} />
                  <span>{isDe ? 'Themes Store' : 'Themes Store'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.millennium?.openThemes?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Themes' : 'Themes'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.millennium?.openFolder?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Ordner' : 'Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMillenniumLaunchInstaller}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] text-white/50 hover:text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/[0.06] cursor-pointer"
                  title={isDe ? 'Offizielle Millennium-Installer GUI starten' : 'Launch official Millennium Installer GUI'}
                >
                  <Play size={11} />
                  <span>{isDe ? 'GUI' : 'GUI'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleMillenniumUninstall}
                  className="px-3 py-1.5 hover:bg-red-500/10 text-white/40 hover:text-red-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>{isDe ? 'Deinstallieren' : 'Uninstall'}</span>
                </button>
              </>
            )}
          </div>

          {/* Minimal Terminal Toggle */}
          <button
            type="button"
            onClick={() => setShowMillenniumLogs(!showMillenniumLogs)}
            className="text-[11px] text-white/30 hover:text-white/70 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Terminal size={12} />
            <span>{showMillenniumLogs ? (isDe ? 'Konsole verbergen' : 'Hide console') : (isDe ? 'Protokoll' : 'Log')}</span>
          </button>
        </div>

        {/* Clean Log Output */}
        <AnimatePresence>
          {showMillenniumLogs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
            >
              <div 
                ref={millenniumLogRef}
                className="bg-black/80 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-white/70 h-32 overflow-y-auto space-y-0.5 select-text"
              >
                {millenniumLogs.length === 0 ? (
                  <div className="text-white/30 italic">
                    {isDe ? 'Bereit.' : 'Ready.'}
                  </div>
                ) : (
                  millenniumLogs.map((line, idx) => (
                    <div key={idx} className="leading-snug whitespace-pre-wrap">{line}</div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Vencord Minimalist Card ────────────────────────────────────── */}
      <div className="bg-[#0b0c10] border border-white/[0.08] rounded-2xl p-5 relative overflow-hidden">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              <DiscordIcon size={20} className="text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Vencord</span>
                {vencordStatus.isVencordInstalled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/15">
                    {vencordStatus.version || vencordStatus.latestVersion || 'v1.15.4'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-white/60 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                    {vencordStatus.latestVersion ? `${vencordStatus.latestVersion} ${isDe ? 'verfügbar' : 'available'}` : (isDe ? 'Nicht installiert' : 'Not installed')}
                  </span>
                )}
                {vencordStatus.isVencordInstalled && vencordStatus.latestVersion && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-white/40 border border-white/[0.06]" title={isDe ? 'Aktuellste Version von GitHub' : 'Latest version on GitHub'}>
                    {isDe ? 'Neueste' : 'Latest'}: {vencordStatus.latestVersion}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {isDe 
                  ? 'Client-Modifikation, Themes & Plugins für Discord' 
                  : 'Client modification, themes & plugins for Discord'}
              </p>
            </div>
          </div>

          {/* Minimalist Badge */}
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 border border-white/15">
              <Sparkles size={12} className="text-white" />
              <span>{isDe ? 'Empfohlen für Discord' : 'Recommended for Discord'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {!vencordStatus.isVencordInstalled ? (
              <button
                type="button"
                onClick={handleVencordInstall}
                disabled={vencordStatus.isInstalling}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {vencordStatus.isInstalling ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-black" />
                    <span>{isDe ? 'Wird installiert...' : 'Installing...'}</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>{isDe ? 'Vencord installieren' : 'Install Vencord'}</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleVencordRepair}
                  className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>{isDe ? 'Aktualisieren / Reparieren' : 'Update / Repair'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.vencord?.openThemes?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Themes' : 'Themes'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.vencord?.openFolder?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Ordner' : 'Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleVencordUninstall}
                  className="px-3 py-1.5 hover:bg-red-500/10 text-white/40 hover:text-red-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>{isDe ? 'Deinstallieren' : 'Uninstall'}</span>
                </button>
              </>
            )}
          </div>

          {/* Minimal Terminal Toggle */}
          <button
            type="button"
            onClick={() => setShowVencordLogs(!showVencordLogs)}
            className="text-[11px] text-white/30 hover:text-white/70 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Terminal size={12} />
            <span>{showVencordLogs ? (isDe ? 'Konsole verbergen' : 'Hide console') : (isDe ? 'Protokoll' : 'Log')}</span>
          </button>
        </div>

        {/* Clean Log Output */}
        <AnimatePresence>
          {showVencordLogs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
            >
              <div 
                ref={vencordLogRef}
                className="bg-black/80 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-white/70 h-32 overflow-y-auto space-y-0.5 select-text"
              >
                {vencordLogs.length === 0 ? (
                  <div className="text-white/30 italic">
                    {isDe ? 'Bereit.' : 'Ready.'}
                  </div>
                ) : (
                  vencordLogs.map((line, idx) => (
                    <div key={idx} className="leading-snug whitespace-pre-wrap">{line}</div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── OpenAsar Minimalist Card ───────────────────────────────────── */}
      <div className="bg-[#0b0c10] border border-white/[0.08] rounded-2xl p-5 relative overflow-hidden">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              <Zap size={20} className="text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">OpenAsar</span>
                {openAsarStatus.isOpenAsarInstalled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/15">
                    {openAsarStatus.version || 'Nightly'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-white/60 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                    {isDe ? 'Nicht installiert' : 'Not installed'}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {isDe 
                  ? 'Schlanker Open-Source Ersatz für Discord app.asar. Verdoppelt Startzeit, halbiert RAM-Nutzung & blockiert Sentry-Telemetrie.' 
                  : 'Lightweight open-source replacement for Discord app.asar. 2× faster launch, halves RAM usage & blocks sentry telemetry.'}
              </p>
            </div>
          </div>

          {/* Minimalist Badge */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 border border-white/15 whitespace-nowrap">
              <Zap size={12} className="text-white" />
              <span>{isDe ? 'Performance-Booster' : 'Performance Booster'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {!openAsarStatus.isOpenAsarInstalled ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenAsarInstall}
                  disabled={openAsarStatus.isInstalling}
                  className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {openAsarStatus.isInstalling ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-black" />
                      <span>{isDe ? 'Wird installiert...' : 'Installing...'}</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>{isDe ? 'OpenAsar installieren' : 'Install OpenAsar'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.openasar?.openGithub?.()}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] text-white/50 hover:text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/[0.06] cursor-pointer"
                >
                  <ExternalLink size={11} />
                  <span>GitHub</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleOpenAsarInstall}
                  disabled={openAsarStatus.isInstalling}
                  className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={12} className={openAsarStatus.isInstalling ? 'animate-spin' : ''} />
                  <span>{openAsarStatus.isInstalling ? (isDe ? 'Wird aktualisiert...' : 'Updating...') : (isDe ? 'Aktualisieren' : 'Update')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.openasar?.openFolder?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Ordner' : 'Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.openasar?.openGithub?.()}
                  className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.07] text-white/50 hover:text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/[0.06] cursor-pointer"
                >
                  <ExternalLink size={11} />
                  <span>GitHub</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAsarUninstall}
                  disabled={openAsarStatus.isInstalling}
                  className="px-3 py-1.5 hover:bg-red-500/10 text-white/40 hover:text-red-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  <span>{isDe ? 'Deinstallieren' : 'Uninstall'}</span>
                </button>
              </>
            )}
          </div>

          {/* Minimal Terminal Toggle */}
          <button
            type="button"
            onClick={() => setShowOpenAsarLogs(!showOpenAsarLogs)}
            className="text-[11px] text-white/30 hover:text-white/70 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Terminal size={12} />
            <span>{showOpenAsarLogs ? (isDe ? 'Konsole verbergen' : 'Hide console') : (isDe ? 'Protokoll' : 'Log')}</span>
          </button>
        </div>

        {/* Clean Log Output */}
        <AnimatePresence>
          {showOpenAsarLogs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
            >
              <div 
                ref={openAsarLogRef}
                className="bg-black/80 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-white/70 h-32 overflow-y-auto space-y-0.5 select-text"
              >
                {openAsarLogs.length === 0 ? (
                  <div className="text-white/30 italic">
                    {isDe ? 'Bereit.' : 'Ready.'}
                  </div>
                ) : (
                  openAsarLogs.map((line, idx) => (
                    <div key={idx} className="leading-snug whitespace-pre-wrap">{line}</div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Spicetify Minimalist Card ─────────────────────────────────── */}
      <div className="bg-[#0b0c10] border border-white/[0.08] rounded-2xl p-5 relative overflow-hidden">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center flex-shrink-0">
              <Music size={18} className="text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Spicetify</span>
                {spicetifyStatus.isSpicetifyInstalled ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/15">
                    {spicetifyStatus.version || 'v2.44.0'}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-white/40 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                    {isDe ? 'Nicht installiert' : 'Not installed'}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {isDe 
                  ? 'Themes, Marketplace & Erweiterungen für Spotify' 
                  : 'Themes, marketplace & extensions for Spotify'}
              </p>
            </div>
          </div>

          {/* Minimalist Recommendation Badges */}
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 border border-white/15">
              <Sparkles size={12} className="text-white" />
              <span>{isDe ? 'Empfohlen für Free' : 'Recommended for Free'}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-white/[0.02] text-white/40 text-[11px] font-medium border border-white/[0.05]">
              {isDe ? 'Optional für Premium' : 'Optional for Premium'}
            </div>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {!spicetifyStatus.isSpicetifyInstalled ? (
              <button
                type="button"
                onClick={handleSpicetifyInstall}
                disabled={spicetifyStatus.isInstalling}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {spicetifyStatus.isInstalling ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-black" />
                    <span>{isDe ? 'Wird installiert...' : 'Installing...'}</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>{isDe ? 'Spicetify installieren' : 'Install Spicetify'}</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSpicetifyApply}
                  className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={12} />
                  <span>{isDe ? 'Anwenden' : 'Apply'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.electronAPI?.spicetify?.openFolder?.()}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <FolderOpen size={12} />
                  <span>{isDe ? 'Ordner' : 'Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSpicetifyUpgrade}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>{isDe ? 'Update' : 'Update'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSpicetifyRestore}
                  className="px-3 py-1.5 hover:bg-red-500/10 text-white/40 hover:text-red-300 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>{isDe ? 'Zurücksetzen' : 'Restore'}</span>
                </button>
              </>
            )}
          </div>

          {/* Minimal Terminal Toggle */}
          <button
            type="button"
            onClick={() => setShowSpicetifyLogs(!showSpicetifyLogs)}
            className="text-[11px] text-white/30 hover:text-white/70 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Terminal size={12} />
            <span>{showSpicetifyLogs ? (isDe ? 'Konsole verbergen' : 'Hide console') : (isDe ? 'Protokoll' : 'Log')}</span>
          </button>
        </div>

        {/* Clean Log Output without ANSI Garbage */}
        <AnimatePresence>
          {showSpicetifyLogs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 overflow-hidden"
            >
              <div 
                ref={spicetifyLogRef}
                className="bg-black/80 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-white/70 h-32 overflow-y-auto space-y-0.5 select-text"
              >
                {spicetifyLogs.length === 0 ? (
                  <div className="text-white/30 italic">
                    {isDe ? 'Bereit.' : 'Ready.'}
                  </div>
                ) : (
                  spicetifyLogs.map((line, idx) => (
                    <div key={idx} className="leading-snug whitespace-pre-wrap">{line}</div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
