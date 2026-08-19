import { useEffect, useRef, useState, useCallback } from 'react'
import { Crosshair } from './widgets/Crosshair'
import { Performance } from './widgets/Performance'
import { RobloxTimer } from './widgets/RobloxTimer'
import { RobloxCPS } from './widgets/RobloxCPS'
import { RocketLeagueHUD } from './widgets/RocketLeagueHUD'
import { RLSteamAvatarHUD } from './widgets/RLSteamAvatarHUD'
import { ControllerOverlay } from './widgets/ControllerOverlay'

type Pos = { xPct: number; yPct: number }
type Positions = { performance: Pos; robloxTimer: Pos; robloxCps: Pos; crosshair: Pos; rlHud: Pos; rlSteamAvatar: Pos; rlController: Pos }

const DEFAULT_POSITIONS: Positions = {
  performance: { xPct: 0.02, yPct: 0.03 },
  robloxTimer: { xPct: 0.75, yPct: 0.03 },
  robloxCps: { xPct: 0.75, yPct: 0.12 },
  crosshair: { xPct: 0.5, yPct: 0.5 },
  rlHud: { xPct: 0.02, yPct: 0.03 },
  rlSteamAvatar: { xPct: 0.02, yPct: 0.2 },
  rlController: { xPct: 0.78, yPct: 0.65 },
}

const WIDGET_APPROX_SIZE: Record<string, { w: number; h: number }> = {
  performance: { w: 110, h: 60 },
  robloxTimer: { w: 165, h: 80 },
  robloxCps: { w: 130, h: 32 },
  crosshair: { w: 30, h: 30 },
  rlHud: { w: 210, h: 155 },
  rlSteamAvatar: { w: 120, h: 120 },
  rlController: { w: 380, h: 270 },
}

