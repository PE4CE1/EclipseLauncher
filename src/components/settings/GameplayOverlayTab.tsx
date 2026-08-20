import React, { useState, useEffect, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Gamepad2, Move, Check, Activity, Crosshair as CrosshairIcon, Timer,
  ChevronDown, Cpu, MemoryStick, Clock, Layers, Edit3, MousePointerClick, Gauge,
  Plus, Minus
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
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }} 
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
      <Toggle checked={enabled} onChange={onToggle} />
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
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            settings.overlayPerformance ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <Activity size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${settings.overlayPerformance ? 'text-white' : 'text-white/70'}`}>
              Performance Overlay
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {settings.overlayPerformance ? `${activeCount} Metriken aktiviert · FPS, CPU, RAM, GPU` : 'Deaktiviert'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle 
            checked={settings.overlayPerformance ?? false} 
            onChange={() => save('overlayPerformance', !settings.overlayPerformance)} 
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="h-px bg-white/[0.06] mx-4" />

            {/* Layout & Scale Control Row */}
            <div className="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between gap-3 flex-nowrap">
              {/* Left: Compact Layout Segmented Control */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  Layout
                </span>
                <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, layout: 'vertical' })}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                      (metrics.layout ?? 'vertical') === 'vertical'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Layers size={12} />
                    Vertikal
                  </button>
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, layout: 'horizontal' })}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                      metrics.layout === 'horizontal'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Move size={12} />
                    Horizontal
                  </button>
                </div>
              </div>

              {/* Right: Clean Size / Scale Stepper with Minus & Plus */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  Größe
                </span>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof metrics.scale === 'number' ? (metrics.scale <= 3 ? Math.round(metrics.scale * 100) : metrics.scale) : 100
                      const next = Math.max(50, cur - 5)
                      save('overlayMetrics', { ...metrics, scale: next })
                    }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    title="Verkleinern (-5%)"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-10 text-center text-[11px] font-semibold font-mono text-white select-none">
                    {(typeof metrics.scale === 'number' ? (metrics.scale <= 3 ? Math.round(metrics.scale * 100) : metrics.scale) : 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof metrics.scale === 'number' ? (metrics.scale <= 3 ? Math.round(metrics.scale * 100) : metrics.scale) : 100
                      const next = Math.min(200, cur + 5)
                      save('overlayMetrics', { ...metrics, scale: next })
                    }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    title="Vergrößern (+5%)"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="divide-y divide-white/[0.04]">
              <MetricItem 
                label="Bildwiederholrate (FPS)" 
                description="Live Game Frame-Rate Tracker" 
                enabled={metrics.fps ?? true} 
                onToggle={() => toggleMetric('fps')} 
                icon={<Gauge size={13} />} 
              />
              <MetricItem 
                label="CPU-Auslastung" 
                description="Prozessorlast in %" 
                enabled={metrics.cpu ?? true} 
                onToggle={() => toggleMetric('cpu')} 
                icon={<Cpu size={13} />} 
              />
              <MetricItem 
                label="GPU-Auslastung" 
                description="Grafikkartenlast in %" 
                enabled={metrics.gpu ?? true} 
                onToggle={() => toggleMetric('gpu')} 
                icon={<Activity size={13} />} 
              />
              <MetricItem 
                label="RAM-Auslastung" 
                description="Arbeitsspeicher-Verbrauch & %" 
                enabled={metrics.ram ?? true} 
                onToggle={() => toggleMetric('ram')} 
                icon={<MemoryStick size={13} />} 
              />
              <MetricItem 
                label="Uhrzeit" 
                description="Aktuelle Systemzeit" 
                enabled={metrics.time ?? true} 
                onToggle={() => toggleMetric('time')} 
                icon={<Clock size={13} />} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ─── Crosshair Section (General Overlays) ─────────────────────────────────────
const CrosshairSection = memo(function CrosshairSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const [open, setOpen] = useState(false)
  const cfg = settings.crosshairConfig ?? DEFAULT_CROSSHAIR

  const updateCfg = useCallback((patch: Partial<CrosshairConfig>) => {
    save('crosshairConfig', { ...cfg, ...patch })
  }, [cfg, save])

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            settings.overlayCrosshair ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <CrosshairIcon size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${settings.overlayCrosshair ? 'text-white' : 'text-white/70'}`}>
              Fadenkreuz (Crosshair)
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {settings.overlayCrosshair ? `${cfg.preset || cfg.style || 'Kreuz'} · ${cfg.color} · ${cfg.size}px` : 'Deaktiviert'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle 
            checked={settings.overlayCrosshair ?? false} 
            onChange={() => save('overlayCrosshair', !settings.overlayCrosshair)} 
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-4">
              {/* Presets */}
              <div>
                <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Fadenkreuz-Vorlagen</div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {Object.entries(CROSSHAIR_PRESETS).map(([key, preset]) => {
                    const isSelected = cfg.preset === key
                    const presetCfg: CrosshairConfig = { ...DEFAULT_CROSSHAIR, ...preset, preset: key }
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => updateCfg({ ...preset, preset: key })}
                        className={`h-12 rounded-lg border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-white bg-white/10 shadow-sm'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15]'
                        }`}
                      >
                        <CrosshairSVG cfg={presetCfg} size={40} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color & Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Farbe</div>
                  <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5">
                    <input
                      type="color"
                      value={cfg.color}
                      onChange={(e) => updateCfg({ color: e.target.value })}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-[11px] font-mono text-white/80">{cfg.color}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                    <span>Größe</span>
                    <span className="text-white font-mono">{cfg.size}px</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="40"
                    value={cfg.size}
                    onChange={(e) => updateCfg({ size: Number(e.target.value) })}
                    className="w-full accent-white h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer mt-2"
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

// ─── CPS Counter Section (General Overlays) ──────────────────────────────────
const CPSSection = memo(function CPSSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const [open, setOpen] = useState(false)
  const isEnabled = settings.overlayCps ?? false

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            isEnabled ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <MousePointerClick size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
              Klicks pro Sekunde (CPS)
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {isEnabled ? 'LMB- & RMB-Klick-Tracker mit Live-Animation' : 'Deaktiviert'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle 
            checked={isEnabled} 
            onChange={() => save('overlayCps', !isEnabled)} 
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-2">
              <div className="text-[12px] font-medium text-white">Live-Mausklick-Zähler</div>
              <div className="text-[11px] text-white/50 leading-relaxed">
                Zeigt die Klicks pro Sekunde (LMB & RMB) mit reaktionsschneller Klickanimation live auf dem Bildschirm an. Funktioniert auf dem Desktop und in allen Spielen.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

export type ControllerSkinId = 'ps5_white' | 'ps5_black' | 'ps4_white' | 'ps4_black' | 'xbox_one'

export const CONTROLLER_SKINS: Record<ControllerSkinId, { label: string; url: string }> = {
  ps5_white: {
    label: 'PS5 DualSense (Weiß)',
    url: 'https://gamepadviewer.com/?p=1&s=ps5_white',
  },
  ps5_black: {
    label: 'PS5 Midnight Schwarz',
    url: 'https://gamepadviewer.com/?p=1&s=ps5_black',
  },
  ps4_white: {
    label: 'PS4 Weiß / Rot',
    url: 'https://gamepadviewer.com/?p=1&s=8',
  },
  ps4_black: {
    label: 'PS4 Klassisch Schwarz',
    url: 'https://gamepadviewer.com/?p=1&s=5',
  },
  xbox_one: {
    label: 'Xbox One',
    url: 'https://gamepadviewer.com/?p=1&s=1',
  },
}

// ─── Controller HUD Dropdown (General Overlays) ────────────────────────────────
const GeneralControllerSection = memo(function GeneralControllerSection({ settings, save }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const [open, setOpen] = useState(false)
  const isEnabled = settings.overlayController ?? false
  const activeSkin: ControllerSkinId = (settings.rlControllerSkin as ControllerSkinId) || 'ps5_white'
  const scale = settings.rlControllerScale || 80

  return (
    <div 
      style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}
      className={`rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-[#0f1015]' : 'border-white/[0.06] hover:border-white/[0.09] bg-[#0c0d12]'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            isEnabled ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <Gamepad2 size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
              Controller Overlay (Live-HUD)
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {isEnabled ? `${CONTROLLER_SKINS[activeSkin]?.label || activeSkin} · Skalierung ${scale}%` : 'Deaktiviert'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle 
            checked={isEnabled} 
            onChange={() => save('overlayController', !isEnabled)} 
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-3">
              {/* Preset Skins */}
              <div>
                <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Controller-Design</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                  {(Object.keys(CONTROLLER_SKINS) as ControllerSkinId[]).map((key) => {
                    const skin = CONTROLLER_SKINS[key]
                    const isSelected = activeSkin === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          save('rlControllerSkin', key)
                          save('rlControllerUrl', skin.url)
                        }}
                        className={`px-2.5 py-2 rounded-lg text-[10px] font-medium border transition-colors ${
                          isSelected
                            ? 'bg-white text-black border-white font-semibold shadow-sm'
                            : 'bg-white/[0.04] border-white/[0.08] text-white/70 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {skin.label}
                      </button>
                    )
                  })}
                </div>
                <div className="text-[9px] text-white/40 mt-2">
                  💡 Drücke im Spiel oder auf dem Desktop einmal eine beliebige Taste auf deinem Controller, um das Overlay zu aktivieren.
                </div>
              </div>

              {/* Controller Scale */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">Skalierung</div>
                  <div className="text-[10px] text-white font-mono">{scale}%</div>
                </div>
                <input
                  type="range"
                  min="50" max="150" step="5"
                  value={scale}
                  onChange={e => save('rlControllerScale', Number(e.target.value))}
                  className="w-full accent-white h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  robloxCps,
  onToggleCps,
}: { 
  robloxTimer: boolean; 
  onToggleTimer: () => void;
  robloxCps: boolean;
  onToggleCps: () => void;
}) {
  const [open, setOpen] = useState(false)
  const activeCount = (robloxTimer ? 1 : 0) + (robloxCps ? 1 : 0)

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
          <div className="text-[11px] text-white/50">
            {activeCount === 2 
              ? 'Timer & CPS-Zähler aktiv'
              : robloxTimer 
                ? 'Spiel-Session & AFK-Timer aktiv'
                : robloxCps 
                  ? 'CPS-Zähler aktiv'
                  : 'Keine Overlays aktiv'}
          </div>
        </div>
        {activeCount > 0 && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
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
                  <div className={`text-[12px] font-medium ${robloxTimer ? 'text-white' : 'text-white/60'}`}>Spiel-Session & AFK-Timer</div>
                  <div className="text-[10px] text-white/40">Session-Zeit & AFK-Kick-Countdown. Leuchtet unter 2 Min. rot.</div>
                </div>
                <Toggle checked={robloxTimer} onChange={onToggleTimer} />
              </div>

              {/* Overlay 2: Roblox CPS Counter */}
              <div onClick={onToggleCps} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${robloxCps ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                  <MousePointerClick size={13} />
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-medium ${robloxCps ? 'text-white' : 'text-white/60'}`}>Klicks pro Sekunde (CPS)</div>
                  <div className="text-[10px] text-white/40">Live-Klick-Tracker für LMB & RMB speziell in Roblox.</div>
                </div>
                <Toggle checked={robloxCps} onChange={onToggleCps} />
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
  rlControllerSkin, onControllerSkinChange,
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
  rlControllerSkin?: ControllerSkinId
  onControllerSkinChange: (skin: ControllerSkinId) => void
  rlControllerUrl: string
  onControllerUrlChange: (url: string) => void
  rlControllerScale: number
  onControllerScaleChange: (scale: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [openSub, setOpenSub] = useState<'mmr' | 'controller' | 'steam' | null>('mmr')
  const [showKey, setShowKey] = useState(false)
  const playlists: Array<'1v1' | '2v2' | '3v3'> = ['1v1', '2v2', '3v3']
  const hasKey = trnApiKey && trnApiKey.length > 10

  const [listenKb, setListenKb] = useState(false)
  const [listenCtrl, setListenCtrl] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const activeSubCount = (rlHud ? 1 : 0) + (overlayRLController ? 1 : 0) + (overlayRLSteam ? 1 : 0)

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
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10 bg-black">
          <RLLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Rocket League</div>
          <div className="text-[11px] text-white/50">
            {activeSubCount > 0 
              ? `${activeSubCount} Overlay${activeSubCount > 1 ? 's' : ''} aktiv · MMR, Controller & Steam`
              : 'Keine Overlays aktiv'}
          </div>
        </div>
        {activeSubCount > 0 && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-white/50" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-3 space-y-2.5">
              
              {/* ─── OPTION 1: MMR & Rank Tracker Dropdown ─── */}
              <div className="rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
                <div 
                  className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenSub(s => s === 'mmr' ? null : 'mmr')}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${rlHud ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                      <Activity size={13} />
                    </div>
                    <div>
                      <div className={`text-[12px] font-semibold ${rlHud ? 'text-white' : 'text-white/70'}`}>MMR & Rang-Tracker</div>
                      <div className="text-[10px] text-white/40">{playlist} · {hasKey ? '🔑 API-Schlüssel' : '🌐 Browser'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={rlHud} onChange={onToggle} />
                    <motion.div animate={{ rotate: openSub === 'mmr' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <AnimatePresence>
                  {openSub === 'mmr' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3 space-y-3">
                        {/* Playlist Selector */}
                        <div>
                          <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Gewertete Playlist</div>
                          <div className="flex gap-2">
                            {playlists.map(p => (
                              <button
                                key={p}
                                onClick={() => onPlaylistChange(p)}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
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
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">
                              TRN API-Schlüssel <span className={`ml-1 ${hasKey ? 'text-white font-bold' : 'text-white/40'}`}>{hasKey ? '✓ Aktiv' : '○ Optional'}</span>
                            </div>
                            <button
                              onClick={() => (window.electronAPI as any)?.openUrl?.('https://tracker.gg/developers')}
                              className="text-[9px] text-white/60 hover:text-white transition-colors cursor-pointer"
                            >
                              Kostenlosen Key holen ↗
                            </button>
                          </div>
                          <div className="relative flex items-center">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={trnApiKey}
                              onChange={e => onApiKeyChange(e.target.value)}
                              placeholder="Kostenlosen TRN API-Key hier einfügen..."
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 pr-14"
                            />
                            <button
                              onClick={() => setShowKey(s => !s)}
                              className="absolute right-2 text-[9px] text-white/50 hover:text-white transition-colors cursor-pointer"
                            >
                              {showKey ? 'Verstecken' : 'Anzeigen'}
                            </button>
                          </div>
                          <div className="text-[9px] text-white/40 mt-1">
                            {hasKey ? '🔑 Offizielle API aktiv — schnell & zuverlässig' : '🌐 Kein Key: nutzt Browser-Sitzung'}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ─── OPTION 2: Live Controller HUD Dropdown (In the Middle!) ─── */}
              <div className="rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
                <div 
                  className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenSub(s => s === 'controller' ? null : 'controller')}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${overlayRLController ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                      <Gamepad2 size={13} />
                    </div>
                    <div>
                      <div className={`text-[12px] font-semibold ${overlayRLController ? 'text-white' : 'text-white/70'}`}>Controller Overlay (Live-HUD)</div>
                      <div className="text-[10px] text-white/40">{CONTROLLER_SKINS[(rlControllerSkin as ControllerSkinId) || 'ps5_white']?.label || 'Controller HUD'} · Skalierung {rlControllerScale}%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={overlayRLController} onChange={onControllerToggle} />
                    <motion.div animate={{ rotate: openSub === 'controller' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <AnimatePresence>
                  {openSub === 'controller' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3 space-y-3">
                        {/* Preset Skins */}
                        <div>
                          <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">Controller-Design</div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                            {(Object.keys(CONTROLLER_SKINS) as ControllerSkinId[]).map((key) => {
                              const skin = CONTROLLER_SKINS[key]
                              const selectedSkin: ControllerSkinId = (rlControllerSkin as ControllerSkinId) || 'ps5_white'
                              const isSelected = selectedSkin === key
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => {
                                    onControllerSkinChange(key)
                                    onControllerUrlChange(skin.url)
                                  }}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
                                    isSelected
                                      ? 'bg-white text-black border-white font-semibold shadow-sm'
                                      : 'bg-white/[0.04] border-white/[0.08] text-white/70 hover:text-white hover:border-white/20'
                                  }`}
                                >
                                  {skin.label}
                                </button>
                              )
                            })}
                          </div>
                          <div className="text-[9px] text-white/40 mt-1.5">
                            💡 Drücke im Spiel einmal eine beliebige Taste auf deinem Controller, um das Overlay zu aktivieren.
                          </div>
                        </div>

                        {/* Controller Scale */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">Skalierung</div>
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ─── OPTION 3: Steam Profile In-Game Dropdown ─── */}
              <div className="rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
                <div 
                  className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenSub(s => s === 'steam' ? null : 'steam')}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${overlayRLSteam ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                      <img src={steamLogoImg} className="w-3.5 h-3.5 object-contain opacity-90" alt="Steam" />
                    </div>
                    <div>
                      <div className={`text-[12px] font-semibold ${overlayRLSteam ? 'text-white' : 'text-white/70'}`}>Steam-Profil im Spiel</div>
                      <div className="text-[10px] text-white/40">{steamProfileUrl ? 'Profil verknüpft' : 'Scoreboard-Taste im Spiel halten'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={overlayRLSteam} onChange={onSteamToggle} />
                    <motion.div animate={{ rotate: openSub === 'steam' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <AnimatePresence>
                  {openSub === 'steam' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3 space-y-3">
                        <div className="flex gap-2.5 items-end">
                          <div className="flex-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                              Steam Profil-URL oder ID
                              {avatarPreview && <span className="text-white font-bold">✓</span>}
                            </div>
                            <input
                              type="text"
                              value={steamProfileUrl}
                              onChange={e => onSteamUrlChange(e.target.value)}
                              placeholder="z. B. https://steamcommunity.com/id/meinprofil"
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                            />
                          </div>
                          {avatarPreview ? (
                            <img src={avatarPreview} className="w-9 h-9 rounded-lg object-cover border border-white/[0.08] shadow-sm flex-shrink-0" alt="Avatar" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-center text-[10px] text-white/30 font-bold flex-shrink-0">?</div>
                          )}
                        </div>
                        
                        <div className="flex gap-2.5">
                          <div className="flex-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">Scoreboard-Taste (Tastatur)</div>
                            <button
                              onClick={() => setListenKb(true)}
                              className={`w-full text-left border rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${listenKb ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                            >
                              {listenKb ? 'Taste drücken...' : rlScoreboardKeyKb}
                            </button>
                          </div>
                          <div className="flex-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">Scoreboard-Taste (Controller)</div>
                            <button
                              onClick={() => setListenCtrl(true)}
                              className={`w-full text-left border rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${listenCtrl ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                            >
                              {listenCtrl ? 'Knopf drücken...' : rlScoreboardKeyCtrl}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">UI-Skalierung</div>
                            <div className="text-[10px] text-white font-mono">{rlSteamAvatarScale}%</div>
                          </div>
                          <input
                            type="range"
                            min="50" max="100"
                            value={rlSteamAvatarScale}
                            onChange={e => onScaleChange(Number(e.target.value))}
                            className="w-full accent-white h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
    settings.overlayCps,
    settings.overlayController,
    settings.overlayRobloxTimer,
    settings.overlayRobloxCps,
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
          <p className="text-[12px] text-white/50 mt-0.5">Echtzeit-HUD über deinen Spielen & auf dem Desktop</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeCount > 0 ? 'bg-white shadow-[0_0_5px_#ffffff]' : 'bg-white/20'}`} />
          <span className="text-[11px] font-medium text-white/60">{activeCount} aktiv</span>
        </div>
      </div>

      {/* SECTION 1: General Overlays */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-white border border-white/10">
              <Globe size={14} className="text-white" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white tracking-tight">Allgemeine Overlays</div>
              <div className="text-[11px] text-white/50 mt-0.5">Performance-, Fadenkreuz-, CPS- & Controller-Regeln</div>
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
              Nur im Spiel
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
              Immer
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <PerformanceSection settings={settings} save={save} />
          <CrosshairSection settings={settings} save={save} />
          <CPSSection settings={settings} save={save} />
          <GeneralControllerSection settings={settings} save={save} />
        </div>
      </section>

      {/* SECTION 2: Game-specific Overlays */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <SectionLabel icon={<Gamepad2 size={14} className="text-white" />} title="Spielspezifische Overlays" subtitle="Individuell pro Spiel konfigurierbar" />
        <div className="space-y-2">
          <RobloxAccordion
            robloxTimer={settings.overlayRobloxTimer || false}
            onToggleTimer={() => save('overlayRobloxTimer', !settings.overlayRobloxTimer)}
            robloxCps={settings.overlayRobloxCps || false}
            onToggleCps={() => save('overlayRobloxCps', !settings.overlayRobloxCps)}
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
            rlControllerSkin={settings.rlControllerSkin || 'ps5_white'}
            onControllerSkinChange={(skin) => save('rlControllerSkin', skin)}
            rlControllerUrl={settings.rlControllerUrl || CONTROLLER_SKINS.ps5_white.url}
            onControllerUrlChange={(url) => save('rlControllerUrl', url)}
            rlControllerScale={settings.rlControllerScale || 80}
            onControllerScaleChange={(s) => save('rlControllerScale', s)}
          />
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/[0.06]">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/40 text-sm font-semibold">+</div>
            <span className="text-[11px] text-white/40">Weitere Spiele folgen in zukünftigen Updates...</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: Edit Layout button */}
      <section style={{ contain: 'paint layout style', transform: 'translateZ(0)' }}>
        <SectionLabel icon={<Move size={14} className="text-white" />} title="Overlay-Layout" subtitle="Widgets direkt auf dem Bildschirm verschieben (Discord-Stil)" />
        <div className="rounded-xl border border-white/10 bg-[#0f1015] p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <div className="text-sm font-semibold text-white">Overlay-Positionen anpassen</div>
            <div className="text-xs text-white/50 leading-relaxed">
              Öffnet das Overlay-Fenster. Ziehe jedes Widget an die gewünschte Position und klicke auf „Speichern & Fertig“.
            </div>
          </div>
          <button
            onClick={() => window.electronAPI?.startOverlayEdit()}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg font-semibold text-xs transition-all shadow-sm hover:scale-[1.01] flex-shrink-0 cursor-pointer"
          >
            <Edit3 size={13} className="text-black" />
            Layout bearbeiten
          </button>
        </div>
      </section>
    </div>
  )
})
