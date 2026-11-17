import { APP_DISPLAY_VERSION } from '../../services/updateService'
import { useTranslation } from '../../hooks/useTranslation'
import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Activity, Shield, ShieldCheck, Wifi, Database, 
  RotateCcw, X, Send, DownloadCloud, Check, 
  AlertCircle, RefreshCw, Layers, ArrowUpRight,
  Server, Cpu, HardDrive, CheckCircle2, ChevronRight, ChevronDown,
  Pin, Minus, Info, Globe, Clock
} from 'lucide-react'
import { 
  subscribeSteamTraffic, 
  getSteamTrafficStats, 
  resetSteamTrafficStats, 
  resetSteamCircuitBreaker,
  testSteamPing, 
  testFetchRealAppDetails,
  runSteamSecurityAudit,
  type SteamTrafficStats,
  type SteamTrafficLogEntry 
} from '../../services/steamService'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toTimeString().split(' ')[0]
}

interface SteamTrafficOverlayProps {
  isStandalone?: boolean
}

export const SteamTrafficOverlay: React.FC<SteamTrafficOverlayProps> = ({ isStandalone = true }) => {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SteamTrafficStats>(getSteamTrafficStats)
  const [isPinging, setIsPinging] = useState(false)
  const [isFetchingApp, setIsFetchingApp] = useState(false)
  const [isAuditing, setIsAuditing] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'LIVE' | 'CACHE'>('ALL')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [isPinned, setIsPinned] = useState(true)
  const [activeMetricInfo, setActiveMetricInfo] = useState<'origin' | 'payload' | 'cache' | 'throttle' | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeSteamTraffic((newStats) => {
      setStats(newStats)
    })
    // Immediately ensure window is brought to front and topmost on mount
    if (window.electronAPI?.bringSteamMonitorToFront) {
      window.electronAPI.bringSteamMonitorToFront()
    }
    return unsubscribe
  }, [])

  const handleTestProbe = async () => {
    if (isPinging) return
    setIsPinging(true)
    setFeedback(null)
    try {
      const res = await testSteamPing()
      setFeedback({ text: res.message, ok: res.success })
      setTimeout(() => setFeedback(null), 5000)
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Probe request failed', ok: false })
      setTimeout(() => setFeedback(null), 5000)
    } finally {
      setIsPinging(false)
    }
  }

  const handleFetchAppDetails = async () => {
    if (isFetchingApp) return
    setIsFetchingApp(true)
    setFeedback(null)
    try {
      // Fetches live CS2 (730) appdetails to demonstrate real live payload downloading
      const res = await testFetchRealAppDetails(730)
      setFeedback({ text: res.message, ok: res.success })
      setTimeout(() => setFeedback(null), 5000)
    } catch (err: any) {
      setFeedback({ text: err?.message || 'Fetch failed', ok: false })
      setTimeout(() => setFeedback(null), 5000)
    } finally {
      setIsFetchingApp(false)
    }
  }

  const handleRunSecurityAudit = async () => {
    if (isAuditing) return
    setIsAuditing(true)
    setFeedback({ text: 'Running automated 5-point security & rate-limit audit...', ok: true })
    try {
      const res = await runSteamSecurityAudit()
      setFeedback({ text: res.message, ok: res.passed })
      setTimeout(() => setFeedback(null), 8000)
    } catch (err: any) {
      setFeedback({ text: `Audit error: ${err?.message || 'Verification failed'}`, ok: false })
      setTimeout(() => setFeedback(null), 5000)
    } finally {
      setIsAuditing(false)
    }
  }

  const handleTogglePin = async () => {
    const nextPinned = !isPinned
    setIsPinned(nextPinned)
    if (window.electronAPI?.setSteamMonitorAlwaysOnTop) {
      await window.electronAPI.setSteamMonitorAlwaysOnTop(nextPinned)
    }
    setFeedback({
      text: nextPinned ? 'Always on Top: Pinned to foreground' : 'Always on Top: Unpinned',
      ok: true
    })
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleMinimize = async () => {
    if (window.electronAPI?.minimizeSteamMonitorWindow) {
      await window.electronAPI.minimizeSteamMonitorWindow()
    }
  }

  const handleClose = () => {
    if (window.electronAPI?.closeSteamMonitorWindow) {
      window.electronAPI.closeSteamMonitorWindow()
    } else {
      window.close()
    }
  }

  const filteredLogs = stats.logs.filter(log => {
    if (filter === 'LIVE') return log.type === 'LIVE' || log.type === 'ERROR'
    if (filter === 'CACHE') return log.type === 'CACHE' || log.type === 'CDN'
    return true
  })

  const totalCalls = stats.liveRequests + stats.cachedHits + stats.fastlyHits
  const hitRatio = totalCalls > 0 ? Math.round(((stats.cachedHits + stats.fastlyHits) / totalCalls) * 100) : 100
  const estimatedSavings = (stats.cachedHits * 28.5) + (stats.fastlyHits * 8.2)

  return (
    <div className="w-full h-full bg-[#08090d] border border-white/[0.12] rounded-xl flex flex-col overflow-hidden shadow-2xl font-mono select-none text-white antialiased">
      {/* ─── Window Header & Draggable Title Bar ─── */}
      <div 
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#0e1017] border-b border-white/[0.08] cursor-move select-none"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full flex items-center justify-center">
            <span className={`w-2 h-2 rounded-full ${stats.isCircuitBreakerTripped ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white tracking-wider font-sans">
              
              {t('uiNetworkInspector')}
            </span>
            <span className="text-[10px] text-white/40 border border-white/10 px-1 py-0.2 rounded font-mono">
              v{APP_DISPLAY_VERSION}
            </span>
          </div>
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Always-on-top Pin Button */}
          <button
            onClick={handleTogglePin}
            className={`p-1 rounded transition-colors ${
              isPinned 
                ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' 
                : 'text-white/30 hover:bg-white/10 hover:text-white/70'
            }`}
            title={isPinned ? 'Always on Top: Active (Window stays in front of all apps). Click to unpin.' : 'Always on Top: Disabled. Click to pin on top.'}
          >
            <Pin size={13} className={isPinned ? 'fill-emerald-400/30' : ''} />
          </button>

          {/* Minimize Button */}
          <button
            onClick={handleMinimize}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            title={t('uiMinimizeTaskbar')}
          >
            <Minus size={13} />
          </button>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-rose-400 transition-colors"
            title={t('uiCloseInspector')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ─── Engine Telemetry Dashboard Cards (4 Interactive Columns) ─── */}
      <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.08] bg-[#0a0b10] text-center select-none">
        {/* Origin Requests */}
        <button
          type="button"
          onClick={() => setActiveMetricInfo(prev => prev === 'origin' ? null : 'origin')}
          className={`py-2.5 px-1.5 transition-all text-center relative group cursor-pointer border-b-2 ${
            activeMetricInfo === 'origin'
              ? 'bg-amber-500/[0.08] border-amber-400 shadow-inner'
              : 'border-transparent hover:bg-white/[0.03]'
          }`}
          title={t('uiOriginTooltip')}
        >
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-sans font-medium flex items-center justify-center gap-1">
            <span>{t('uiOrigin')}</span>
            <Info size={9} className={`transition-opacity ${activeMetricInfo === 'origin' ? 'opacity-100 text-amber-400' : 'opacity-0 group-hover:opacity-60'}`} />
          </div>
          <div className="text-base font-bold text-amber-400 mt-0.5">{stats.liveRequests}</div>
          <div className="text-[9px] text-white/30 truncate font-mono">{t('uiStoreCalls')}</div>
        </button>

        {/* Downloaded Payload */}
        <button
          type="button"
          onClick={() => setActiveMetricInfo(prev => prev === 'payload' ? null : 'payload')}
          className={`py-2.5 px-1.5 transition-all text-center relative group cursor-pointer border-b-2 ${
            activeMetricInfo === 'payload'
              ? 'bg-cyan-500/[0.08] border-cyan-400 shadow-inner'
              : 'border-transparent hover:bg-white/[0.03]'
          }`}
          title={t('uiPayloadTooltip')}
        >
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-sans font-medium flex items-center justify-center gap-1">
            <span>{t('uiPayload')}</span>
            <Info size={9} className={`transition-opacity ${activeMetricInfo === 'payload' ? 'opacity-100 text-cyan-400' : 'opacity-0 group-hover:opacity-60'}`} />
          </div>
          <div className="text-base font-bold text-cyan-400 mt-0.5">{formatBytes(stats.bytesReceived)}</div>
          <div className="text-[9px] text-white/30 truncate font-mono">{t('uiRawJson')}</div>
        </button>

        {/* Cache Ratio */}
        <button
          type="button"
          onClick={() => setActiveMetricInfo(prev => prev === 'cache' ? null : 'cache')}
          className={`py-2.5 px-1.5 transition-all text-center relative group cursor-pointer border-b-2 ${
            activeMetricInfo === 'cache'
              ? 'bg-emerald-500/[0.08] border-emerald-400 shadow-inner'
              : 'border-transparent hover:bg-white/[0.03]'
          }`}
          title={t('uiCacheTooltip')}
        >
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-sans font-medium flex items-center justify-center gap-1">
            <span>{t('uiCacheRatio')}</span>
            <Info size={9} className={`transition-opacity ${activeMetricInfo === 'cache' ? 'opacity-100 text-emerald-400' : 'opacity-0 group-hover:opacity-60'}`} />
          </div>
          <div className="text-base font-bold text-emerald-400 mt-0.5">{hitRatio}%</div>
          <div className="text-[9px] text-emerald-400/70 truncate font-mono">{stats.cachedHits}  {t('uiCacheHits')}</div>
        </button>

        {/* Queue Throttle */}
        <button
          type="button"
          onClick={() => setActiveMetricInfo(prev => prev === 'throttle' ? null : 'throttle')}
          className={`py-2.5 px-1.5 transition-all text-center relative group cursor-pointer border-b-2 ${
            activeMetricInfo === 'throttle'
              ? 'bg-white/[0.08] border-white/80 shadow-inner'
              : 'border-transparent hover:bg-white/[0.03]'
          }`}
          title={t('uiThrottleTooltip')}
        >
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-sans font-medium flex items-center justify-center gap-1">
            <span>{t('uiThrottle')}</span>
            <Info size={9} className={`transition-opacity ${activeMetricInfo === 'throttle' ? 'opacity-100 text-white/80' : 'opacity-0 group-hover:opacity-60'}`} />
          </div>
          <div className="text-base font-bold text-white/90 mt-0.5">1.2s</div>
          <div className="text-[9px] text-white/30 truncate font-mono">{stats.activeQueueLength}  {t('uiInQueue')}</div>
        </button>
      </div>

      {/* ─── Expandable Metric Deep-Dive Info Drawer ─── */}
      <AnimatePresence>
        {activeMetricInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden bg-[#0a0c13] border-b border-white/[0.1] text-left"
          >
            {activeMetricInfo === 'origin' && (
              <div className="p-3 border-l-4 border-amber-400">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs font-sans">
                    <Globe size={13} />
                    <span>{t('uiOriginRequests')}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/20 text-amber-300">
                      
                      {t('uiPacingActive')}
                    </span>
                  </div>
                  <button 
                    onClick={() => setActiveMetricInfo(null)}
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title={t('uiCloseInfo')}
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed font-sans mb-2">
                  {t('uiOriginDescription')}
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-black/40 p-2 rounded border border-white/[0.06]">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiSteamLimit')}</span>
                    <span className="text-white/90 font-bold">~200 / min</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiEclipsePacing')}</span>
                    <span className="text-emerald-400 font-bold">&le; 50 / min max</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiOriginHealth')}</span>
                    <span className="text-amber-400 font-bold">{t('uiMonitored')}</span>
                  </div>
                </div>
              </div>
            )}

            {activeMetricInfo === 'payload' && (
              <div className="p-3 border-l-4 border-cyan-400">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs font-sans">
                    <DownloadCloud size={13} />
                    <span>{t('uiDataVolume')}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-400/10 border border-cyan-400/20 text-cyan-300">
                      
                      {t('uiJsonTelemetry')}
                    </span>
                  </div>
                  <button 
                    onClick={() => setActiveMetricInfo(null)}
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title={t('uiCloseInfo')}
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed font-sans mb-2">
                  
                  {t('uiPayloadDescription')}
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-black/40 p-2 rounded border border-white/[0.06]">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiAverageGame')}</span>
                    <span className="text-white/90 font-bold">25 KB – 70 KB</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiSessionTotal')}</span>
                    <span className="text-cyan-400 font-bold">{formatBytes(stats.bytesReceived)}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiDataSource')}</span>
                    <span className="text-emerald-400 font-bold">{t('uiValveBackend')}</span>
                  </div>
                </div>
              </div>
            )}

            {activeMetricInfo === 'cache' && (
              <div className="p-3 border-l-4 border-emerald-400">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs font-sans">
                    <Database size={13} />
                    <span>{t('uiCacheHeading')}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-400/10 border border-emerald-400/20 text-emerald-300">
                      
                      {t('uiSavedRequests')}
                    </span>
                  </div>
                  <button 
                    onClick={() => setActiveMetricInfo(null)}
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title={t('uiCloseInfo')}
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed font-sans mb-2">
                  
                  {t('uiCacheDescription')}
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-black/40 p-2 rounded border border-white/[0.06]">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiSavedBandwidth')}</span>
                    <span className="text-emerald-400 font-bold">~{estimatedSavings.toFixed(0)} KB</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiRoundtrips')}</span>
                    <span className="text-white/90 font-bold">{stats.cachedHits}  {t('uiCalls')}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiStorageTtl')}</span>
                    <span className="text-cyan-400 font-bold">{t('uiPersistentSevenDays')}</span>
                  </div>
                </div>
              </div>
            )}

            {activeMetricInfo === 'throttle' && (
              <div className="p-3 border-l-4 border-white/80">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-white/90 font-bold text-xs font-sans">
                    <Clock size={13} />
                    <span>{t('uiQueuePacing')}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 border border-white/20 text-white/80">
                      
                      {t('uiRateLimitHandling')}
                    </span>
                  </div>
                  <button 
                    onClick={() => setActiveMetricInfo(null)}
                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    title={t('uiCloseInfo')}
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-white/80 leading-relaxed font-sans mb-2">
                  
                  {t('uiPacingDescription')}
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-black/40 p-2 rounded border border-white/[0.06]">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiPacingInterval')}</span>
                    <span className="text-white/90 font-bold">{t('uiSeconds12')}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiQueueBacklog')}</span>
                    <span className="text-cyan-400 font-bold">{stats.activeQueueLength}  {t('uiPending')}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase font-sans">{t('uiOverflowGuard')}</span>
                    <span className="text-emerald-400 font-bold">{t('uiAutoDrop')}</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Protection Engine Status Strip ─── */}
      <div className="px-3.5 py-2 bg-[#0c0e14] border-b border-white/[0.06] flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-white/40 uppercase text-[9px] tracking-wider font-sans">{t('uiCircuitBreaker')}</span>
          {stats.isCircuitBreakerTripped ? (
            <div className="flex items-center gap-1.5">
              <span className="text-rose-400 font-bold">
                {t('paused')} ({stats.circuitBreakerRemainingSec}s)
              </span>
              <button
                onClick={() => resetSteamCircuitBreaker()}
                className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 font-bold border border-rose-500/30 active:scale-95 transition-all text-[9px]"
              >
                
                {t('uiDisarm')}
              </button>
            </div>
          ) : (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Check size={11} />
              
              {t('uiStandby')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-white/40 text-[9px]">
          <span className="flex items-center gap-1">
            <ShieldCheck size={10} className="text-emerald-400" />
            WAF: Chrome 128
          </span>
          <span>•</span>
          <span>CDN: Fastly Direct</span>
        </div>
      </div>

      {/* ─── Diagnostics & Probe Actions Toolbar ─── */}
      <div className="px-3.5 py-2 bg-[#08090d] border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Probe Steam */}
          <button
            onClick={handleTestProbe}
            disabled={isPinging}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.14] border border-white/10 rounded text-white/90 text-[10px] font-semibold transition-all disabled:opacity-50"
            title={t('uiProbeTooltip')}
          >
            {isPinging ? (
              <RefreshCw size={11} className="animate-spin text-accent" />
            ) : (
              <Send size={11} className="text-amber-400" />
            )}
            <span>{t('uiProbeStore')}</span>
          </button>

          {/* Test Live AppDetails */}
          <button
            onClick={handleFetchAppDetails}
            disabled={isFetchingApp}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/10 rounded text-white/80 text-[10px] font-semibold transition-all disabled:opacity-50"
            title={t('uiCs2Tooltip')}
          >
            {isFetchingApp ? (
              <RefreshCw size={11} className="animate-spin text-accent" />
            ) : (
              <DownloadCloud size={11} className="text-cyan-400" />
            )}
            <span>{t('uiLiveCs2')}</span>
          </button>

          {/* Automated Security Audit */}
          <button
            onClick={handleRunSecurityAudit}
            disabled={isAuditing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 rounded text-emerald-300 text-[10px] font-semibold transition-all disabled:opacity-50"
            title={t('uiAuditTooltip')}
          >
            {isAuditing ? (
              <RefreshCw size={11} className="animate-spin text-emerald-400" />
            ) : (
              <ShieldCheck size={11} className="text-emerald-400" />
            )}
            <span>{t('uiAuditRequests')}</span>
          </button>

          {/* Reset Counters */}
          <button
            onClick={resetSteamTrafficStats}
            className="px-2 py-1 bg-transparent hover:bg-white/[0.05] border border-white/[0.06] rounded text-white/40 hover:text-white text-[10px] transition-all"
            title={t('uiClearStats')}
          >
            <RotateCcw size={11} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center bg-black/40 p-0.5 rounded border border-white/[0.06] text-[9px]">
          {(['ALL', 'LIVE', 'CACHE'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === tab 
                  ? 'bg-white/15 text-white font-bold' 
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Feedback Toast ─── */}
      {feedback && (
        <div className={`px-3.5 py-1.5 text-[10px] border-b flex items-center gap-1.5 ${
          feedback.ok 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          {feedback.ok ? <Check size={11} /> : <AlertCircle size={11} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* ─── Network Request Table Header ─── */}
      <div className="grid grid-cols-12 px-3.5 py-1 bg-[#050608] border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-white/30 font-sans font-medium">
        <div className="col-span-2">{t('uiTime')}</div>
        <div className="col-span-2">{t('uiType')}</div>
        <div className="col-span-5">{t('uiEndpoint')}</div>
        <div className="col-span-3 text-right">{t('uiSizePing')}</div>
      </div>

      {/* ─── Request Event Stream & Detailed Inspector ─── */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10 bg-[#050608]"
      >
        {filteredLogs.length === 0 ? (
          /* Empty / Standby Health Dashboard */
          <div className="py-6 px-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-white/30">
              <Server size={18} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-white/80 font-sans">{t('uiNoOriginCalls')}</h4>
              <p className="text-[10px] text-white/40 max-w-[280px] mt-1 font-sans leading-relaxed">
                {t('uiInspectorEmptyHint')}
              </p>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={handleTestProbe}
                className="px-3 py-1 bg-white/10 hover:bg-white/15 border border-white/10 rounded text-[10px] font-semibold text-white"
              >
                
                {t('uiTestProbe')}
              </button>
              <button
                onClick={handleFetchAppDetails}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] font-semibold text-white/80"
              >
                
                {t('uiCs2Details')}
              </button>
            </div>
          </div>
        ) : (
          filteredLogs.map(log => {
            const isLive = log.type === 'LIVE'
            const isCache = log.type === 'CACHE'
            const isCdn = log.type === 'CDN'
            const isBlocked = log.type === 'BLOCKED'
            const isExpanded = expandedLogId === log.id

            return (
              <div key={log.id} className="flex flex-col">
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="grid grid-cols-12 items-center px-2 py-1 rounded hover:bg-white/[0.04] text-[10px] leading-tight border border-transparent hover:border-white/[0.05] transition-colors cursor-pointer"
                >
                  {/* Timestamp */}
                  <div className="col-span-2 text-white/30 text-[9px]">
                    {formatTime(log.timestamp)}
                  </div>

                  {/* Status Badge */}
                  <div className="col-span-2">
                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold tracking-wider uppercase ${
                      isLive ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                      isCache ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                      isCdn ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                      isBlocked ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' :
                      'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      {log.type}
                    </span>
                  </div>

                  {/* Endpoint / Detail */}
                  <div className="col-span-5 text-white/90 truncate pr-1 flex items-center gap-1" title={log.detail || log.endpoint}>
                    {isExpanded ? <ChevronDown size={10} className="text-white/40" /> : <ChevronRight size={10} className="text-white/40" />}
                    <span className="truncate">{log.detail || log.endpoint}</span>
                  </div>

                  {/* Size & Latency */}
                  <div className="col-span-3 text-right flex items-center justify-end gap-1.5 text-[9px]">
                    {log.bytes > 0 && (
                      <span className="text-cyan-300 font-medium">{formatBytes(log.bytes)}</span>
                    )}
                    {log.durationMs !== undefined && (
                      <span className="text-white/40">{log.durationMs}ms</span>
                    )}
                    {log.status !== undefined && (
                      <span className={log.status === 200 ? 'text-emerald-400' : 'text-rose-400'}>
                        {log.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Detailed Metadata Inspector */}
                {isExpanded && (
                  <div className="mx-2 my-1 p-2.5 rounded bg-[#0b0d13] border border-white/[0.08] text-[9px] text-white/70 space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-white/40 border-b border-white/[0.06] pb-1">
                      <span>{t('uiRequestInspector')}</span>
                      <span>ID: {log.id}</span>
                    </div>
                    <div>
                      <span className="text-white/40">{t('uiTargetEndpoint')}</span>{' '}
                      <span className="text-white select-all">{log.endpoint}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-white/40">{t('uiHttpStatus')}</span>{' '}
                        <span className={log.status === 200 ? 'text-emerald-400' : 'text-amber-400'}>
                          {log.status || (isCache ? '200 (From Cache)' : 'N/A')}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/40">{t('uiResponseSize')}</span>{' '}
                        <span className="text-cyan-300">{formatBytes(log.bytes)}</span>
                      </div>
                      <div>
                        <span className="text-white/40">{t('uiLatency')}</span>{' '}
                        <span className="text-white">{log.durationMs ?? 0} ms</span>
                      </div>
                      <div>
                        <span className="text-white/40">{t('uiSource')}</span>{' '}
                        <span className="text-white">{isLive ? 'Steam Store Origin' : isCache ? 'LocalStorage V3 (7d)' : 'Fastly Edge CDN'}</span>
                      </div>
                    </div>
                    <div className="text-[8px] text-white/30 pt-1 border-t border-white/[0.04]">
                      Headers: User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ─── Infrastructure Health Footer ─── */}
      <div className="px-3.5 py-2 bg-[#0a0b10] border-t border-white/[0.08] flex items-center justify-between text-[9px] text-white/40 font-sans">
        <div className="flex items-center gap-2">
          <span>{t('uiSavedBandwidth')} <strong className="text-emerald-400 font-mono">~{formatBytes(estimatedSavings * 1024)}</strong></span>
          <span>•</span>
          <span>{t('uiRetention')} <strong className="text-white/70 font-mono">{t('uiSevenDays')}</strong></span>
        </div>
        <div>
          <span>{t('uiMultiMonitor')} <strong>F9</strong>  {t('uiToToggle')}</span>
        </div>
      </div>
    </div>
  )
}
