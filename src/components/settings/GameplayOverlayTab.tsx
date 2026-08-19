import React, { useState, useEffect, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Gamepad2, Move, Check, Activity, Crosshair as CrosshairIcon, Timer,
  ChevronDown, Cpu, MemoryStick, Clock, Layers, Edit3, MousePointerClick, Gauge
} from 'lucide-react'
import type { AppSettings } from '../../types/game'
import { CROSSHAIR_PRESETS, CrosshairSVG, DEFAULT_CROSSHAIR } from '../overlay/widgets/Crosshair'
import type { CrosshairConfig } from '../overlay/widgets/Crosshair'

import robloxLogoImg from '../../assets/Roblox-Logo-Icon.png'
import rlLogoImg from '../../assets/Rocket-League-Logo.png'
import steamLogoImg from '../../assets/steam-logo.png'

// ─── Shared Toggle (Monochrome White & Black) ─────────────────────────────────
const Toggle = memo(function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button 
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange} 
      className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-out focus:outline-none ${
        checked ? 'bg-white' : 'bg-white/15'
      }`}
      style={{
        borderRadius: 9999,
        border: '2px solid transparent',
        boxShadow: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-sm ring-0 transition duration-150 ease-out ${
          checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/70'
        }`}
        style={{
          borderRadius: 9999,
          border: 'none',
        }}
      />
    </button>
  )
})

// ─── Section Label (Monochrome Minimalist) ────────────────────────────────────
const SectionLabel = memo(function SectionLabel({ icon, title, subtitle }: {
  icon: React.ReactNode; title: string; subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-white border border-white/10">{icon}</div>
      <div>
        <div className="text-[13px] font-semibold text-white tracking-tight">{title}</div>
        {subtitle && <div className="text-[11px] text-white/50 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  )
})

// ─── Metric Item ──────────────────────────────────────────────────────────────
const MetricItem = memo(function MetricItem({ label, description, enabled, onToggle, icon }: {
  label: string; description: string; enabled: boolean; onToggle: () => void; icon: React.ReactNode
}) {
  return (
    <div onClick={onToggle} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
        enabled ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'
      }`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-medium ${enabled ? 'text-white' : 'text-white/60'}`}>{label}</div>
        <div className="text-[10px] text-white/40">{description}</div>
      </div>
      <Toggle checked={enabled} onChange={() => {}} />
    </div>
  )
})

