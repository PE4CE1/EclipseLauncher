import { Select } from '../shared/Select'
import React, { useState, useEffect, memo, useCallback } from 'react'
import { persistAppSettings } from '../../services/settingsPersistence'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import {
  Globe, Gamepad2, Move, Check, Activity, Crosshair as CrosshairIcon, Timer,
  ChevronDown, Cpu, MemoryStick, Clock, Layers, Edit3, MousePointerClick, Gauge,
  Plus, Minus, ShieldCheck, Radio, Tv, Copy, Music, RotateCcw,
  Play, Pause, SkipForward, SkipBack, Keyboard, X, Film, Palette, Eye
} from 'lucide-react'
import type { AppSettings } from '../../types/game'
import { CrosshairSettings as CrosshairSection } from './CrosshairSettings'
import { useTranslation } from '../../hooks/useTranslation'
import { useClipStore } from '../../store/clipStore'
import { FpsAccessPanel } from './FpsAccessPanel'
import './gameplay-overlay-settings.css'
import { RocketLeagueStatsPanel } from './RocketLeagueStatsPanel'
import { DEFAULT_PERFORMANCE_HOTKEY } from '../../services/performanceHotkey'
import { GameCrosshairSettings } from './GameCrosshairSettings'
import { CROSSHAIR_GAMES } from '../../services/gameCrosshairs'
import { overlayStatus } from '../../services/overlayStatus'

import robloxLogoImg from '../../assets/Roblox-Logo-Icon.png'
import rlLogoImg from '../../assets/Rocket-League-Logo.png'
import steamLogoImg from '../../assets/steam-logo.png'

