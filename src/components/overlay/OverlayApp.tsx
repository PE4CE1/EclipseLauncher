import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Crosshair } from './widgets/Crosshair'
import { Performance } from './widgets/Performance'
import { RobloxTimer } from './widgets/RobloxTimer'
import { RobloxCPS } from './widgets/RobloxCPS'
import { RocketLeagueHUD } from './widgets/RocketLeagueHUD'
import { RLSteamAvatarHUD } from './widgets/RLSteamAvatarHUD'
import { ControllerOverlay } from './widgets/ControllerOverlay'
import { MediaOverlayWidget } from './widgets/MediaOverlayWidget'
import { ClipToastOverlay, ClipToastData } from './widgets/ClipToastOverlay'
import { useOverlayMetrics } from './useOverlayMetrics'
import { normalizeOverlayPositions, sameOverlayPositions } from './overlayGeometry'
import { OverlayWidget } from './OverlayWidget'
import './overlay-widgets.css'
import { createPerformanceMetricsSelector } from '../../services/performanceMetrics'
import { resolveGameCrosshair, identifyCrosshairGame } from '../../services/gameCrosshairs'
import { CS2Stats } from './widgets/CS2Stats'

function LivePerformance({ pid, ...props }: Omit<Parameters<typeof Performance>[0], 'metrics'> & { pid?: number }) {
  const config = props.config
  const select = useMemo(() => createPerformanceMetricsSelector(config,pid), [pid, config?.cpu, config?.gpu, config?.ram, config?.fps])
  const metrics = useOverlayMetrics(select)
  return <Performance {...props} metrics={metrics} />
}
function LiveRobloxTimer(props: Omit<Parameters<typeof RobloxTimer>[0], 'idleTime'>) {
  const idleTime = useOverlayMetrics(data => data.idleTime || 0)
  return <RobloxTimer {...props} idleTime={idleTime} />
}

type Pos = { xPct: number; yPct: number }
type Positions = { performance: Pos; robloxTimer: Pos; robloxCps: Pos; crosshair: Pos; rlHud: Pos; rlSteamAvatar: Pos; rlController: Pos; media: Pos; cs2Stats:Pos }

const DEFAULT_POSITIONS: Positions = {
  cs2Stats:{xPct:0.02,yPct:0.3},
  performance: { xPct: 0.02, yPct: 0.03 },
  robloxTimer: { xPct: 0.75, yPct: 0.03 },
  robloxCps: { xPct: 0.75, yPct: 0.12 },
  crosshair: { xPct: 0.5, yPct: 0.5 },
  rlHud: { xPct: 0.02, yPct: 0.03 },
  rlSteamAvatar: { xPct: 0.02, yPct: 0.2 },
  rlController: { xPct: 0.78, yPct: 0.65 },
  media: { xPct: 0.02, yPct: 0.85 },
}

const WIDGET_APPROX_SIZE: Record<string, { w: number; h: number }> = {
  cs2Stats:{w:215,h:165},
  performance: { w: 110, h: 60 },
  robloxTimer: { w: 165, h: 80 },
  robloxCps: { w: 130, h: 32 },
  crosshair: { w: 30, h: 30 },
  rlHud: { w: 210, h: 155 },
  rlSteamAvatar: { w: 120, h: 120 },
  rlController: { w: 380, h: 270 },
  media: { w: 280, h: 56 },
}