// ─── Performance Dropdown ─────────────────────────────────────────────────────
const PerformanceSection = memo(function PerformanceSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const [open, setOpen] = useState(false)

  const metrics = settings.overlayMetrics ?? {
    fps: true, cpu: true, gpu: true, ram: true, ping: false, time: true,
  }

  const toggleMetric = useCallback((key: keyof typeof metrics) => {
    const updated = { ...metrics, [key]: !metrics[key] }
    save('overlayMetrics', updated)
  }, [metrics, save])

  const activeCount = Object.values(metrics).filter(Boolean).length

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 overflow-hidden ${
        open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.1] bg-[#0c0d12]'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          settings.overlayPerformance ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
        }`}>
          <Activity size={15} />
        </div>
        <div className="flex-1 min-w-0" onClick={() => setOpen(p => !p)}>
          <div className={`text-[13px] font-semibold cursor-pointer ${settings.overlayPerformance ? 'text-white' : 'text-white/70'}`}>
            Performance
          </div>
          <div className="text-[11px] text-white/40">
            {settings.overlayPerformance ? `${activeCount} metric${activeCount !== 1 ? 's' : ''} active` : 'Disabled'}
          </div>
        </div>
        <button onClick={() => setOpen(p => !p)} className="p-1 hover:bg-white/[0.06] rounded-lg transition-colors mr-1">
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown size={14} className="text-white/50" />
          </motion.div>
        </button>
        <Toggle checked={settings.overlayPerformance || false} onChange={() => save('overlayPerformance', !settings.overlayPerformance)} />
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="h-px bg-white/[0.06] mx-4" />
            
            {/* Combined Layout Mode & Size Controls */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06] gap-3">
              <div>
                <div className="text-[12px] font-medium text-white">Layout & Size</div>
                <div className="text-[10px] text-white/40">HUD format and scaling</div>
              </div>

              <div className="flex items-center gap-2">
                {/* Layout Mode Switch */}
                <div className="flex items-center p-0.5 rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, layout: 'vertical' })}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      (metrics.layout ?? 'vertical') === 'vertical'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Vertical
                  </button>
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, layout: 'horizontal' })}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      metrics.layout === 'horizontal'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Horizontal
                  </button>
                </div>

                {/* Compact Smooth Size Stepper Pill */}
                <div className="flex items-center p-0.5 rounded-lg bg-white/[0.06] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      const current = metrics.scale ?? 1
                      const next = Math.max(0.70, Math.round((current - 0.05) * 100) / 100)
                      save('overlayMetrics', { ...metrics, scale: next })
                    }}
                    className="w-6 h-6 flex items-center justify-center text-[13px] font-bold text-white/70 hover:text-white hover:bg-white/10 rounded transition-all active:scale-90"
                    title="Smaller"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, scale: 1 })}
                    className="px-1.5 text-[11px] font-mono font-medium text-white/90 hover:text-white transition-colors"
                    title="Reset to 100%"
                  >
                    {Math.round((metrics.scale ?? 1) * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = metrics.scale ?? 1
                      const next = Math.min(1.50, Math.round((current + 0.05) * 100) / 100)
                      save('overlayMetrics', { ...metrics, scale: next })
                    }}
                    className="w-6 h-6 flex items-center justify-center text-[13px] font-bold text-white/70 hover:text-white hover:bg-white/10 rounded transition-all active:scale-90"
                    title="Larger"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="py-1">
              <MetricItem label="FPS" description="Live frame rate from active game rendering" enabled={metrics.fps} onToggle={() => toggleMetric('fps')} icon={<Layers size={12} />} />
              <MetricItem label="CPU Usage" description="Real system CPU % from OS" enabled={metrics.cpu} onToggle={() => toggleMetric('cpu')} icon={<Cpu size={12} />} />
              <MetricItem label="GPU Usage" description="Real system GPU % from hardware" enabled={metrics.gpu ?? true} onToggle={() => toggleMetric('gpu')} icon={<Gauge size={12} />} />
              <MetricItem label="RAM Usage" description="Real system memory % from OS" enabled={metrics.ram} onToggle={() => toggleMetric('ram')} icon={<MemoryStick size={12} />} />
              <MetricItem label="System Time" description="Current local time" enabled={metrics.time} onToggle={() => toggleMetric('time')} icon={<Clock size={12} />} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ─── Crosshair Dropdown ───────────────────────────────────────────────────────
const CrosshairSection = memo(function CrosshairSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const [open, setOpen] = useState(false)

  const cfg: CrosshairConfig = {
    ...DEFAULT_CROSSHAIR,
    ...settings.crosshairConfig,
  }

  const updateCfg = useCallback((updates: Partial<CrosshairConfig>) => {
    save('crosshairConfig', { ...cfg, ...updates } as any)
  }, [cfg, save])

  const applyPreset = useCallback((presetKey: string) => {
    const preset = CROSSHAIR_PRESETS[presetKey]
    save('crosshairConfig', { ...DEFAULT_CROSSHAIR, ...preset, preset: presetKey, color: cfg.color } as any)
  }, [cfg.color, save])

  const Slider = ({ label, value, min, max, step = 1, onChange }: {
    label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
  }) => (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="text-[11px] text-white/50 w-20 flex-shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-white"
      />
      <span className="text-[11px] font-mono text-white w-6 text-right">{value}</span>
    </div>
  )

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 overflow-hidden ${
        open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.1] bg-[#0c0d12]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          settings.overlayCrosshair ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
        }`}>
          <CrosshairIcon size={15} />
        </div>
        <div className="flex-1 min-w-0" onClick={() => setOpen(p => !p)}>
          <div className={`text-[13px] font-semibold cursor-pointer ${settings.overlayCrosshair ? 'text-white' : 'text-white/70'}`}>
            Custom Crosshair
          </div>
          <div className="text-[11px] text-white/40">
            {settings.overlayCrosshair ? (CROSSHAIR_PRESETS[cfg.preset]?.label ?? 'Custom') : 'Disabled'}
          </div>
        </div>
        <button onClick={() => setOpen(p => !p)} className="p-1 hover:bg-white/[0.06] rounded-lg transition-colors mr-1">
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown size={14} className="text-white/50" />
          </motion.div>
        </button>
        <Toggle checked={settings.overlayCrosshair || false} onChange={() => save('overlayCrosshair', !settings.overlayCrosshair)} />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="h-px bg-white/[0.06] mx-4" />

            {/* Live preview + color picker */}
            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.05]">
              <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                <CrosshairSVG cfg={cfg} size={64} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-white/50 mb-1.5">Color</div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cfg.color}
                    onChange={e => updateCfg({ color: e.target.value })}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                    style={{ padding: 0 }}
                  />
                  <input
                    type="text"
                    value={cfg.color}
                    onChange={e => updateCfg({ color: e.target.value })}
                    className="bg-hub-elevated/60 border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] font-mono text-white w-20"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer" onClick={() => updateCfg({ outline: !cfg.outline })}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${cfg.outline ? 'bg-white border-white text-black' : 'bg-white/[0.04] border-white/20'}`}>
                    {cfg.outline && <Check size={10} strokeWidth={3} className="text-black" />}
                  </div>
                  <span className="text-[10px] text-white/60">Outline</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" onClick={() => updateCfg({ dot: !cfg.dot })}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${cfg.dot ? 'bg-white border-white text-black' : 'bg-white/[0.04] border-white/20'}`}>
                    {cfg.dot && <Check size={10} strokeWidth={3} className="text-black" />}
                  </div>
                  <span className="text-[10px] text-white/60">Center Dot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" onClick={() => updateCfg({ tStyle: !cfg.tStyle })}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${cfg.tStyle ? 'bg-white border-white text-black' : 'bg-white/[0.04] border-white/20'}`}>
                    {cfg.tStyle && <Check size={10} strokeWidth={3} className="text-black" />}
                  </div>
                  <span className="text-[10px] text-white/60">T-Style</span>
                </label>
              </div>
            </div>

            {/* Preset gallery */}
            <div className="px-4 py-3 border-b border-white/[0.05]">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Presets</div>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(CROSSHAIR_PRESETS).map(([key, preset]) => {
                  const presetCfg = { ...DEFAULT_CROSSHAIR, ...preset, color: cfg.color }
                  return (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                        cfg.preset === key
                          ? 'border-white/40 bg-white/10 text-white'
                          : 'border-white/[0.05] hover:border-white/20 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="w-10 h-10 bg-black/40 rounded-lg flex items-center justify-center">
                        <CrosshairSVG cfg={presetCfg as CrosshairConfig} size={40} />
                      </div>
                      <span className="text-[9px] font-medium text-white/60 leading-tight text-center">
                        {preset.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Style selector */}
            <div className="px-4 py-2 border-b border-white/[0.05]">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Style</div>
              <div className="flex gap-2">
                {(['cross', 'x', 'circle'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => updateCfg({ style: s, preset: 'custom' })}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                      cfg.style === s ? 'bg-white text-black border-white shadow-sm' : 'border-white/[0.08] text-white/60 hover:border-white/20'
                    }`}
                  >
                    {s === 'cross' ? '＋ Cross' : s === 'x' ? '✕ X' : '○ Circle'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="py-1">
              {cfg.style !== 'circle' && (
                <Slider label="Length" value={cfg.size} min={0} max={20} onChange={v => updateCfg({ size: v, preset: 'custom' })} />
              )}
              {cfg.style === 'circle' && (
                <Slider label="Radius" value={cfg.size} min={4} max={30} onChange={v => updateCfg({ size: v, preset: 'custom' })} />
              )}
              <Slider label="Width" value={cfg.thickness} min={1} max={5} onChange={v => updateCfg({ thickness: v, preset: 'custom' })} />
              {cfg.style !== 'circle' && (
                <Slider label="Gap" value={cfg.gap} min={0} max={12} onChange={v => updateCfg({ gap: v, preset: 'custom' })} />
              )}
              <Slider label="Opacity" value={Math.round(cfg.opacity * 100)} min={20} max={100} onChange={v => updateCfg({ opacity: v / 100, preset: 'custom' })} />
              {cfg.dot && (
                <Slider label="Dot Size" value={cfg.dotSize} min={1} max={5} onChange={v => updateCfg({ dotSize: v })} />
              )}
              <div className="h-px bg-white/[0.05] my-1 mx-4" />
              <Slider label="Offset X" value={cfg.offsetX || 0} min={-50} max={50} onChange={v => updateCfg({ offsetX: v })} />
              <Slider label="Offset Y" value={cfg.offsetY || 0} min={-50} max={50} onChange={v => updateCfg({ offsetY: v })} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ─── CPS Counter Section (General Overlays) ──────────────────────────────────
const CPSSection = memo(function CPSSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const isEnabled = settings.overlayCps ?? settings.overlayRobloxCps ?? false

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className="rounded-xl border border-white/[0.06] hover:border-white/[0.1] bg-[#0c0d12] transition-colors duration-150 overflow-hidden"
    >
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => {
          const next = !isEnabled
          save('overlayCps', next)
          save('overlayRobloxCps', next)
        }}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          isEnabled ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
        }`}>
          <MousePointerClick size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
            Clicks Per Second (CPS)
          </div>
          <div className="text-[11px] text-white/40">
            {isEnabled ? 'LMB & RMB live click tracker with click animation' : 'Disabled'}
          </div>
        </div>
        <Toggle checked={isEnabled} onChange={() => {}} />
      </div>
    </div>
  )
})

