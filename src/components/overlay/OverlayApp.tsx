import { useEffect, useRef, useState, useCallback } from 'react'
import { Crosshair } from './widgets/Crosshair'
import { Performance } from './widgets/Performance'
import { RobloxTimer } from './widgets/RobloxTimer'
import { RocketLeagueHUD } from './widgets/RocketLeagueHUD'
import { RLSteamAvatarHUD } from './widgets/RLSteamAvatarHUD'

type Pos = { xPct: number; yPct: number }
type Positions = { performance: Pos; robloxTimer: Pos; crosshair: Pos; rlHud: Pos; rlSteamAvatar: Pos }

const DEFAULT_POSITIONS: Positions = {
  performance: { xPct: 0.02, yPct: 0.03 },
  robloxTimer: { xPct: 0.75, yPct: 0.03 },
  crosshair: { xPct: 0.5, yPct: 0.5 },
  rlHud: { xPct: 0.02, yPct: 0.03 },
  rlSteamAvatar: { xPct: 0.02, yPct: 0.2 },
}

const WIDGET_APPROX_SIZE: Record<string, { w: number; h: number }> = {
  performance: { w: 110, h: 60 },
  robloxTimer: { w: 165, h: 80 },
  crosshair: { w: 30, h: 30 },
  rlHud: { w: 210, h: 155 },
  rlSteamAvatar: { w: 120, h: 120 },
}

export function OverlayApp() {
  const [activeGame, setActiveGame] = useState<any>(null)
  const [metrics, setMetrics] = useState({ cpu: 0, gpu: 0, ram: 0, ramMB: 0, totalMB: 0, idleTime: 0 })
  const [rlData, setRlData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)
  const [editGameData, setEditGameData] = useState<any>(null)
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS)

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
          setPositions({ ...DEFAULT_POSITIONS, ...data.positions })
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
          if (gameData.positions) setPositions({ ...DEFAULT_POSITIONS, ...gameData.positions })
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
      
      dragging.current.currentPx = newPx
      dragging.current.currentPy = newPy
      
      const el = document.getElementById(`widget-${key}`)
      if (el) {
        el.style.left = `${(newPx / window.innerWidth) * 100}%`
        el.style.top = `${(newPy / window.innerHeight) * 100}%`
      }
    })
  }, [])

  const onMouseUp = useCallback(() => {
    if (dragging.current) {
      const key = dragging.current.key
      const el = document.getElementById(`widget-${key}`)
      if (el) {
        setPositions(prev => ({
          ...prev,
          [key]: { 
            xPct: parseFloat(el.style.left) / 100, 
            yPct: parseFloat(el.style.top) / 100 
          }
        }))
      }
    }
    dragging.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const startDrag = (key: string, e: React.MouseEvent) => {
    if (!editMode || key === 'crosshair') return
    e.preventDefault()
    const pos = positions[key as keyof Positions]
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
    await window.electronAPI?.saveOverlayPositions(positions)
  }

  const handleCancel = async () => {
    await window.electronAPI?.exitOverlayEdit()
  }

  const displayGame = activeGame || editGameData
  const settings = displayGame?.settings || {
    performance: true,
    crosshair: true,
    robloxTimer: false,
    metrics: { fps: true, cpu: true, ram: true, gpu: false, ping: false, time: true },
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
            border: '1px dashed rgba(99,102,241,0.6)',
            background: 'rgba(99,102,241,0.06)',
            boxShadow: '0 0 12px rgba(99,102,241,0.15)',
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
      {settings.robloxTimer && displayGame && renderWidget('robloxTimer',
        <RobloxTimer startTime={displayGame.startTime} idleTime={metrics.idleTime} />
      )}
      {settings.rlHud && renderWidget('rlHud',
        <RocketLeagueHUD data={rlData} />
      )}
      {settings.overlayRLSteam && settings.steamProfileUrl && renderWidget('rlSteamAvatar',
        <RLSteamAvatarHUD 
          steamUrl={settings.steamProfileUrl} 
          scale={settings.rlSteamAvatarScale} 
          controllerKey={settings.rlScoreboardKeyCtrl || 'Button 8'}
          isEditMode={editMode}
        />
      )}

      {settings.crosshair && renderWidget('crosshair',
        <Crosshair config={settings.crosshairConfig} />
      )}

      {/* Edit mode UI */}
      {editMode && (
        <div style={{
          position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          pointerEvents: 'auto',
        }}>
          <div style={{
            background: 'rgba(10,10,20,0.9)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(99,102,241,0.4)', borderRadius: 16,
            padding: '12px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          }}>
            <div style={{
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
              color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              🖱️ Overlay Edit Mode — Drag widgets to reposition
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSave}
                style={{
                  background: '#6366f1', color: 'white', border: 'none',
                  borderRadius: 9, padding: '8px 20px',
                  fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                ✓ Save & Done
              </button>
              <button
                onClick={handleCancel}
                style={{
                  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '8px 16px',
                  fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