// ─── Shared Toggle (Monochrome White & Black) ─────────────────────────────────
const Toggle = memo(function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  const {language}=useTranslation()
  return (
    <button 
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }} 
      aria-label={language==='de'?'Overlay umschalten':'Toggle overlay'}
      className="gameplay-overlay-switch"
      style={{
        borderRadius: 9999,
        border: '1px solid transparent',
        boxShadow: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        className="gameplay-overlay-switch__thumb"
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
const PerformanceSection = memo(function PerformanceSection({ settings, save, language }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  language: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const metrics = settings.overlayMetrics ?? {
    fps: true, cpu: true, gpu: true, ram: true, ping: false, time: true,
  }

  const toggleMetric = useCallback((key: 'fps'|'cpu'|'gpu'|'ram'|'time') => {
    const updated = { ...metrics, [key]: metrics[key] === false }
    save('overlayMetrics', updated)
  }, [metrics, save])

  const activeCount = ['fps', 'cpu', 'gpu', 'ram', 'time'].filter(key => (metrics as Record<string, unknown>)[key] !== false).length

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
    >
      <div id="overlay-performance-toggle" role="button" tabIndex={0} aria-expanded={open} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setOpen(p=>!p)}}} className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            settings.overlayPerformance ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <Activity size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${settings.overlayPerformance ? 'text-white' : 'text-white/70'}`}>

              {t('uiPerformanceOverlay')}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {settings.overlayPerformance 
                ? (language === 'de' ? `Hardware-Monitor (${activeCount}/5 Werte aktiv · FPS, CPU...)` : `Hardware Monitor (${activeCount}/5 stats active · FPS, CPU...)`)
                : (language === 'de' ? 'Deaktiviert' : 'Disabled')}
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

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

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
                    {language === 'de' ? 'Vertikal' : 'Vertical'}
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
                  {language === 'de' ? 'Größe' : 'Size'}
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
                    title={language === 'de' ? 'Verkleinern (-5%)' : 'Decrease (-5%)'}
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => save('overlayMetrics', { ...metrics, scale: 100 })}
                    className="w-11 py-0.5 rounded text-center text-[11px] font-semibold font-mono text-white hover:bg-white/10 hover:text-white transition-all cursor-pointer select-none"
                    title={language === 'de' ? 'Klicken für 100%' : 'Click to reset to 100%'}
                  >
                    {(typeof metrics.scale === 'number' ? (metrics.scale <= 3 ? Math.round(metrics.scale * 100) : metrics.scale) : 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = typeof metrics.scale === 'number' ? (metrics.scale <= 3 ? Math.round(metrics.scale * 100) : metrics.scale) : 100
                      const next = Math.min(200, cur + 5)
                      save('overlayMetrics', { ...metrics, scale: next })
                    }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                    title={language === 'de' ? 'Vergrößern (+5%)' : 'Increase (+5%)'}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="divide-y divide-white/[0.04]">
              <div id="performance-mirror"><MetricItem label={language==='de'?'Anzeige spiegeln':'Mirror display'} description={language==='de'?'Messwerte links, Bezeichnungen rechts.':'Readings on the left, labels on the right.'} enabled={metrics.mirrored===true} onToggle={()=>save('overlayMetrics',{...metrics,mirrored:!metrics.mirrored})} icon={<Move size={13}/>}/></div>
              <div className="performance-surface-settings">
                <div><strong>{language==='de'?'Tastenkürzel':'Shortcut'}</strong><p>{language==='de'?'Leistungsanzeige im Spiel und auf dem Desktop ein- oder ausschalten.':'Toggle the performance display in games and on the desktop.'}</p></div>
                <Select id="performance-hotkey" aria-label={language==='de'?'Tastenkürzel für Leistungsanzeige':'Performance overlay shortcut'} className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs" value={settings.overlayPerformanceHotkey??DEFAULT_PERFORMANCE_HOTKEY} onChange={event=>save('overlayPerformanceHotkey',event.target.value)}>
                  <option value={DEFAULT_PERFORMANCE_HOTKEY}>{language==='de'?'Strg + Umschalt + F10':'Ctrl + Shift + F10'}</option><option value="Ctrl+Shift+F11">{language==='de'?'Strg + Umschalt + F11':'Ctrl + Shift + F11'}</option><option value="Alt+Shift+P">{language==='de'?'Alt + Umschalt + P':'Alt + Shift + P'}</option><option value="">{language==='de'?'Aus':'Off'}</option>
                </Select>
              </div>
              <div className="performance-surface-settings">
                <div><strong>{language === 'de' ? 'Hintergrund' : 'Background'}</strong><p>{language === 'de' ? 'Dezent durchscheinend oder nur die Messwerte.' : 'A subtle translucent panel or just the readings.'}</p></div>
                <div role="group" aria-label={language === 'de' ? 'Hintergrund der Leistungsanzeige' : 'Performance display background'}>
                  {([{value:'glass',de:'Dezent',en:'Subtle'},{value:'clear',de:'Transparent',en:'Transparent'},{value:'solid',de:'Dunkel',en:'Dark'}] as const).map(surface => <button key={surface.value} id={'performance-surface-'+surface.value} type="button" aria-pressed={(metrics.background || 'glass') === surface.value} onClick={() => save('overlayMetrics',{...metrics,background:surface.value})}>{language === 'de' ? surface.de : surface.en}</button>)}
                </div>
              </div>
              <MetricItem 
                label={language === 'de' ? 'Spiel-Bildrate (FPS)' : 'Game frame rate (FPS)'}
                description={language === 'de' ? 'Misst die Bildrate des erkannten Spielprozesses.' : 'Measures the detected game process frame rate.'}
                enabled={metrics.fps ?? true} 
                onToggle={() => toggleMetric('fps')} 
                icon={<Gauge size={13} />} 
              />
              <FpsAccessPanel language={language} />
              <MetricItem 
                label={language === 'de' ? 'CPU-Auslastung' : 'CPU Usage'} 
                description={language === 'de' ? 'Prozessorlast in %' : 'Processor load in %'} 
                enabled={metrics.cpu ?? true} 
                onToggle={() => toggleMetric('cpu')} 
                icon={<Cpu size={13} />} 
              />
              <MetricItem 
                label={language === 'de' ? 'GPU-Auslastung' : 'GPU Usage'} 
                description={language === 'de' ? 'Grafikkartenlast in %' : 'Graphics card load in %'} 
                enabled={metrics.gpu ?? true} 
                onToggle={() => toggleMetric('gpu')} 
                icon={<Activity size={13} />} 
              />
              <MetricItem 
                label={language === 'de' ? 'RAM-Auslastung' : 'RAM Usage'} 
                description={language === 'de' ? 'Arbeitsspeicher-Verbrauch & %' : 'Memory usage & percentage'} 
                enabled={metrics.ram ?? true} 
                onToggle={() => toggleMetric('ram')} 
                icon={<MemoryStick size={13} />} 
              />
              <MetricItem 
                label={language === 'de' ? 'Uhrzeit' : 'Time & Clock'} 
                description={language === 'de' ? 'Aktuelle Systemzeit' : 'Current system time'} 
                enabled={metrics.time ?? true} 
                onToggle={() => toggleMetric('time')} 
                icon={<Clock size={13} />} 
              />
            </div>

          </>}
          </SmoothCollapse>
    </div>
  )
})

// ─── CPS Counter Section (General Overlays) ──────────────────────────────────
const CPSSection = memo(function CPSSection({ settings, save, language }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  language: string
}) {
  const [open, setOpen] = useState(false)
  const isEnabled = settings.overlayCps ?? false

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
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
              {language === 'de' ? 'Klicks pro Sekunde (CPS)' : 'Clicks Per Second (CPS)'}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {isEnabled 
                ? (language === 'de' ? 'LMB- & RMB-Klick-Tracker mit Live-Animation' : 'LMB & RMB live click tracker with click animation')
                : (language === 'de' ? 'Deaktiviert' : 'Disabled')}
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

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-2">
              <div className="text-[12px] font-medium text-white">
                {language === 'de' ? 'Live-Mausklick-Zähler' : 'Live Mouse Click Counter'}
              </div>
              <div className="text-[11px] text-white/50 leading-relaxed">
                {language === 'de' 
                  ? 'Zeigt die Klicks pro Sekunde (LMB & RMB) mit reaktionsschneller Klickanimation live auf dem Bildschirm an. Funktioniert auf dem Desktop und in allen Spielen.'
                  : 'Shows clicks per second (LMB & RMB) with responsive click animation live on screen. Works on desktop and in all games.'}
              </div>
            </div>

          </>}
          </SmoothCollapse>
    </div>
  )
})

export type ControllerSkinId = 'ps5_white' | 'ps5_black' | 'ps4_white' | 'ps4_black' | 'xbox_one'

export const getControllerSkins = (language: string): Record<ControllerSkinId, { label: string; url: string }> => ({
  ps5_white: {
    label: language === 'de' ? 'PS5 DualSense (Weiß)' : 'PS5 DualSense (White)',
    url: 'https://gamepadviewer.com/?p=1&s=ps5_white',
  },
  ps5_black: {
    label: language === 'de' ? 'PS5 Midnight Schwarz' : 'PS5 Midnight Black',
    url: 'https://gamepadviewer.com/?p=1&s=ps5_black',
  },
  ps4_white: {
    label: language === 'de' ? 'PS4 Weiß / Rot' : 'PS4 White / Red',
    url: 'https://gamepadviewer.com/?p=1&s=8',
  },
  ps4_black: {
    label: language === 'de' ? 'PS4 Klassisch Schwarz' : 'PS4 Classic Black',
    url: 'https://gamepadviewer.com/?p=1&s=5',
  },
  xbox_one: {
    label: 'Xbox One',
    url: 'https://gamepadviewer.com/?p=1&s=1',
  },
})

const GeneralControllerSection = memo(function GeneralControllerSection({ settings, save, language }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  language: string
}) {
  const [open, setOpen] = useState(false)
  const isEnabled = settings.overlayController ?? false
  const isDe = (language || 'de').startsWith('de')
  const activeSkin: ControllerSkinId = (settings.rlControllerSkin as ControllerSkinId) || 'ps5_white'
  const scale = settings.rlControllerScale || 80
  const skins = getControllerSkins(isDe ? 'de' : 'en')

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
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
              {isDe ? 'Controller Overlay (Live-HUD)' : 'Live Controller HUD (GamepadViewer)'}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {isEnabled 
                ? `${skins[activeSkin]?.label || activeSkin} · ${isDe ? 'Skalierung' : 'Scale'} ${scale}%` 
                : (isDe ? 'Deaktiviert' : 'Disabled')}
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

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-3">
              {/* Preset Skins */}
              <div>
                <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                  {isDe ? 'Controller-Design' : 'Controller Design'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                  {(Object.keys(skins) as ControllerSkinId[]).map((key) => {
                    const skin = skins[key]
                    const isSelected = activeSkin === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          save('rlControllerSkin', key)
                          save('rlControllerUrl', skin.url)
                        }}
                        className={`px-2.5 py-2 rounded-lg text-[10px] font-medium border transition-colors cursor-pointer ${
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
                  {isDe
                    ? '💡 Drücke im Spiel oder auf dem Desktop einmal eine beliebige Taste auf deinem Controller, um das Overlay zu aktivieren.'
                    : '💡 Press any button on your controller in-game or on desktop once to activate the overlay.'}
                </div>
              </div>

              {/* Controller Scale */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">
                    {isDe ? 'Skalierung' : 'Scale'}
                  </div>
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

              {/* Minimalist Discord Stream Studio Card */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2 mt-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-red-500/15 text-red-400 flex items-center justify-center flex-shrink-0">
                      <Radio size={12} className="animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-white truncate">
                        {isDe ? 'Discord Stream Modus' : 'Discord Stream Mode'}
                      </div>
                      <div className="text-[10px] text-white/40 truncate">
                        {isDe
                          ? 'Nur für Zuschauer sichtbar (dein Bildschirm bleibt frei)'
                          : 'Visible only to viewers (your screen stays clean)'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.stream?.open()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white/80 hover:text-white text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      <Tv size={11} />
                      <span>{isDe ? 'Studio öffnen' : 'Open Studio'}</span>
                    </button>
                    <Toggle 
                      checked={!!settings.overlayControllerStreamOnly} 
                      onChange={() => {
                        const next = !settings.overlayControllerStreamOnly
                        save('overlayControllerStreamOnly', next)
                        if (next) {
                          save('overlayController', true)
                          window.electronAPI?.stream?.open()
                        }
                      }} 
                    />
                  </div>
                </div>

                {settings.overlayControllerStreamOnly && (
                  <div className="text-[9px] text-emerald-400/80 flex items-center gap-1.5 pt-1.5 border-t border-white/[0.04]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>
                      {isDe 
                        ? 'In Discord übertragen: Anwendungen ➔ „Eclipse Stream“' 
                        : 'Stream in Discord: Applications ➔ "Eclipse Stream"'}
                    </span>
                  </div>
                )}
              </div>
            </div>

          </>}
          </SmoothCollapse>
    </div>
  )
})

// ─── Media Player Section (Spotify, YouTube, etc.) ───────────────────────────
const MediaSection = memo(function MediaSection({ settings, save, language }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  language: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [recordingAction, setRecordingAction] = useState<'playPause' | 'next' | 'prev' | null>(null)
  const isEnabled = !!settings.overlayMedia

  const keybinds = settings.overlayMediaKeybinds || {}

  useEffect(() => {
    if (!recordingAction) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecordingAction(null)
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        const updated = { ...keybinds, [recordingAction]: '' }
        save('overlayMediaKeybinds', updated)
        if (window.electronAPI?.media?.registerHotkeys) {
          window.electronAPI.media.registerHotkeys(updated)
        }
        setRecordingAction(null)
        return
      }

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      let keyName = e.key.toUpperCase()
      if (keyName === ' ') keyName = 'Space'
      if (keyName.startsWith('ARROW')) keyName = keyName.replace('ARROW', '')

      parts.push(keyName)
      const hotkeyStr = parts.join('+')

      const updated = { ...keybinds, [recordingAction]: hotkeyStr }
      save('overlayMediaKeybinds', updated)
      if (window.electronAPI?.media?.registerHotkeys) {
        window.electronAPI.media.registerHotkeys(updated)
      }
      setRecordingAction(null)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [recordingAction, keybinds, save])

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            isEnabled ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <Music size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
              {language === 'de' ? 'Spotify & Medien-Overlay' : 'Spotify & Media Overlay'}
            </div>
            <div className="text-[11px] text-white/40 truncate">
              {isEnabled 
                ? (language === 'de' ? 'Zeigt aktuellen Song, Equalizer und Steuerungsbuttons' : 'Shows current track, equalizer and controls')
                : (language === 'de' ? 'Deaktiviert' : 'Disabled')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle 
            checked={isEnabled} 
            onChange={() => save('overlayMedia', !isEnabled)} 
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-4">
              {/* Media Source Filter */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-medium text-white">
                    {language === 'de' ? 'Anzuzeigende Medien-Quelle' : 'Media Source to Display'}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {language === 'de' ? 'Wähle, ob nur Spotify oder auch Browser/YouTube erkannt werden sollen' : 'Choose whether to display only Spotify or also browsers/YouTube'}
                  </div>
                </div>

                <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      save('overlayMediaSource', 'all')
                      window.electronAPI?.media?.setFilter?.('all')
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      (settings.overlayMediaSource || 'all') === 'all'
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {language === 'de' ? 'Alle Medien' : 'All Media'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      save('overlayMediaSource', 'spotify')
                      window.electronAPI?.media?.setFilter?.('spotify')
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      settings.overlayMediaSource === 'spotify'
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Spotify
                  </button>
                </div>
              </div>

              {/* Auto-Hide / Dynamic Island collapse toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-[12px] font-medium text-white">
                    {language === 'de' ? 'Automatisch minimieren' : 'Auto-Collapse'}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {language === 'de' 
                      ? 'Nach 3 Sekunden einklappen (fährt bei Maus-Nähe / Hover sauber aus)' 
                      : 'Collapse after 3 seconds (smoothly expands on mouse hover)'}
                  </div>
                </div>
                <Toggle
                  checked={settings.overlayMediaAutoHide ?? false}
                  onChange={() => save('overlayMediaAutoHide', !settings.overlayMediaAutoHide)}
                />
              </div>

              {/* Sound Visualizer Animation Toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-[12px] font-medium text-white">
                    {language === 'de' ? 'Sound-Visualizer Animation' : 'Sound Visualizer Animation'}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {language === 'de' 
                      ? 'Equalizer-Balken auf dem Album-Cover bei laufender Musik anzeigen' 
                      : 'Display animated equalizer bars on album cover when playing'}
                  </div>
                </div>
                <Toggle
                  checked={settings.overlayMediaVisualizer !== false}
                  onChange={() => save('overlayMediaVisualizer', settings.overlayMediaVisualizer === false ? true : false)}
                />
              </div>

              {/* ─── Custom Keybinds Section ─── */}
              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-medium text-white flex items-center gap-1.5">
                      <Keyboard size={13} className="text-white/70" />
                      {language === 'de' ? 'Custom Keybinds (Tastenbelegung)' : 'Custom In-Game Keybinds'}
                    </div>
                    <div className="text-[11px] text-white/45">
                      {language === 'de' 
                        ? 'Steuere Spotify & Medien während des Spielens per Hotkey ohne raustabben' 
                        : 'Control Spotify & media during gameplay via global hotkeys'}
                    </div>
                  </div>

                  {(keybinds.playPause || keybinds.next || keybinds.prev) && (
                    <button
                      type="button"
                      onClick={() => {
                        const cleared = { playPause: '', next: '', prev: '' }
                        save('overlayMediaKeybinds', cleared)
                        if (window.electronAPI?.media?.registerHotkeys) {
                          window.electronAPI.media.registerHotkeys(cleared)
                        }
                      }}
                      className="text-[10px] text-white/40 hover:text-white/70 transition-colors underline"
                    >
                      {language === 'de' ? 'Alle entfernen' : 'Clear all'}
                    </button>
                  )}
                </div>

                {/* 3 Hotkey Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Previous Track */}
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.08] flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                        <SkipBack size={11} className="text-white/60" />
                        <span>{language === 'de' ? 'Zurück' : 'Previous'}</span>
                      </div>
                      {keybinds.prev && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = { ...keybinds, prev: '' }
                            save('overlayMediaKeybinds', updated)
                            if (window.electronAPI?.media?.registerHotkeys) {
                              window.electronAPI.media.registerHotkeys(updated)
                            }
                          }}
                          className="text-white/30 hover:text-white transition-colors p-0.5"
                          title={language === 'de' ? 'Löschen' : 'Clear'}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRecordingAction(recordingAction === 'prev' ? null : 'prev')}
                      className={`w-full py-1.5 px-2 rounded-md text-xs font-mono font-medium transition-all flex items-center justify-center text-center ${
                        recordingAction === 'prev'
                          ? 'bg-white text-black ring-2 ring-white/50 animate-pulse'
                          : keybinds.prev
                            ? 'bg-white/15 text-white hover:bg-white/20 border border-white/20'
                            : 'bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] border border-dashed border-white/10'
                      }`}
                    >
                      {recordingAction === 'prev'
                        ? (language === 'de' ? 'Taste drücken...' : 'Press keys...')
                        : (keybinds.prev || (language === 'de' ? '+ Taste belegen' : '+ Assign key'))}
                    </button>
                  </div>

                  {/* Play / Pause */}
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.08] flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                        <Play size={11} className="text-white/60" />
                        <span>{t('uiPlayPause')}</span>
                      </div>
                      {keybinds.playPause && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = { ...keybinds, playPause: '' }
                            save('overlayMediaKeybinds', updated)
                            if (window.electronAPI?.media?.registerHotkeys) {
                              window.electronAPI.media.registerHotkeys(updated)
                            }
                          }}
                          className="text-white/30 hover:text-white transition-colors p-0.5"
                          title={language === 'de' ? 'Löschen' : 'Clear'}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRecordingAction(recordingAction === 'playPause' ? null : 'playPause')}
                      className={`w-full py-1.5 px-2 rounded-md text-xs font-mono font-medium transition-all flex items-center justify-center text-center ${
                        recordingAction === 'playPause'
                          ? 'bg-white text-black ring-2 ring-white/50 animate-pulse'
                          : keybinds.playPause
                            ? 'bg-white/15 text-white hover:bg-white/20 border border-white/20'
                            : 'bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] border border-dashed border-white/10'
                      }`}
                    >
                      {recordingAction === 'playPause'
                        ? (language === 'de' ? 'Taste drücken...' : 'Press keys...')
                        : (keybinds.playPause || (language === 'de' ? '+ Taste belegen' : '+ Assign key'))}
                    </button>
                  </div>

                  {/* Next Track */}
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.08] flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                        <SkipForward size={11} className="text-white/60" />
                        <span>{language === 'de' ? 'Weiter' : 'Next'}</span>
                      </div>
                      {keybinds.next && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = { ...keybinds, next: '' }
                            save('overlayMediaKeybinds', updated)
                            if (window.electronAPI?.media?.registerHotkeys) {
                              window.electronAPI.media.registerHotkeys(updated)
                            }
                          }}
                          className="text-white/30 hover:text-white transition-colors p-0.5"
                          title={language === 'de' ? 'Löschen' : 'Clear'}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRecordingAction(recordingAction === 'next' ? null : 'next')}
                      className={`w-full py-1.5 px-2 rounded-md text-xs font-mono font-medium transition-all flex items-center justify-center text-center ${
                        recordingAction === 'next'
                          ? 'bg-white text-black ring-2 ring-white/50 animate-pulse'
                          : keybinds.next
                            ? 'bg-white/15 text-white hover:bg-white/20 border border-white/20'
                            : 'bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] border border-dashed border-white/10'
                      }`}
                    >
                      {recordingAction === 'next'
                        ? (language === 'de' ? 'Taste drücken...' : 'Press keys...')
                        : (keybinds.next || (language === 'de' ? '+ Taste belegen' : '+ Assign key'))}
                    </button>
                  </div>
                </div>

                {/* Helper hint & Preset */}
                <div className="text-[10px] text-white/35 flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <span>
                    {language === 'de' 
                      ? 'Tipp: Drücke Esc zum Abbrechen oder Backspace zum Entfernen.'
                      : 'Tip: Press Esc to cancel or Backspace to remove.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const defaults = {
                        prev: 'Ctrl+Alt+Left',
                        playPause: 'Ctrl+Alt+Space',
                        next: 'Ctrl+Alt+Right'
                      }
                      save('overlayMediaKeybinds', defaults)
                      if (window.electronAPI?.media?.registerHotkeys) {
                        window.electronAPI.media.registerHotkeys(defaults)
                      }
                    }}
                    className="text-white/40 hover:text-white/80 transition-colors"
                  >
                    {language === 'de' ? 'Standard setzen (Ctrl+Alt+Pfeiltasten)' : 'Set defaults (Ctrl+Alt+Arrows)'}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-white/40 leading-relaxed pt-1 border-t border-white/[0.04]">
                {language === 'de'
                  ? 'Erkennt automatisch Titel von Spotify, YouTube (Chrome, Edge, Firefox, Brave) und Apple Music inklusive originalem HD-Cover. Steuerung mit Play/Pause, Zurück und Weiter ohne Alt+Tab.'
                  : 'Automatically detects Spotify, YouTube, and Apple Music tracks with original HD album cover. Play/pause and track controls without leaving your game.'}
              </div>
            </div>

          </>}
          </SmoothCollapse>
    </div>
  )
})