// ─── Roblox Accordion ─────────────────────────────────────────────────────────
const RobloxLogo = memo(() => (
  <img src={robloxLogoImg} className="w-5 h-5 object-contain" alt="Roblox" />
))

const RobloxAccordion = memo(function RobloxAccordion({ 
  robloxTimer, 
  onToggleTimer,
}: { 
  robloxTimer: boolean; 
  onToggleTimer: () => void;
}) {
  const [open, setOpen] = useState(false)
  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0 border border-white/10">
          <RobloxLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Roblox</div>
          <div className="text-[11px] text-white/50">{robloxTimer ? 'Game-Session & AFK Timer active' : 'No overlays active'}</div>
        </div>
        {robloxTimer && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-white/50" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="divide-y divide-white/[0.04]">
              {/* Overlay 1: Session & AFK Timer */}
              <div onClick={onToggleTimer} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${robloxTimer ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                  <Timer size={13} />
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-medium ${robloxTimer ? 'text-white' : 'text-white/60'}`}>Game-Session & AFK Timer</div>
                  <div className="text-[10px] text-white/40">Session time + AFK kick countdown. Glows red under 2 min.</div>
                </div>
                <Toggle checked={robloxTimer} onChange={() => {}} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ─── Rocket League Accordion ──────────────────────────────────────────────────
const RLLogo = memo(() => (
  <img src={rlLogoImg} className="w-5 h-5 object-contain" alt="Rocket League" />
))

const RocketLeagueAccordion = memo(function RocketLeagueAccordion({ 
  rlHud, onToggle, 
  playlist, onPlaylistChange, 
  trnApiKey, onApiKeyChange,
  steamProfileUrl, onSteamUrlChange,
  overlayRLSteam, onSteamToggle,
  rlScoreboardKeyKb, onKeyKbChange,
  rlScoreboardKeyCtrl, onKeyCtrlChange,
  rlSteamAvatarScale, onScaleChange,
  overlayRLController, onControllerToggle,
  rlControllerUrl, onControllerUrlChange,
  rlControllerScale, onControllerScaleChange,
}: {
  rlHud: boolean
  onToggle: () => void
  playlist: '1v1' | '2v2' | '3v3'
  onPlaylistChange: (p: '1v1' | '2v2' | '3v3') => void
  trnApiKey: string
  onApiKeyChange: (key: string) => void
  steamProfileUrl: string
  onSteamUrlChange: (url: string) => void
  overlayRLSteam: boolean
  onSteamToggle: () => void
  rlScoreboardKeyKb: string
  onKeyKbChange: (key: string) => void
  rlScoreboardKeyCtrl: string
  onKeyCtrlChange: (key: string) => void
  rlSteamAvatarScale: number
  onScaleChange: (scale: number) => void
  overlayRLController: boolean
  onControllerToggle: () => void
  rlControllerUrl: string
  onControllerUrlChange: (url: string) => void
  rlControllerScale: number
  onControllerScaleChange: (scale: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const playlists: Array<'1v1' | '2v2' | '3v3'> = ['1v1', '2v2', '3v3']
  const hasKey = trnApiKey && trnApiKey.length > 10

  const [listenKb, setListenKb] = useState(false)
  const [listenCtrl, setListenCtrl] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const activeSubCount = (rlHud ? 1 : 0) + (overlayRLSteam ? 1 : 0) + (overlayRLController ? 1 : 0)

  useEffect(() => {
    if (steamProfileUrl) {
      (window.electronAPI as any)?.invoke?.('rl:fetch-steam-avatar', steamProfileUrl).then((url: string | null) => {
        setAvatarPreview(url)
      })
    } else {
      setAvatarPreview(null)
    }
  }, [steamProfileUrl])

  useEffect(() => {
    if (!listenKb) return
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      onKeyKbChange(e.key.length === 1 ? e.key.toUpperCase() : e.key)
      setListenKb(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [listenKb, onKeyKbChange])

  useEffect(() => {
    if (!listenCtrl) return
    let reqId: number
    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      for (const gp of gamepads) {
        if (!gp) continue
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            let name = `Button ${i}`
            if (i === 8) name = 'Select'
            if (i === 9) name = 'Start'
            if (i === 0) name = 'A'
            if (i === 1) name = 'B'
            if (i === 2) name = 'X'
            if (i === 3) name = 'Y'
            
            onKeyCtrlChange(name)
            setListenCtrl(false)
            return
          }
        }
      }
      reqId = requestAnimationFrame(poll)
    }
    reqId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(reqId)
  }, [listenCtrl, onKeyCtrlChange])

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10 bg-black">
          <RLLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Rocket League</div>
          <div className="text-[11px] text-white/50">
            {rlHud && overlayRLSteam
              ? `MMR Tracker · Steam Avatar · ${playlist}`
              : rlHud
                ? `MMR Tracker · ${playlist} · ${hasKey ? '🔑 API Key' : '🌐 Browser'}`
                : overlayRLSteam
                  ? 'Steam Avatar In-Game'
                  : 'No overlays active'}
          </div>
        </div>
        {(rlHud || overlayRLSteam) && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-white/50" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="h-px bg-white/[0.06] mx-4" />

            {/* MMR Tracker Toggle */}
            <div onClick={onToggle} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${rlHud ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                <Activity size={13} />
              </div>
              <div className="flex-1">
                <div className={`text-[12px] font-medium ${rlHud ? 'text-white' : 'text-white/60'}`}>MMR & Rank Tracker</div>
                <div className="text-[10px] text-white/40">Live MMR, rank badge, division & session W/L. Steam & Epic.</div>
              </div>
              <Toggle checked={rlHud} onChange={() => {}} />
            </div>

            {/* Playlist Selector */}
            <div className="px-4 pb-2 pt-1">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Ranked Playlist</div>
              <div className="flex gap-2">
                {playlists.map(p => (
                  <button
                    key={p}
                    onClick={() => onPlaylistChange(p)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                      playlist === p
                        ? 'bg-white text-black border-white shadow-sm'
                        : 'bg-white/[0.04] text-white/60 border-white/[0.06] hover:border-white/[0.12] hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* TRN API Key */}
            <div className="px-4 pb-4 pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  TRN API Key <span className={`ml-1 ${hasKey ? 'text-white' : 'text-white/40'}`}>{hasKey ? '✓ Active' : '○ Optional'}</span>
                </div>
                <button
                  onClick={() => (window.electronAPI as any)?.openUrl?.('https://tracker.gg/developers')}
                  className="text-[9px] text-white/60 hover:text-white transition-colors"
                >
                  Get free key ↗
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={trnApiKey}
                  onChange={e => onApiKeyChange(e.target.value)}
                  placeholder="Paste your free TRN API Key here..."
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 pr-14"
                />
                <button
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-2 text-[9px] text-white/50 hover:text-white transition-colors"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="text-[9px] text-white/40 mt-1.5">
                {hasKey
                  ? '🔑 Using official API — fastest & most reliable'
                  : '🌐 No key: using browser session (first load may take ~10s)'}
              </div>
            </div>
            {/* Steam Avatar Integration */}
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold text-white flex items-center gap-2">
                  <img src={steamLogoImg} className="w-4 h-4 object-contain opacity-80" alt="Steam" />
                  Steam Profile In-Game
                </div>
                <Toggle checked={overlayRLSteam} onChange={onSteamToggle} />
              </div>
              <div className="text-[10px] text-white/50 mb-3 leading-relaxed">
                Link your Steam Profile to show your avatar in-game when you press the Scoreboard key.
              </div>
              
              <div className="space-y-3">
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      Steam Profile URL or ID
                      {avatarPreview && <span className="text-white font-bold">✓</span>}
                    </div>
                    <input
                      type="text"
                      value={steamProfileUrl}
                      onChange={e => onSteamUrlChange(e.target.value)}
                      placeholder="e.g. https://steamcommunity.com/id/myprofile"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  {avatarPreview ? (
                    <img src={avatarPreview} className="w-10 h-10 rounded-lg object-cover border border-white/[0.08] shadow-sm flex-shrink-0" alt="Avatar" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-center text-[10px] text-white/30 font-bold flex-shrink-0">?</div>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">Scoreboard Key (KB)</div>
                    <button
                      onClick={() => setListenKb(true)}
                      className={`w-full text-left border rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${listenKb ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                    >
                      {listenKb ? 'Press any key...' : rlScoreboardKeyKb}
                    </button>
                  </div>
                  <div className="flex-1">
                    <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">Scoreboard Key (Ctrl)</div>
                    <button
                      onClick={() => setListenCtrl(true)}
                      className={`w-full text-left border rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${listenCtrl ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                    >
                      {listenCtrl ? 'Press any button...' : rlScoreboardKeyCtrl}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">UI Scale</div>
                    <div className="text-[10px] text-white font-mono">{rlSteamAvatarScale}%</div>
                  </div>
                  <input
                    type="range"
                    min="50" max="100"
                    value={rlSteamAvatarScale}
                    onChange={e => onScaleChange(Number(e.target.value))}
                    className="w-full accent-white h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer"
                  />
                  <div className="text-[9px] text-white/40 mt-1">Match this to your Rocket League Interface Scale.</div>
                </div>
              </div>
            </div>

            {/* Controller Overlay (GamepadViewer) */}
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold text-white flex items-center gap-2">
                  <Gamepad2 size={14} className="text-white" />
                  Live Controller HUD (GamepadViewer)
                </div>
                <Toggle checked={overlayRLController} onChange={onControllerToggle} />
              </div>
              <div className="text-[10px] text-white/50 mb-3 leading-relaxed">
                Live controller visualization (sticks, triggers, buttons) in-game via GamepadViewer.
              </div>

              <div className="space-y-3">
                {/* Preset Skins */}
                <div>
                  <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Controller Design</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { label: 'PS4 White / Red', url: 'https://gamepadviewer.com/?p=1&s=8' },
                      { label: 'PS5 DualSense', url: 'https://gamepadviewer.com/?p=1&editcss=https://justehcupcake.github.io/FPS5_Display_Pics/PS5_White.css' },
                      { label: 'PS4 Classic Black', url: 'https://gamepadviewer.com/?p=1&s=5' },
                      { label: 'Xbox One', url: 'https://gamepadviewer.com/?p=1&s=1' },
                    ].map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => onControllerUrlChange(p.url)}
                        className={`px-2.5 py-2 rounded-lg text-[10px] font-medium border transition-colors ${
                          (rlControllerUrl || 'https://gamepadviewer.com/?p=1&s=8') === p.url
                            ? 'bg-white text-black border-white font-semibold shadow-sm'
                            : 'bg-white/[0.04] border-white/[0.08] text-white/70 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] text-white/40 mt-2">
                    💡 Drücke im Spiel einmal eine beliebige Taste auf deinem Controller, um das Overlay zu aktivieren.
                  </div>
                </div>

                {/* Controller Scale */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">Scale</div>
                    <div className="text-[10px] text-white font-mono">{rlControllerScale}%</div>
                  </div>
                  <input
                    type="range"
                    min="50" max="150" step="5"
                    value={rlControllerScale}
                    onChange={e => onControllerScaleChange(Number(e.target.value))}
                    className="w-full accent-white h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})


// ─── Main Component ───────────────────────────────────────────────────────────
export const GameplayOverlayTab = memo(function GameplayOverlayTab({ settings, updateSettings }: {
  settings: Partial<AppSettings>
  updateSettings: (data: Partial<AppSettings>) => void
}) {
  const save = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateSettings({ [key]: value })
    window.electronAPI?.setSettings({ [key]: value } as any)
  }, [updateSettings])

  const activeCount = [
    settings.overlayPerformance, 
    settings.overlayCrosshair, 
    settings.overlayCps ?? settings.overlayRobloxCps,
    settings.overlayRobloxTimer, 
    settings.overlayRLHud,
    settings.overlayRLSteam,
    settings.overlayRLController,
  ].filter(Boolean).length

  return (
    <div 
      style={{ contain: 'paint layout', transform: 'translateZ(0)', willChange: 'transform' }}
      className="space-y-6 pb-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-white/[0.07]">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Gameplay Overlay</h2>
          <p className="text-[12px] text-white/50 mt-0.5">Real-time HUD displayed over your games & desktop</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeCount > 0 ? 'bg-white shadow-[0_0_5px_#ffffff]' : 'bg-white/20'}`} />
          <span className="text-[11px] font-medium text-white/60">{activeCount} active</span>
        </div>
      </div>

      {/* SECTION 1: General */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-white border border-white/10">
              <Globe size={14} className="text-white" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white tracking-tight">General Overlays</div>
              <div className="text-[11px] text-white/50 mt-0.5">Performance, Crosshair & CPS display rules</div>
            </div>
          </div>

          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => save('overlayGeneralAlwaysOn', false)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                !settings.overlayGeneralAlwaysOn
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Only in Game
            </button>
            <button
              type="button"
              onClick={() => save('overlayGeneralAlwaysOn', true)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                settings.overlayGeneralAlwaysOn
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Always
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <PerformanceSection settings={settings} save={save} />
          <CrosshairSection settings={settings} save={save} />
          <CPSSection settings={settings} save={save} />
        </div>
      </section>

      {/* SECTION 2: Game-specific */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <SectionLabel icon={<Gamepad2 size={14} className="text-white" />} title="Game-Specific Overlays" subtitle="Configurable per game" />
        <div className="space-y-2">
          <RobloxAccordion
            robloxTimer={settings.overlayRobloxTimer || false}
            onToggleTimer={() => save('overlayRobloxTimer', !settings.overlayRobloxTimer)}
          />
          <RocketLeagueAccordion
            rlHud={settings.overlayRLHud || false}
            onToggle={() => save('overlayRLHud', !settings.overlayRLHud)}
            playlist={(settings.rlPlaylist as '1v1' | '2v2' | '3v3') || '2v2'}
            onPlaylistChange={(p) => {
              save('rlPlaylist', p)
              ;(window.electronAPI as any)?.setRLPlaylist?.(p)
            }}
            trnApiKey={settings.trnApiKey || ''}
            onApiKeyChange={(key) => {
              save('trnApiKey', key)
              ;(window.electronAPI as any)?.setRLApiKey?.(key)
            }}
            steamProfileUrl={settings.steamProfileUrl || ''}
            onSteamUrlChange={(url) => save('steamProfileUrl', url)}
            overlayRLSteam={settings.overlayRLSteam || false}
            onSteamToggle={() => save('overlayRLSteam', !settings.overlayRLSteam)}
            rlScoreboardKeyKb={settings.rlScoreboardKeyKb || 'Tab'}
            onKeyKbChange={(k) => save('rlScoreboardKeyKb', k)}
            rlScoreboardKeyCtrl={settings.rlScoreboardKeyCtrl || 'Select'}
            onKeyCtrlChange={(k) => save('rlScoreboardKeyCtrl', k)}
            rlSteamAvatarScale={settings.rlSteamAvatarScale || 85}
            onScaleChange={(s) => save('rlSteamAvatarScale', s)}
            overlayRLController={settings.overlayRLController || false}
            onControllerToggle={() => save('overlayRLController', !settings.overlayRLController)}
            rlControllerUrl={settings.rlControllerUrl || 'https://gamepadviewer.com/?p=1&s=3'}
            onControllerUrlChange={(url) => save('rlControllerUrl', url)}
            rlControllerScale={settings.rlControllerScale || 80}
            onControllerScaleChange={(s) => save('rlControllerScale', s)}
          />
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/[0.06]">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/40 text-sm font-semibold">+</div>
            <span className="text-[11px] text-white/40">More games coming in future updates...</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: Edit Layout button (Ultra-Clean Monochrome) */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <SectionLabel icon={<Move size={14} className="text-white" />} title="Overlay Layout" subtitle="Reposition widgets directly on screen (Discord-style)" />
        <div className="rounded-xl border border-white/10 bg-[#0f1015] p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <div className="text-sm font-semibold text-white">Edit Overlay Positions</div>
            <div className="text-xs text-white/50 leading-relaxed">
              Opens the overlay window. Drag each widget to your desired screen position, then click "Save & Done".
            </div>
          </div>
          <button
            onClick={() => window.electronAPI?.startOverlayEdit()}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg font-semibold text-xs transition-all shadow-sm hover:scale-[1.01] flex-shrink-0 cursor-pointer"
          >
            <Edit3 size={13} className="text-black" />
            Edit Layout
          </button>
        </div>
      </section>
    </div>
  )
})