export function OverlayApp() {
  const [activeGame, setActiveGame] = useState<any>(null)
  const [metrics, setMetrics] = useState({ cpu: 0, gpu: 0, ram: 0, ramMB: 0, totalMB: 0, idleTime: 0 })
  const [rlData, setRlData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)
  const [editGameData, setEditGameData] = useState<any>(null)
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS)
  const positionsRef = useRef<Positions>(DEFAULT_POSITIONS)

  const dragging = useRef<{
    key: string; startMX: number; startMY: number; startPx: number; startPy: number; currentPx: number; currentPy: number
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

  // Subscribe to IPC events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    if (window.electronAPI?.onOverlayUpdate) {
      cleanups.push(window.electronAPI.onOverlayUpdate((data: any) => {
        setActiveGame(data)
        if (!editModeRef.current && data?.positions) {
          const merged = { ...DEFAULT_POSITIONS, ...data.positions }
          positionsRef.current = merged
          setPositions(merged)
        }
      }))
    }

    if (window.electronAPI?.onMetricsUpdate) {
      cleanups.push(window.electronAPI.onMetricsUpdate((data) => {
        setMetrics(data)
      }))
    }

    if ((window.electronAPI as any)?.onRLMMRUpdate) {
      cleanups.push((window.electronAPI as any).onRLMMRUpdate((data: any) => {
        setRlData(data)
      }))
    }

    if (window.electronAPI?.onOverlayEditStart) {
      cleanups.push(window.electronAPI.onOverlayEditStart((gameData: any) => {
        setEditMode(true)
        editModeRef.current = true
        if (gameData) {
          setEditGameData(gameData)
          if (gameData.positions) {
            const merged = { ...DEFAULT_POSITIONS, ...gameData.positions }
            positionsRef.current = merged
            setPositions(merged)
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

    return () => cleanups.forEach(c => c())
  }, [])

  const rafRef = useRef<number | null>(null)

  // Drag logic for edit mode
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const { key, startMX, startMY, startPx, startPy } = dragging.current
    
    // Read mouse coords synchronously
    const mx = e.clientX
    const my = e.clientY

    if (rafRef.current !== null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (!dragging.current) return
      
      const sz = WIDGET_APPROX_SIZE[key] || { w: 100, h: 50 }
      const dx = mx - startMX
      const dy = my - startMY
      const maxX = window.innerWidth - sz.w
      const maxY = window.innerHeight - sz.h
      const newPx = Math.max(0, Math.min(maxX, startPx + dx))
      const newPy = Math.max(0, Math.min(maxY, startPy + dy))
      
      const xPct = newPx / window.innerWidth
      const yPct = newPy / window.innerHeight

      dragging.current.currentPx = newPx
      dragging.current.currentPy = newPy
      positionsRef.current = {
        ...positionsRef.current,
        [key]: { xPct, yPct }
      }
      
      const el = document.getElementById(`widget-${key}`)
      if (el) {
        el.style.left = `${xPct * 100}%`
        el.style.top = `${yPct * 100}%`
      }
    })
  }, [])

  const onMouseUp = useCallback(() => {
    if (dragging.current) {
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
  }, [onMouseMove])

  const startDrag = (key: string, e: React.MouseEvent) => {
    if (!editMode || key === 'crosshair') return
    e.preventDefault()
    e.stopPropagation()
    const pos = positionsRef.current[key as keyof Positions] || DEFAULT_POSITIONS[key as keyof Positions]
    dragging.current = {
      key,
      startMX: e.clientX,
      startMY: e.clientY,
      startPx: pos.xPct * window.innerWidth,
      startPy: pos.yPct * window.innerHeight,
      currentPx: pos.xPct * window.innerWidth,
      currentPy: pos.yPct * window.innerHeight,
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

  const displayGame = activeGame || editGameData
  const settings = displayGame?.settings || {
    performance: true,
    crosshair: true,
    robloxTimer: false,
    robloxCps: false,
    metrics: { fps: true, cpu: true, ram: true, gpu: true, ping: false, time: true },
    crosshairConfig: undefined,
    steamProfileUrl: undefined,
    rlSteamAvatarScale: 1,
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
      <div
        id={`widget-${key}`}
        key={key}
        onMouseDown={editMode && !isCrosshair ? (e) => startDrag(key, e) : undefined}
        style={{
          position: 'absolute',
          left: `${xPct * 100}%`,
          top: `${yPct * 100}%`,
          cursor: editMode && !isCrosshair ? 'grab' : 'default',
          pointerEvents: editMode && !isCrosshair ? 'auto' : 'none',
          zIndex: 10,
        }}
      >
        {editMode && !isCrosshair && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: 12, zIndex: -1,
            border: '1px dashed rgba(255, 255, 255, 0.4)',
            background: 'rgba(255, 255, 255, 0.03)',
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.08)',
            pointerEvents: 'none',
          }} />
        )}
        {children}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      overflow: 'hidden', userSelect: 'none', background: 'transparent',
      pointerEvents: editMode ? 'auto' : 'none',
    }}>
      {/* Edit mode background */}
      {editMode && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
        }}>
          {/* Grid */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {Array.from({ length: 30 }).map((_, xi) =>
              Array.from({ length: 18 }).map((_, yi) => (
                <circle
                  key={`${xi}-${yi}`}
                  cx={`${(xi + 0.5) * (100 / 30)}%`}
                  cy={`${(yi + 0.5) * (100 / 18)}%`}
                  r="1.5"
                  fill="rgba(255,255,255,0.08)"
                />
              ))
            )}
          </svg>
        </div>
      )}

      {/* Widgets */}
      {settings.performance && renderWidget('performance',
        <Performance metrics={metrics} config={settings.metrics} />
      )}
      {settings.robloxTimer && (editMode || displayGame?.name === 'Roblox') && renderWidget('robloxTimer',
        <RobloxTimer startTime={displayGame?.startTime || Date.now()} idleTime={metrics.idleTime} />
      )}
      {(settings.cps || settings.robloxCps) && renderWidget('robloxCps',
        <RobloxCPS />
      )}
      {settings.rlHud && (editMode || displayGame?.name === 'Rocket League') && renderWidget('rlHud',
        <RocketLeagueHUD data={rlData} />
      )}
      {settings.overlayRLSteam && (editMode || displayGame?.name === 'Rocket League') && settings.steamProfileUrl && renderWidget('rlSteamAvatar',
        <RLSteamAvatarHUD 
          steamUrl={settings.steamProfileUrl} 
          scale={settings.rlSteamAvatarScale} 
          controllerKey={settings.rlScoreboardKeyCtrl || 'Button 8'}
          isEditMode={editMode}
        />
      )}
      {settings.overlayRLController && (editMode || displayGame?.name === 'Rocket League') && renderWidget('rlController',
        <ControllerOverlay 
          url={settings.rlControllerUrl} 
          scale={settings.rlControllerScale} 
          isEditMode={editMode}
        />
      )}

      {settings.crosshair && renderWidget('crosshair',
        <Crosshair config={settings.crosshairConfig} />
      )}

      {/* Edit mode UI */}
      {editMode && (
        <div style={{
          position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'rgba(10, 11, 16, 0.88)', backdropFilter: 'blur(20px) saturate(180%)',
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
            <span>Drag widgets to reposition</span>
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
              ✓ Save & Done
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
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