export function OverlayApp() {
  const [activeGame, setActiveGame] = useState<any>(null)
  const [rlData, setRlData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)
  const [editGameData, setEditGameData] = useState<any>(null)
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS)
  const positionsRef = useRef<Positions>(DEFAULT_POSITIONS)
  const [clipToast, setClipToast] = useState<ClipToastData | null>(null)
  const handleDismissClipToast = useCallback(() => {
    setClipToast(null)
    window.electronAPI?.dismissClipToast?.()
  }, [])

  const dragging = useRef<{
    key: string; startMX: number; startMY: number; startPx: number; startPy: number; currentPx: number; currentPy: number; mouseX: number; mouseY: number; width: number; height: number
  } | null>(null)

  // Force transparent background
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent'
    document.documentElement.style.backgroundImage = 'none'
    document.body.style.backgroundColor = 'transparent'
    document.body.style.backgroundImage = 'none'
    const root = document.getElementById('overlay-root')
    if (root) root.style.backgroundColor = 'transparent'
  }, [])

  const [initialSettings, setInitialSettings] = useState<any>(null)
  const stateRevision = useRef(0)
  const settingsRevision = useRef(0)

  // Load exact persisted settings & active overlay state immediately on mount
  useEffect(() => {
    let disposed=false
    const revision=settingsRevision.current
    window.electronAPI?.getSettings?.().then((s: any) => {
      if (s && !disposed && revision===settingsRevision.current) {
        setInitialSettings(s)
        if (s.overlayPositions && !editModeRef.current) {
          const merged = normalizeOverlayPositions(DEFAULT_POSITIONS, s.overlayPositions)
          positionsRef.current = merged
          setPositions(previous => sameOverlayPositions(previous, merged) ? previous : merged)
        }
      }
    })

    return () => {disposed=true}
  }, [])

  // Subscribe to IPC events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    if (window.electronAPI?.onOverlayUpdate) {
      cleanups.push(window.electronAPI.onOverlayUpdate((data: any) => {
        stateRevision.current++;settingsRevision.current++
        if (data?.settings) {
          const s = data.settings
          const normalized: any = {
            ...s,
            overlayPerformance: s.performance !== undefined ? s.performance : s.overlayPerformance,
            overlayCrosshair: s.crosshair !== undefined ? s.crosshair : s.overlayCrosshair,
            overlayCps: s.cps !== undefined ? s.cps : s.overlayCps,
            overlayRobloxTimer: s.robloxTimer !== undefined ? s.robloxTimer : s.overlayRobloxTimer,
            overlayRobloxCps: s.robloxCps !== undefined ? s.robloxCps : s.overlayRobloxCps,
            overlayRobloxAntiAfk: s.robloxAntiAfk !== undefined ? s.robloxAntiAfk : s.overlayRobloxAntiAfk,
            overlayRLHud: s.rlHud !== undefined ? s.rlHud : s.overlayRLHud,
            overlayRLSteam: s.overlayRLSteam,
            overlayController: s.overlayController,
            overlayControllerStreamOnly: s.overlayControllerStreamOnly,
            overlayMedia: s.overlayMedia,
            language: s.language,
          }
          setActiveGame({ ...data, settings: normalized })
          setInitialSettings((prev: any) => ({
            ...prev,
            ...(s.metrics ? { overlayMetrics: s.metrics } : {}),
            ...normalized
          }))
        } else {
          setActiveGame(data)
        }
        if (!editModeRef.current && data?.positions) {
          const merged = normalizeOverlayPositions(DEFAULT_POSITIONS, data.positions)
          positionsRef.current = merged
          setPositions(previous => sameOverlayPositions(previous, merged) ? previous : merged)
        }
      }))
    }

    if (window.electronAPI?.onSettingsUpdate) {
      cleanups.push(window.electronAPI.onSettingsUpdate((newSettings: any) => {
        settingsRevision.current++
        if (newSettings) {
          const normalized: any = {
            ...newSettings,
            performance: newSettings.overlayPerformance !== undefined ? newSettings.overlayPerformance : newSettings.performance,
            crosshair: newSettings.overlayCrosshair !== undefined ? newSettings.overlayCrosshair : newSettings.crosshair,
            cps: newSettings.overlayCps !== undefined ? newSettings.overlayCps : newSettings.cps,
            robloxTimer: newSettings.overlayRobloxTimer !== undefined ? newSettings.overlayRobloxTimer : newSettings.robloxTimer,
            robloxCps: newSettings.overlayRobloxCps !== undefined ? newSettings.overlayRobloxCps : newSettings.robloxCps,
            robloxAntiAfk: newSettings.overlayRobloxAntiAfk !== undefined ? newSettings.overlayRobloxAntiAfk : newSettings.robloxAntiAfk,
            rlHud: newSettings.overlayRLHud !== undefined ? newSettings.overlayRLHud : newSettings.rlHud,
            overlayRLHud: newSettings.overlayRLHud !== undefined ? newSettings.overlayRLHud : newSettings.rlHud,
            overlayRLSteam: newSettings.overlayRLSteam,
            overlayController: newSettings.overlayController,
            overlayMedia: newSettings.overlayMedia,
            language: newSettings.language,
          }
          setInitialSettings((prev: any) => ({ ...prev, ...normalized }))
          const crosshairChanged = ['overlayCrosshair','crosshairConfig','overlayGameCrosshairs'].some(key => key in newSettings)
          const mergeGameSettings = (prev: any) => {
            if (!prev) return prev
            const crosshair = crosshairChanged ? resolveGameCrosshair(newSettings, prev) : {
              enabled: prev.settings?.crosshair ?? prev.settings?.overlayCrosshair,
              config: prev.settings?.crosshairConfig,
            }
            return { ...prev, settings: { ...prev.settings, ...normalized,
              crosshair: crosshair.enabled, overlayCrosshair: crosshair.enabled, crosshairConfig: crosshair.config,
            } }
          }
          setEditGameData(mergeGameSettings)
          setActiveGame(mergeGameSettings)
        }
      }))
    }


    if ((window.electronAPI as any)?.onRLMMRUpdate) {
      let revision = 0
      cleanups.push((window.electronAPI as any).onRLMMRUpdate((data: any) => {
        revision++
        setRlData(data)
      }))
      const requested = revision
      let active = true
      void window.electronAPI?.getRLState?.().then(data => { if (active && revision === requested) setRlData(data) }).catch(() => {})
      cleanups.push(() => { active = false })
    }

    if (window.electronAPI?.onOverlayEditStart) {
      cleanups.push(window.electronAPI.onOverlayEditStart((gameData: any) => {
        setEditMode(true)
        editModeRef.current = true
        if (gameData) {
          setEditGameData(gameData)
          if (gameData.positions) {
            const merged = normalizeOverlayPositions(DEFAULT_POSITIONS, gameData.positions)
            positionsRef.current = merged
            setPositions(previous => sameOverlayPositions(previous, merged) ? previous : merged)
          }
        }
      }))
    }

    if (window.electronAPI?.onOverlayEditEnd) {
      cleanups.push(window.electronAPI.onOverlayEditEnd(() => {
        setEditMode(false)
        editModeRef.current = false
        setEditGameData(null)
      }))
    }

    if ((window.electronAPI as any)?.onClipSavedToast) {
      cleanups.push((window.electronAPI as any).onClipSavedToast((data: any) => {
        if (data) {
          stateRevision.current++
          setClipToast({
            id: data.id || data.timestamp || Date.now(),
            title: data.title || 'Highlight Clip',
            gameTitle: data.gameTitle || 'Gameplay',
            duration: data.duration || 30,
            thumbnailUrl: data.thumbnailUrl || data.thumbnailDataUrl,
            status: data.status, language: data.language,
            color: data.color || initialSettings?.overlayClipToastColor || '#ff6600',
          })
        }
      }))
    }

    const requestedState=stateRevision.current
    let disposed=false
    window.electronAPI?.getOverlayState?.().then((state: any) => {
      if (state && !disposed && stateRevision.current===requestedState) {
        if (state.pendingClipToast) {
          const d = state.pendingClipToast
          setClipToast({
            id: d.id || d.timestamp || Date.now(),
            title: d.title || 'Highlight Clip',
            gameTitle: d.gameTitle || 'Gameplay',
            duration: d.duration || 30,
            thumbnailUrl: d.thumbnailUrl || d.thumbnailDataUrl,
            status: d.status, language: d.language,
            color: d.color || initialSettings?.overlayClipToastColor || '#ff6600',
          })
        }
        if (state.gameData) {
          setActiveGame(state.gameData)
          if (state.gameData.positions && !editModeRef.current) {
            const merged = normalizeOverlayPositions(DEFAULT_POSITIONS, state.gameData.positions)
            positionsRef.current = merged
            setPositions(previous => sameOverlayPositions(previous, merged) ? previous : merged)
          }
        }
        if (state.isEditMode) {
          setEditMode(true)
          editModeRef.current = true
          if (state.editGameData) {
            setEditGameData(state.editGameData)
          }
        }
      }
    })

    return () => {disposed=true;cleanups.forEach(c => c())}
  }, [])

  const rafRef = useRef<number | null>(null)

  const flushDrag = useCallback(() => {
    const drag = dragging.current
    if (!drag) return
    const x = Math.max(0, Math.min(Math.max(0, window.innerWidth - drag.width), drag.startPx + drag.mouseX - drag.startMX))
    const y = Math.max(0, Math.min(Math.max(0, window.innerHeight - drag.height), drag.startPy + drag.mouseY - drag.startMY))
    drag.currentPx = x
    drag.currentPy = y
    positionsRef.current = { ...positionsRef.current, [drag.key]: { xPct: x / window.innerWidth, yPct: y / window.innerHeight } }
    const element = document.getElementById(`widget-${drag.key}`)
    if (element) { element.style.left = `${x}px`; element.style.top = `${y}px` }
  }, [])

  // Drag logic for edit mode
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    dragging.current.mouseX = e.clientX
    dragging.current.mouseY = e.clientY
    if (rafRef.current !== null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      flushDrag()
    })
  }, [flushDrag])

  const onMouseUp = useCallback((event: MouseEvent) => {
    if (dragging.current) {
      dragging.current.mouseX = event.clientX
      dragging.current.mouseY = event.clientY
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      flushDrag()
      const key = dragging.current.key
      const finalXPct = dragging.current.currentPx / window.innerWidth
      const finalYPct = dragging.current.currentPy / window.innerHeight
      const next = {
        ...positionsRef.current,
        [key]: { xPct: finalXPct, yPct: finalYPct }
      }
      positionsRef.current = next
      setPositions(next)
      dragging.current = null
    }
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove, flushDrag])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove, onMouseUp])

  const startDrag = (key: string, e: React.MouseEvent) => {
    if (!editMode || key === 'crosshair') return
    e.preventDefault()
    e.stopPropagation()
    const pos = positionsRef.current[key as keyof Positions] || DEFAULT_POSITIONS[key as keyof Positions]
    const element = document.getElementById(`widget-${key}`)
    const bounds = element?.getBoundingClientRect()
    const contentBounds = element?.firstElementChild?.getBoundingClientRect()
    const fallback = WIDGET_APPROX_SIZE[key] || { w: 100, h: 50 }
    dragging.current = {
      key,
      startMX: e.clientX,
      startMY: e.clientY,
      startPx: bounds?.left ?? pos.xPct * window.innerWidth,
      startPy: bounds?.top ?? pos.yPct * window.innerHeight,
      currentPx: bounds?.left ?? pos.xPct * window.innerWidth,
      currentPy: bounds?.top ?? pos.yPct * window.innerHeight,
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: Math.max(bounds?.width || 0, contentBounds?.width || 0) || fallback.w,
      height: Math.max(bounds?.height || 0, contentBounds?.height || 0) || fallback.h,
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleSave = async () => {
    await window.electronAPI?.saveOverlayPositions(positionsRef.current)
  }

  const handleCancel = async () => {
    await window.electronAPI?.exitOverlayEdit()
  }


  const displayGame = editMode ? editGameData || activeGame : activeGame
  const ds = displayGame?.settings || {}

  const resolveBool = (shortKey: string, longKey: string, defaultVal: boolean = false): boolean => {
    if (editMode && editGameData?.settings) {
      if (editGameData.settings[shortKey] !== undefined) return Boolean(editGameData.settings[shortKey])
      if (editGameData.settings[longKey] !== undefined) return Boolean(editGameData.settings[longKey])
    }
    if (ds[shortKey] !== undefined) return Boolean(ds[shortKey])
    if (ds[longKey] !== undefined) return Boolean(ds[longKey])
    if (initialSettings?.[longKey] !== undefined) return Boolean(initialSettings[longKey])
    if (initialSettings?.[shortKey] !== undefined) return Boolean(initialSettings[shortKey])
    return defaultVal
  }

  const settings = {
    cs2Stats:resolveBool('overlayCS2Stats','overlayCS2Stats')&&(editMode||identifyCrosshairGame(displayGame)==='cs2'),
    performance: resolveBool('performance', 'overlayPerformance'),
    crosshair: resolveBool('crosshair', 'overlayCrosshair'),
    robloxTimer: resolveBool('robloxTimer', 'overlayRobloxTimer'),
    robloxCps: resolveBool('robloxCps', 'overlayRobloxCps'),
    robloxAntiAfk: resolveBool('robloxAntiAfk', 'overlayRobloxAntiAfk'),
    cps: resolveBool('cps', 'overlayCps'),
    rlHud: resolveBool('rlHud', 'overlayRLHud'),
    overlayRLHud: resolveBool('rlHud', 'overlayRLHud'),
    overlayRLSteam: resolveBool('overlayRLSteam', 'overlayRLSteam'),
    overlayController: resolveBool('overlayController', 'overlayController'),
    overlayControllerStreamOnly: resolveBool('overlayControllerStreamOnly', 'overlayControllerStreamOnly'),
    overlayRLController: resolveBool('overlayRLController', 'overlayRLController') || resolveBool('overlayController', 'overlayController'),
    rlControllerSkin: ds.rlControllerSkin || initialSettings?.rlControllerSkin || 'ps5_white',
    rlControllerUrl: ds.rlControllerUrl || initialSettings?.rlControllerUrl || 'https://gamepadviewer.com/?p=1&s=ps5_white',
    rlControllerScale: ds.rlControllerScale ?? initialSettings?.rlControllerScale ?? 80,
    metrics: ds.metrics || initialSettings?.overlayMetrics || { fps: true, cpu: true, ram: true, gpu: true, ping: false, time: true, layout: 'vertical' },
    crosshairConfig: ds.crosshairConfig || initialSettings?.crosshairConfig,
    steamProfileUrl: ds.steamProfileUrl || initialSettings?.steamProfileUrl,
    rlScoreboardKeyCtrl: ds.rlScoreboardKeyCtrl || initialSettings?.rlScoreboardKeyCtrl || 'Button 8',
    rlSteamAvatarScale: ds.rlSteamAvatarScale ?? initialSettings?.rlSteamAvatarScale ?? 85,
    overlayMedia: resolveBool('overlayMedia', 'overlayMedia'),
    overlayMediaSource: ds.overlayMediaSource || initialSettings?.overlayMediaSource || 'all',
    overlayMediaAutoHide: resolveBool('overlayMediaAutoHide', 'overlayMediaAutoHide'),
    overlayMediaVisualizer: ds.overlayMediaVisualizer !== false && initialSettings?.overlayMediaVisualizer !== false,
  }

  // Allow clicking buttons on interactive widgets (e.g. Media Player) ONLY when media widget is active
  useEffect(() => {
    if (editMode || !settings.overlayMedia) return

    let wasOverInteractive = false
    const onMouseMove = (e: MouseEvent) => {
      const mediaEl = document.getElementById('widget-media')
      if (!mediaEl) {
        if (wasOverInteractive) {
          wasOverInteractive = false
          window.electronAPI?.setOverlayIgnoreMouse?.(true)
        }
        return
      }

      const rect = mediaEl.getBoundingClientRect()
      const isOver = e.clientX >= rect.left - 8 && e.clientX <= rect.right + 8 &&
                     e.clientY >= rect.top - 8 && e.clientY <= rect.bottom + 8

      if (isOver !== wasOverInteractive) {
        wasOverInteractive = isOver
        window.electronAPI?.setOverlayIgnoreMouse?.(!isOver)
      }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.electronAPI?.setOverlayIgnoreMouse?.(true)
    }
  }, [editMode, settings.overlayMedia])

  const currentLang = initialSettings?.language || activeGame?.settings?.language ||
    (navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en')

  // Guard: Never render uninitialized widgets before settings or active game are loaded
  if (!initialSettings && !activeGame && !editGameData && !clipToast) {
    return null
  }

  const isRealGameRunning = Boolean(activeGame && activeGame.name && activeGame.name !== 'Desktop')
  const isDesktopOverlayAllowed = Boolean(
    (activeGame?.name === 'Desktop' && (activeGame?.settings?.overlayGeneralAlwaysOn || initialSettings?.overlayGeneralAlwaysOn)) ||
    initialSettings?.overlayGeneralAlwaysOn
  )
  const isPermanentWidgetAllowed = editMode || isRealGameRunning || isDesktopOverlayAllowed

  // Guard: If no game is running and not in edit mode, ensure at least one visible widget is active
  const isAnyWidgetActive = Boolean(
    isPermanentWidgetAllowed && (
      settings.performance ||
      settings.cs2Stats ||
      settings.crosshair ||
      settings.cps ||
      settings.robloxTimer ||
      settings.robloxCps ||
      settings.rlHud ||
      settings.overlayRLSteam ||
      (!settings.overlayControllerStreamOnly && (settings.overlayController || settings.overlayRLController)) ||
      settings.overlayMedia
    )
  )

  if (!editMode && !isRealGameRunning && !isAnyWidgetActive && !clipToast) {
    return null
  }

  const renderWidget = (key: string, children: React.ReactNode) => {
    const isCrosshair = key === 'crosshair'
    const pos = isCrosshair ? { xPct: 0.5, yPct: 0.5 } : positions[key as keyof Positions]
    if (!pos) return null
    
    let xPct = pos.xPct
    let yPct = pos.yPct
    
    // If React renders while we are dragging (e.g. from metrics update), use the live drag position
    // instead of the old state to prevent the widget from snapping back visually
    if (dragging.current?.key === key) {
      xPct = dragging.current.currentPx / window.innerWidth
      yPct = dragging.current.currentPy / window.innerHeight
    }

    return (
      <OverlayWidget
        id={`widget-${key}`}
        key={key}
        xPct={xPct}
        yPct={yPct}
        centered={isCrosshair}
        onMouseDown={editMode && !isCrosshair ? (e) => startDrag(key, e) : undefined}
        style={{
          cursor: editMode && !isCrosshair ? 'grab' : 'default',
          pointerEvents: (editMode && !isCrosshair) || key === 'media' ? 'auto' : 'none',
          zIndex: 10,
        }}
      >
        {editMode && !isCrosshair && key !== 'performance' && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: 10, zIndex: -1,
            border: '1.5px dashed rgba(255, 255, 255, 0.6)',
            background: 'rgba(255, 255, 255, 0.03)',
            boxShadow: '0 0 12px rgba(255, 255, 255, 0.08)',
            pointerEvents: 'none',
          }} />
        )}
        {children}
      </OverlayWidget>
    )
  }

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        pointerEvents: editMode ? 'auto' : 'none',
      }}
    >
      {/* Grid overlay in Edit Mode (Clean Dots) */}
      {editMode && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'rgba(0, 0, 0, 0.45)',
        }}>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dot-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="18" cy="18" r="1.2" fill="rgba(255, 255, 255, 0.22)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />
            {/* Center crosshair guide */}
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="5 5" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="5 5" />
          </svg>
        </div>
      )}

      {/* Widgets */}
      {isPermanentWidgetAllowed && settings.performance && renderWidget('performance',
        <LivePerformance config={settings.metrics} editMode={editMode} language={currentLang} pid={activeGame?.pid} />
      )}
      {isPermanentWidgetAllowed && settings.robloxTimer && (editMode || displayGame?.name === 'Roblox') && renderWidget('robloxTimer',
        <LiveRobloxTimer startTime={displayGame?.startTime || Date.now()} antiAfkEnabled={settings.robloxAntiAfk} language={currentLang} />
      )}
      {isPermanentWidgetAllowed && (settings.cps || (settings.robloxCps && (editMode || displayGame?.name === 'Roblox')) || (editMode && (settings.cps || settings.robloxCps))) && renderWidget('robloxCps',
        <RobloxCPS language={currentLang} />
      )}
      {isPermanentWidgetAllowed && settings.rlHud && (editMode || displayGame?.name === 'Rocket League') && renderWidget('rlHud',
        <RocketLeagueHUD data={rlData} language={currentLang} />
      )}
      {isPermanentWidgetAllowed && settings.overlayRLSteam && (editMode || displayGame?.name === 'Rocket League') && settings.steamProfileUrl && renderWidget('rlSteamAvatar',
        <RLSteamAvatarHUD 
          steamUrl={settings.steamProfileUrl} 
          scale={settings.rlSteamAvatarScale} 
          controllerKey={settings.rlScoreboardKeyCtrl || 'Button 8'}
          isEditMode={editMode}
        />
      )}
      {isPermanentWidgetAllowed && (!settings.overlayControllerStreamOnly || editMode) && (settings.overlayController || (settings.overlayRLController && (editMode || displayGame?.name === 'Rocket League')) || (editMode && (settings.overlayController || settings.overlayRLController))) && renderWidget('rlController',
        <ControllerOverlay 
          skin={settings.rlControllerSkin}
          url={settings.rlControllerUrl} 
          scale={settings.rlControllerScale} 
          isEditMode={editMode}
          language={currentLang}
        />
      )}
      {isPermanentWidgetAllowed && settings.crosshair && renderWidget('crosshair',
        <Crosshair config={settings.crosshairConfig} />
      )}
      {isPermanentWidgetAllowed&&settings.cs2Stats&&renderWidget('cs2Stats',<CS2Stats language={currentLang} editMode={editMode}/>)}
      {isPermanentWidgetAllowed && settings.overlayMedia && renderWidget('media',
        <MediaOverlayWidget 
          editMode={editMode} 
          autoHide={settings.overlayMediaAutoHide}
          mediaSource={settings.overlayMediaSource}
          showVisualizer={settings.overlayMediaVisualizer}
          language={currentLang}
        />
      )}

      {/* Clip Saved Toast Notification Overlay (bottom-right) */}
      {clipToast && (
        <ClipToastOverlay
          key={clipToast.id}
          toast={clipToast}
          onDismiss={handleDismissClipToast}
          language={clipToast.language || currentLang}
          color={clipToast.color || initialSettings?.overlayClipToastColor || '#ff6600'}
        />
      )}

      {/* Edit mode UI */}
      {editMode && (() => {
        const isDe = currentLang === 'de'
        return (
          <div style={{
            position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'rgba(10, 11, 16, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 12,
            padding: '7px 10px 7px 16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            pointerEvents: 'auto', userSelect: 'none', zIndex: 9999,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.8)', letterSpacing: '0.02em',
            }}>
              <span style={{ fontSize: 13 }}>🖱️</span>
              <span>{isDe ? 'Elemente ziehen zum Positionieren' : 'Drag elements to reposition'}</span>
            </div>

            <div style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.1)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleSave}
                style={{
                  background: '#ffffff', color: '#000000', border: 'none',
                  borderRadius: 8, padding: '6px 14px',
                  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.01em',
                  boxShadow: '0 2px 8px rgba(255, 255, 255, 0.15)',
                  transition: 'transform 0.08s ease, opacity 0.08s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {isDe ? '✓ Speichern & Fertig' : '✓ Save & Done'}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, padding: '6px 12px',
                  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  transition: 'background 0.08s ease, color 0.08s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)'
                }}
              >
                {isDe ? 'Abbrechen' : 'Cancel'}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