// ─── Clip Notification Toast Section (ShadowPlay style) ──────────────────────
const CLIP_TOAST_COLOR_PRESETS = [
  { id: 'orange', nameDe: 'Orange', nameEn: 'Orange', hex: '#ff6600' },
  { id: 'green', nameDe: 'Grün', nameEn: 'Green', hex: '#76b900' },
  { id: 'cyan', nameDe: 'Cyan', nameEn: 'Cyan', hex: '#00d2ff' },
  { id: 'purple', nameDe: 'Lila', nameEn: 'Purple', hex: '#a855f7' },
  { id: 'red', nameDe: 'Rot', nameEn: 'Red', hex: '#ef4444' },
  { id: 'pink', nameDe: 'Pink', nameEn: 'Pink', hex: '#ec4899' },
  { id: 'gold', nameDe: 'Gold', nameEn: 'Gold', hex: '#f59e0b' },
  { id: 'white', nameDe: 'Weiß', nameEn: 'White', hex: '#ffffff' },
]

function hexToRgbaPreview(hex: string, alpha: number): string {
  if (!hex) return `rgba(255, 102, 0, ${alpha})`
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16)
  if (isNaN(num)) return `rgba(255, 102, 0, ${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const ClipNotificationSection = memo(function ClipNotificationSection({ settings, save, language }: {
  settings: Partial<AppSettings>
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  language: string
}) {
  const isEnabled = settings.overlayClipNotification !== false
  const activeColor = settings.overlayClipToastColor || '#ff6600'
  const [open, setOpen] = useState(false)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)

  const handleTriggerScreenPreview = () => {
    if (window.electronAPI?.showClipToast) {
      window.electronAPI.showClipToast({
        id: Date.now(),
        title: language === 'de' ? 'Highlight Clip' : 'Highlight Clip',
        gameTitle: 'Cyberpunk 2077',
        duration: 30,
        timestamp: Date.now(),
        language: language,
        color: activeColor,
      })
      setIsPreviewPlaying(true)
      setTimeout(() => setIsPreviewPlaying(false), 2500)
    }
  }

  const activePreset = CLIP_TOAST_COLOR_PRESETS.find(p => p.hex.toLowerCase() === activeColor.toLowerCase())
  const colorLabel = activePreset
    ? (language === 'de' ? activePreset.nameDe : activePreset.nameEn)
    : activeColor.toUpperCase()

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(p => !p)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
            isEnabled ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'
          }`}>
            <Film size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
              {language === 'de' ? 'Clip-Toast Overlay' : 'Clip Toast Overlay'}
            </div>
            <div className="text-[11px] text-white/40 truncate flex items-center gap-1.5">
              {isEnabled ? (
                <>
                  <span>
                    {language === 'de'
                      ? 'Elegantes Overlay unten rechts (NVIDIA-Stil)'
                      : 'Smooth bottom-right overlay (ShadowPlay style)'}
                  </span>
                  <span className="text-white/20">·</span>
                  <span className="inline-flex items-center gap-1.5 text-white/60">
                    <span
                      className="w-2 h-2 rounded-full inline-block flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: activeColor }}
                    />
                    <span>{colorLabel}</span>
                  </span>
                </>
              ) : (
                <span>{language === 'de' ? 'Deaktiviert' : 'Disabled'}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Toggle
            checked={isEnabled}
            onChange={() => {
              const nextVal = !isEnabled
              save('overlayClipNotification', nextVal)
              useClipStore.getState().setSettings({ notifyOnClip: nextVal })
            }}
          />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
            <ChevronDown size={14} />
          </motion.div>
        </div>
      </div>

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-4 space-y-4">

              {/* Color Selection */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                    <Palette size={13} className="text-white/60" />
                    <span>{language === 'de' ? 'Akzentfarbe' : 'Accent Color'}</span>
                  </div>
                  {activeColor.toLowerCase() !== '#ff6600' && (
                    <button
                      type="button"
                      onClick={() => save('overlayClipToastColor', '#ff6600')}
                      className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                      title={language === 'de' ? 'Standard zurücksetzen' : 'Reset to default'}
                    >
                      <RotateCcw size={10} />
                      <span>{language === 'de' ? 'Standard (Orange)' : 'Default (Orange)'}</span>
                    </button>
                  )}
                </div>

                {/* Color presets grid with clean names */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CLIP_TOAST_COLOR_PRESETS.map((preset) => {
                    const isSelected = activeColor.toLowerCase() === preset.hex.toLowerCase()
                    const label = language === 'de' ? preset.nameDe : preset.nameEn
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => save('overlayClipToastColor', preset.hex)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white/[0.08] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                            : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm"
                          style={{ backgroundColor: preset.hex }}
                        >
                          {isSelected && (
                            <Check size={9} className={preset.hex === '#ffffff' ? 'text-black' : 'text-white'} strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-[11px] font-medium truncate">
                          {label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom Color Input */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/50">{language === 'de' ? 'Eigene Farbe:' : 'Custom Color:'}</span>
                    <label className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] cursor-pointer transition-colors">
                      <input
                        type="color"
                        value={activeColor}
                        onChange={(e) => save('overlayClipToastColor', e.target.value)}
                        className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0 m-0 opacity-0 absolute inset-0"
                      />
                      <span className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ backgroundColor: activeColor }} />
                      <span className="text-[11px] font-mono text-white/80">{activeColor.toUpperCase()}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Preview Area */}
              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
                    <Eye size={13} className="text-white/60" />
                    <span>{language === 'de' ? 'Live-Vorschau' : 'Live Preview'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerScreenPreview}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      isPreviewPlaying
                        ? 'bg-white text-black border-white ring-2 ring-white/50 animate-pulse'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white shadow-sm'
                    }`}
                  >
                    <Play size={11} className={isPreviewPlaying ? 'text-black fill-black' : 'text-white fill-white'} />
                    <span>
                      {isPreviewPlaying
                        ? (language === 'de' ? 'Wird abgespielt...' : 'Playing on screen...')
                        : (language === 'de' ? 'Auf Bildschirm testen' : 'Test on Screen')}
                    </span>
                  </button>
                </div>

                {/* Centered Showcase Card with ambient glow */}
                <div className="settings-glass-card relative rounded-xl border border-white/[0.08] bg-white/[0.02] py-5 px-4 flex items-center justify-center overflow-hidden">
                  {/* Ambient backdrop glow in activeColor */}
                  <div
                    className="absolute inset-0 opacity-20 pointer-events-none transition-all duration-300 blur-2xl"
                    style={{ background: `radial-gradient(circle at center, ${activeColor} 0%, transparent 65%)` }}
                  />

                  {/* Toast Card */}
                  <div
                    className="relative flex items-center overflow-hidden rounded-xl shadow-2xl transition-all duration-200"
                    style={{
                      width: 290,
                      height: 66,
                      background: '#0c0d13',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: `0 14px 36px rgba(0, 0, 0, 0.85), 0 0 16px ${hexToRgbaPreview(activeColor, 0.18)}`,
                      padding: '8px 14px 8px 10px',
                    }}
                  >
                    {/* Left Accent Stripe */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        backgroundColor: activeColor,
                      }}
                    />

                    {/* Icon Box */}
                    <div
                      className="rounded-lg shadow-sm"
                      style={{
                        width: 46,
                        height: 46,
                        marginLeft: 4,
                        backgroundColor: activeColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Film size={22} color="#ffffff" strokeWidth={2.2} />
                    </div>

                    {/* Text Details */}
                    <div className="flex-1 min-w-0 ml-3 flex flex-col justify-center gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white tracking-tight">
                          {language === 'de' ? 'Clip gespeichert' : 'Clip Saved'}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none"
                          style={{
                            color: activeColor,
                            backgroundColor: hexToRgbaPreview(activeColor, 0.16),
                            border: `1px solid ${hexToRgbaPreview(activeColor, 0.35)}`,
                          }}
                        >
                          30s
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-white/60 truncate">
                        Cyberpunk 2077
                      </div>
                    </div>

                    {/* Bottom Progress Bar */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        backgroundColor: activeColor,
                        boxShadow: `0 0 8px ${hexToRgbaPreview(activeColor, 0.5)}`,
                      }}
                    />
                  </div>
                </div>

                <div className="text-[11px] text-white/40 leading-relaxed pt-0.5">
                  {language === 'de'
                    ? 'Klicke auf „Auf Bildschirm testen“, um die echte flüssige Animation mit deiner Akzentfarbe live am Monitorrand auszuprobieren.'
                    : 'Click "Test on Screen" to preview the smooth sweep animation with your selected accent color live on your display.'}
                </div>
              </div>

            </div>

          </>}
          </SmoothCollapse>
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
  robloxAntiAfk,
  onToggleAntiAfk,
  language,
}: { 
  robloxTimer: boolean; 
  onToggleTimer: () => void;
  robloxCps: boolean;
  onToggleCps: () => void;
  robloxAntiAfk: boolean;
  onToggleAntiAfk: () => void;
  language: string;
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const activeCount = (robloxTimer ? 1 : 0) + (robloxCps ? 1 : 0) + (robloxAntiAfk ? 1 : 0)

  return (
    <div
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
    >
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0 border border-white/10">
          <RobloxLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Roblox</div>
          <div className="text-[11px] text-white/50">
            {overlayStatus(activeCount,language)}
          </div>
        </div>
        {activeCount > 0 && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-white/50" />
        </motion.div>
      </button>
      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="divide-y divide-white/[0.04]">
              {/* Overlay 1: Session & AFK Timer */}
              <div onClick={onToggleTimer} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${robloxTimer ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                  <Timer size={13} />
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-medium ${robloxTimer ? 'text-white' : 'text-white/60'}`}>
                    {language === 'de' ? 'Spiel-Session & AFK-Timer' : 'Game-Session & AFK Timer'}
                  </div>
                  <div className="text-[10px] text-white/40">
                    {language === 'de' 
                      ? 'Session-Zeit & AFK-Kick-Countdown. Leuchtet unter 2 Min. rot.' 
                      : 'Session time + AFK kick countdown. Glows red under 2 min.'}
                  </div>
                </div>
                <Toggle checked={robloxTimer} onChange={onToggleTimer} />
              </div>

              {/* Overlay 2: Roblox Anti-AFK (1-Pixel Nudge) */}
              <div onClick={onToggleAntiAfk} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${robloxAntiAfk ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-white/40'}`}>
                  <ShieldCheck size={14} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`text-[12px] font-medium ${robloxAntiAfk ? 'text-white' : 'text-white/60'}`}>
                      {language === 'de' ? 'Roblox Anti-AFK (Anti-Kick Schutz)' : 'Roblox Anti-AFK (Anti-Kick Protection)'}
                    </div>
                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">

                      {t('uiNudge')}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {language === 'de' 
                      ? 'Sendet alle 10 Minuten einen kleinen Mausimpuls. Ob dies die Leerlauferkennung beeinflusst, hängt vom Spiel ab.'
                      : 'Sends a small mouse movement every 10 minutes. Its effect on idle detection depends on the game.'}
                  </div>
                </div>
                <Toggle checked={robloxAntiAfk} onChange={onToggleAntiAfk} />
              </div>

              {/* Overlay 3: Roblox CPS Counter */}
              <div onClick={onToggleCps} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${robloxCps ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                  <MousePointerClick size={13} />
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-medium ${robloxCps ? 'text-white' : 'text-white/60'}`}>
                    {language === 'de' ? 'Klicks pro Sekunde (CPS)' : 'Clicks Per Second (CPS)'}
                  </div>
                  <div className="text-[10px] text-white/40">
                    {language === 'de' 
                      ? 'Live-Klick-Tracker für LMB & RMB speziell in Roblox.' 
                      : 'Live LMB & RMB click tracker specifically in Roblox.'}
                  </div>
                </div>
                <Toggle checked={robloxCps} onChange={onToggleCps} />
              </div>
            </div>

          </>}
          </SmoothCollapse>
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
  rlPlayerId, onPlayerChange,
  steamProfileUrl, onSteamUrlChange,
  overlayRLSteam, onSteamToggle,
  rlScoreboardKeyKb, onKeyKbChange,
  rlScoreboardKeyCtrl, onKeyCtrlChange,
  rlSteamAvatarScale, onScaleChange,
  overlayRLController, onControllerToggle,
  rlControllerSkin, onControllerSkinChange,
  rlControllerUrl, onControllerUrlChange,
  rlControllerScale, onControllerScaleChange,
  language,
}: {
  rlHud: boolean
  onToggle: () => void
  playlist: '1v1' | '2v2' | '3v3'
  onPlaylistChange: (p: '1v1' | '2v2' | '3v3') => void
  rlPlayerId: string
  onPlayerChange: (id: string) => void
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
  language: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [openSub, setOpenSub] = useState<'mmr' | 'controller' | 'steam' | null>('mmr')
  const skins = getControllerSkins(language)

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
      className={`settings-glass-card rounded-xl border transition-colors duration-150 ${open ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.06] hover:border-white/[0.09] bg-white/[0.02]'}`}
    >
      <button id="overlay-rocket-league-toggle" onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10 bg-transparent">
          <RLLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Rocket League</div>
          <div className="text-[11px] text-white/50">
            {overlayStatus(activeSubCount,language)}
          </div>
        </div>
        {activeSubCount > 0 && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_#ffffff]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-white/50" />
        </motion.div>
      </button>

      <SmoothCollapse open={open} className="overflow-hidden">
          {() => <>

            <div className="h-px bg-white/[0.06] mx-4" />
            <div className="p-3 space-y-2.5">

              {/* ─── OPTION 1: MMR & Rank Tracker Dropdown ─── */}
              <div className="rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
                <div 
                  className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  id="overlay-rocket-league-stats-toggle" onClick={() => setOpenSub(s => s === 'mmr' ? null : 'mmr')}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${rlHud ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40'}`}>
                      <Activity size={13} />
                    </div>
                    <div>
                      <div className={`text-[12px] font-semibold ${rlHud ? 'text-white' : 'text-white/70'}`}>
                        {language === 'de' ? 'Ranked-Sitzung · W/L & Serie' : 'Ranked session · W/L & streak'}
                      </div>
                      <div className="text-[10px] text-white/40">
                        {playlist} · {language === 'de' ? 'Offizielle Matchdaten' : 'Official match data'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={rlHud} onChange={onToggle} />
                    <motion.div animate={{ rotate: openSub === 'mmr' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <SmoothCollapse open={openSub === 'mmr'} className="overflow-hidden">
          {() => <>

                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3"><RocketLeagueStatsPanel enabled={rlHud} playlist={playlist} onPlaylistChange={onPlaylistChange} playerId={rlPlayerId} onPlayerChange={onPlayerChange} language={language} /></div>

          </>}
          </SmoothCollapse>
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
                      <div className={`text-[12px] font-semibold ${overlayRLController ? 'text-white' : 'text-white/70'}`}>
                        {language === 'de' ? 'Controller Overlay (Live-HUD)' : 'Live Controller HUD (GamepadViewer)'}
                      </div>
                      <div className="text-[10px] text-white/40">
                        {skins[(rlControllerSkin as ControllerSkinId) || 'ps5_white']?.label || 'Controller HUD'} · {language === 'de' ? 'Skalierung' : 'Scale'} {rlControllerScale}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={overlayRLController} onChange={onControllerToggle} />
                    <motion.div animate={{ rotate: openSub === 'controller' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <SmoothCollapse open={openSub === 'controller'} className="overflow-hidden">
          {() => <>

                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3 space-y-3">
                        {/* Preset Skins */}
                        <div>
                          <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                            {language === 'de' ? 'Controller-Design' : 'Controller Design'}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                            {(Object.keys(skins) as ControllerSkinId[]).map((key) => {
                              const skin = skins[key]
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
                            {language === 'de'
                              ? '💡 Drücke im Spiel einmal eine beliebige Taste auf deinem Controller, um das Overlay zu aktivieren.'
                              : '💡 Press any button on your controller in-game once to activate the overlay.'}
                          </div>
                        </div>

                        {/* Controller Scale */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">
                              {language === 'de' ? 'Skalierung' : 'Scale'}
                            </div>
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

          </>}
          </SmoothCollapse>
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
                      <div className={`text-[12px] font-semibold ${overlayRLSteam ? 'text-white' : 'text-white/70'}`}>
                        {language === 'de' ? 'Steam-Profil im Spiel' : 'Steam Profile In-Game'}
                      </div>
                      <div className="text-[10px] text-white/40">
                        {steamProfileUrl 
                          ? (language === 'de' ? 'Profil verknüpft' : 'Profile connected') 
                          : (language === 'de' ? 'Scoreboard-Taste im Spiel halten' : 'Hold Scoreboard key in-game')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={overlayRLSteam} onChange={onSteamToggle} />
                    <motion.div animate={{ rotate: openSub === 'steam' ? 180 : 0 }} transition={{ duration: 0.15 }} className="text-white/40">
                      <ChevronDown size={13} />
                    </motion.div>
                  </div>
                </div>

                <SmoothCollapse open={openSub === 'steam'} className="overflow-hidden">
          {() => <>

                      <div className="h-px bg-white/[0.04] mx-3" />
                      <div className="p-3 space-y-3">
                        <div className="flex gap-2.5 items-end">
                          <div className="flex-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                              {language === 'de' ? 'Steam Profil-URL oder ID' : 'Steam Profile URL or ID'}
                              {avatarPreview && <span className="text-white font-bold">✓</span>}
                            </div>
                            <input
                              type="text"
                              value={steamProfileUrl}
                              onChange={e => onSteamUrlChange(e.target.value)}
                              placeholder={language === 'de' ? 'z. B. https://steamcommunity.com/id/meinprofil' : 'e.g. https://steamcommunity.com/id/myprofile'}
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
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                              {language === 'de' ? 'Scoreboard-Taste (Tastatur)' : 'Scoreboard Key (KB)'}
                            </div>
                            <button
                              onClick={() => setListenKb(true)}
                              className={`w-full text-left border rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${listenKb ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                            >
                              {listenKb ? (language === 'de' ? 'Taste drücken...' : 'Press any key...') : rlScoreboardKeyKb}
                            </button>
                          </div>
                          <div className="flex-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
                              {language === 'de' ? 'Scoreboard-Taste (Controller)' : 'Scoreboard Key (Ctrl)'}
                            </div>
                            <button
                              onClick={() => setListenCtrl(true)}
                              className={`w-full text-left border rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${listenCtrl ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/[0.08] text-white hover:border-white/[0.15]'}`}
                            >
                              {listenCtrl ? (language === 'de' ? 'Knopf drücken...' : 'Press any button...') : rlScoreboardKeyCtrl}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] font-semibold text-white/50 uppercase tracking-wider">
                              {language === 'de' ? 'UI-Skalierung' : 'UI Scale'}
                            </div>
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

          </>}
          </SmoothCollapse>
              </div>

            </div>

          </>}
          </SmoothCollapse>
    </div>
  )
})

// ─── Main Component ───────────────────────────────────────────────────────────
export const GameplayOverlayTab = memo(function GameplayOverlayTab({ settings, updateSettings }: {
  settings: Partial<AppSettings>
  updateSettings: (data: Partial<AppSettings>) => void
}) {
  const { language } = useTranslation()
  const lang = (settings.language || language || 'en') as string
  const {data:runtime}=useQuery({queryKey:['overlay-runtime-state'],queryFn:async()=>await window.electronAPI?.getOverlayState?.()||null,refetchInterval:2000,refetchOnWindowFocus:false,retry:false})

  const save = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    void persistAppSettings({ [key]: value })
  }, [])

  const activeCount = [
    settings.overlayPerformance, 
    settings.overlayCrosshair, 
    settings.overlayCps,
    settings.overlayMedia,
    settings.overlayController,
    settings.overlayRobloxTimer,
    settings.overlayRobloxCps,
    settings.overlayRLHud,
    settings.overlayRLSteam,
    settings.overlayRLController,
    settings.overlayCS2Stats,
    ...CROSSHAIR_GAMES.map(game => settings.overlayGameCrosshairs?.[game.id]?.enabled),
  ].filter(Boolean).length

  return (
    <div
      className="gameplay-overlay-tab space-y-6 pb-4"
    >
      {/* Header */}
      <div className="overlay-settings-header">
        <div>
          <span className="overlay-settings-eyebrow">ECLIPSE · HUD</span>
          <h2 className="text-lg font-bold text-white tracking-tight">{lang === 'de' ? 'Spiel-Overlays' : 'Gameplay overlays'}</h2>
          <p className="text-[12px] text-white/50 mt-0.5">
            {lang === 'de' ? 'Wähle deine Anzeigen und passe sie an dein Spiel an.' : 'Choose your widgets and make them fit your game.'}
          </p>
        </div>
        <div className="overlay-settings-actions">
          <button type="button" className="overlay-layout-button" onClick={()=>window.electronAPI?.startOverlayEdit()}><Move size={13}/>{lang==='de'?'Layout bearbeiten':'Edit layout'}</button>
        <div className="overlay-settings-count">
          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeCount > 0 ? 'bg-white shadow-[0_0_5px_#ffffff]' : 'bg-white/20'}`} />
          <span className="text-[11px] font-medium text-white/60">
            {activeCount} {lang === 'de' ? 'eingeschaltet' : 'enabled'}
          </span>
        </div>
        </div>
      </div>

      {/* SECTION 1: General Overlays */}
      <section>
        <div className="overlay-settings-scope">
          <div><strong>{lang==='de'?'Wann soll das HUD sichtbar sein?':'When should the HUD appear?'}</strong><p>{settings.overlayGeneralAlwaysOn?(lang==='de'?'Auf dem Desktop und im Spiel. Spielspezifische Widgets erscheinen nur im jeweiligen Spiel.':'On desktop and in games. Game-specific widgets appear only in their game.'):(lang==='de'?'Allgemeine Widgets erscheinen, sobald Eclipse ein laufendes Spiel erkennt.':'General widgets appear when Eclipse detects a running game.')}</p></div>
          <div role="group" aria-label={lang==='de'?'Overlay-Anzeigemodus':'Overlay display mode'}>
            <button id="overlay-scope-game" type="button" aria-pressed={!settings.overlayGeneralAlwaysOn} onClick={()=>save('overlayGeneralAlwaysOn',false)}>{lang==='de'?'Nur im Spiel':'Only in game'}</button>
            <button id="overlay-scope-always" type="button" aria-pressed={settings.overlayGeneralAlwaysOn===true} onClick={()=>save('overlayGeneralAlwaysOn',true)}>{lang==='de'?'Immer':'Always'}</button>
          </div>
        </div>
        <SectionLabel icon={<Layers size={14}/>} title={lang==='de'?'Allgemeine Anzeigen':'General widgets'} subtitle={lang==='de'?'Performance, Fadenkreuz, Eingaben und Medien':'Performance, crosshair, inputs and media'}/>
        <div className="overlay-settings-list">
          <PerformanceSection settings={settings} save={save} language={lang} />
          <CrosshairSection settings={settings} save={save} commit={persistAppSettings} language={lang} />
          <CPSSection settings={settings} save={save} language={lang} />
          <GeneralControllerSection settings={settings} save={save} language={lang} />
          <MediaSection settings={settings} save={save} language={lang} />
          <ClipNotificationSection settings={settings} save={save} language={lang} />
        </div>
      </section>

      {/* SECTION 2: Game-specific Overlays */}
      <section>
        <SectionLabel 
          icon={<Gamepad2 size={14} className="text-white" />} 
          title={lang === 'de' ? 'Spielspezifische Overlays' : 'Game-Specific Overlays'} 
          subtitle={lang === 'de' ? 'Individuell pro Spiel konfigurierbar' : 'Configurable per game'} 
        />
        <div className="overlay-settings-game-list space-y-3">
          {CROSSHAIR_GAMES.map(game => <GameCrosshairSettings key={game.id} id={game.id} settings={settings} language={lang}/>)}
          <RobloxAccordion
            robloxTimer={settings.overlayRobloxTimer || false}
            onToggleTimer={() => save('overlayRobloxTimer', !settings.overlayRobloxTimer)}
            robloxCps={settings.overlayRobloxCps || false}
            onToggleCps={() => save('overlayRobloxCps', !settings.overlayRobloxCps)}
            robloxAntiAfk={settings.overlayRobloxAntiAfk || false}
            onToggleAntiAfk={() => save('overlayRobloxAntiAfk', !settings.overlayRobloxAntiAfk)}
            language={lang}
          />
          <RocketLeagueAccordion
            rlHud={settings.overlayRLHud || false}
            onToggle={() => save('overlayRLHud', !settings.overlayRLHud)}
            playlist={(settings.rlPlaylist as '1v1' | '2v2' | '3v3') || '2v2'}
            onPlaylistChange={(p) => {
              save('rlPlaylist', p)
            }}
            rlPlayerId={settings.rlPlayerId || ''}
            onPlayerChange={id => save('rlPlayerId', id)}
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
            rlControllerUrl={settings.rlControllerUrl || getControllerSkins(lang).ps5_white.url}
            onControllerUrlChange={(url) => save('rlControllerUrl', url)}
            rlControllerScale={settings.rlControllerScale || 80}
            onControllerScaleChange={(s) => save('rlControllerScale', s)}
            language={lang}
          />

        </div>
      </section>

      <p className="overlay-settings-note" role="status">{runtime?.gameData&&runtime.visible?(lang==='de'?'HUD-Fenster sichtbar':'HUD window visible'):activeCount===0?(lang==='de'?'Keine dauerhaften Widgets eingeschaltet. Clip-Bestätigungen werden separat angezeigt.':'No permanent widgets enabled. Clip confirmations appear separately.'):(lang==='de'?'Einstellungen werden sofort übernommen. Im Modus „Nur im Spiel“ wartet das HUD auf ein erkanntes Spiel.':'Changes apply immediately. In “Only in game” mode, the HUD waits for a detected game.')}</p>
    </div>
  )
})
