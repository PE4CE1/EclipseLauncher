import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad2, Zap, Battery, Bluetooth, Usb, Vibrate, X } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'

export interface ControllerState {
  connected: boolean
  model: string
  vendor: 'sony' | 'xbox' | 'nintendo' | 'unknown'
  connectionType: 'bluetooth' | 'usb' | 'wireless' | 'none'
  level: number
  charging: boolean
  hasExactLevel: boolean
  slot: number
  rawId?: string
}

interface ControllerPopoverProps {
  controller: ControllerState
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
}

function deadzone(val: number, threshold = 0.06): number {
  if (Math.abs(val) < threshold) return 0
  return val
}

const sameNumbers = (left: number[], right: number[]) => left.length === right.length && left.every((value, index) => value === right[index])

export function ControllerPopover({ controller, isOpen, onClose }: ControllerPopoverProps) {
  const { t } = useTranslation()
  const popoverRef = useRef<HTMLDivElement>(null)
  const lastNativeRef = useRef<number>(0)
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  const [pressedButtons, setPressedButtons] = useState<number[]>([])
  const [axes, setAxes] = useState<number[]>([0, 0, 0, 0])
  const [triggers, setTriggers] = useState<{ lt: number; rt: number }>({ lt: 0, rt: 0 })
  const [isVibrating, setIsVibrating] = useState(false)
  const [vibrateStatus, setVibrateStatus] = useState<'idle' | 'testing' | 'success' | 'unsupported'>('idle')

  // Close on Click Outside or Escape
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Real-time Gamepad Input Engine (100Hz Native XInput & Sony HID + HTML5 Gamepad API fallback)
  useEffect(() => {
    if (!isOpen || !visible) return

    // Ensure native service is started
    if (typeof window !== 'undefined' && window.electronAPI?.startGamepadService) {
      window.electronAPI.startGamepadService().catch(() => {})
    }

    // 1. Native IPC 100Hz listener
    let unsubscribeNative: (() => void) | undefined
    if (typeof window !== 'undefined' && window.electronAPI?.onGamepadState) {
      unsubscribeNative = window.electronAPI.onGamepadState((state: any) => {
        if (!state) return
        lastNativeRef.current = Date.now()

        if (Array.isArray(state.buttons)) {
          const pressed: number[] = []
          state.buttons.forEach((b: any, idx: number) => {
            if (b && (b.pressed || (typeof b.value === 'number' && b.value > 0.15))) {
              pressed.push(idx)
            }
          })
          setPressedButtons(prev => sameNumbers(prev, pressed) ? prev : pressed)

          const lt = state.buttons[6]?.value ?? (state.buttons[6]?.pressed ? 1 : 0)
          const rt = state.buttons[7]?.value ?? (state.buttons[7]?.pressed ? 1 : 0)
          setTriggers(prev => prev.lt === lt && prev.rt === rt ? prev : { lt, rt })
        }

        if (Array.isArray(state.axes) && state.axes.length >= 4) {
          const nextAxes = [
            deadzone(state.axes[0] || 0),
            deadzone(state.axes[1] || 0),
            deadzone(state.axes[2] || 0),
            deadzone(state.axes[3] || 0),
          ]
          setAxes(prev => sameNumbers(prev, nextAxes) ? prev : nextAxes)
        }
      })
    }

    // 2. Parallel standard HTML5 Gamepad API loop (fallback if native not reporting)
    let animId: number
    const poll = () => {
      const isNativeActive = Date.now() - lastNativeRef.current < 350
      if (!isNativeActive && typeof navigator.getGamepads === 'function') {
        const gamepads = navigator.getGamepads()
        const gp = gamepads[controller.slot] || gamepads.find(g => g && g.connected)
        if (gp) {
          const pressed: number[] = []
          gp.buttons.forEach((b, idx) => {
            if (b && (b.pressed || b.value > 0.15)) pressed.push(idx)
          })
          setPressedButtons(prev => sameNumbers(prev, pressed) ? prev : pressed)

          const lt = gp.buttons[6]?.value ?? (gp.buttons[6]?.pressed ? 1 : 0)
          const rt = gp.buttons[7]?.value ?? (gp.buttons[7]?.pressed ? 1 : 0)
          setTriggers(prev => prev.lt === lt && prev.rt === rt ? prev : { lt, rt })

          if (gp.axes && gp.axes.length >= 4) {
            const nextAxes = [
              deadzone(gp.axes[0] || 0),
              deadzone(gp.axes[1] || 0),
              deadzone(gp.axes[2] || 0),
              deadzone(gp.axes[3] || 0),
            ]
            setAxes(prev => sameNumbers(prev, nextAxes) ? prev : nextAxes)
          }
        }
      }
      animId = requestAnimationFrame(poll)
    }

    animId = requestAnimationFrame(poll)
    return () => {
      cancelAnimationFrame(animId)
      if (unsubscribeNative) unsubscribeNative()
      void window.electronAPI?.stopGamepadService?.().catch(() => {})
    }
  }, [isOpen, controller.slot, visible])

  // Universal Vibration Test Handler (Native XInput + Sony HID + Gamepad API)
  const handleTestVibration = async () => {
    if (isVibrating) return
    setIsVibrating(true)
    setVibrateStatus('testing')

    let worked = false

    try {
      // 1. Try native Win32 rumble (triggers XInput slots 0..3 + DualSense/DS4 HID reports)
      if (typeof window !== 'undefined' && window.electronAPI?.vibrateController) {
        worked = await window.electronAPI.vibrateController()
      }

      // 2. Also fire Chromium Gamepad actuator for all connected gamepads
      if (typeof navigator.getGamepads === 'function') {
        const gamepads = navigator.getGamepads()
        for (const gp of gamepads) {
          if (gp && gp.connected) {
            const actuator = (gp as any)?.vibrationActuator
            if (actuator && typeof actuator.playEffect === 'function') {
              actuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: 400,
                weakMagnitude: 1.0,
                strongMagnitude: 1.0,
              }).then(() => {
                worked = true
              }).catch(() => {})
            }
          }
        }
      }

      setVibrateStatus(worked ? 'success' : 'unsupported')
    } catch {
      setVibrateStatus('unsupported')
    } finally {
      setTimeout(() => {
        setIsVibrating(false)
      }, 450)
      setTimeout(() => {
        setVibrateStatus('idle')
      }, 2500)
    }
  }

  const isXbox = controller.vendor === 'xbox'
  const isNintendo = controller.vendor === 'nintendo'
  const leftTriggerLabel = isNintendo ? 'ZL' : isXbox ? 'LT' : 'L2'
  const rightTriggerLabel = isNintendo ? 'ZR' : isXbox ? 'RT' : 'R2'

  const getBatteryColor = () => {
    if (controller.charging) return 'text-amber-400'
    if (controller.level > 20) return 'text-emerald-400'
    return 'text-rose-400'
  }

  const getBatteryBarColor = () => {
    if (controller.charging) return 'bg-amber-400'
    if (controller.level > 20) return 'bg-emerald-400'
    return 'bg-rose-500'
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="controller-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40"
          onClick={onClose}
        />
      )}
      {isOpen && (
        <motion.div
          key="controller-popover-panel"
          ref={popoverRef}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="absolute top-full right-0 mt-2 z-50 w-80 bg-[#0e1017]/95 border border-white/[0.08] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-4 text-white select-none space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center shrink-0 text-white/80">
                <Gamepad2 size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-white/95 truncate leading-tight">
                  {controller.model || t('controllerTitle')}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1 text-[10px] text-white/45">
                    {controller.connectionType === 'usb' ? (
                      <>
                        <Usb size={10} className="text-white/50" />
                        <span>{t('controllerWired')}</span>
                      </>
                    ) : (
                      <>
                        <Bluetooth size={10} className="text-blue-400/80" />
                        <span>{t('controllerBluetooth')}</span>
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-white/30">•</span>
                  <span className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {t('controllerConnected')}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label={t('close') || t('close')}
            >
              <X size={14} />
            </button>
          </div>

          {/* Battery Card */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {controller.charging ? (
                  <div className="text-amber-400">
                    <Zap size={14} fill="currentColor" />
                  </div>
                ) : (
                  <div className={getBatteryColor()}>
                    <Battery size={14} />
                  </div>
                )}
                <span className="text-xs font-medium text-white/80">
                  {controller.charging ? t('controllerCharging') : t('controllerBattery')}
                </span>
              </div>

              <span className={`text-sm font-semibold font-mono ${getBatteryColor()}`}>
                {controller.hasExactLevel ? `${controller.level}%` : t('controllerConnected')}
              </span>
            </div>

            {/* Slim Battery Bar */}
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-2.5">
              <div
                className={`h-full rounded-full ${getBatteryBarColor()} transition-all duration-300`}
                style={{ width: `${Math.max(6, Math.min(100, controller.level))}%` }}
              />
            </div>
          </div>

          {/* Minimalist Input Test (Sticks & Triggers Only) */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2.5">
            <div className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
              {t('controllerInputTest')}
            </div>

            {/* Sticks & Triggers Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Sticks */}
              <div className="flex items-center justify-around p-2 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                {/* Left Stick */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.02] relative flex items-center justify-center">
                    <div className="absolute inset-x-0 h-px bg-white/[0.04]" />
                    <div className="absolute inset-y-0 w-px bg-white/[0.04]" />
                    <div
                      className={`w-3 h-3 rounded-full ${
                        pressedButtons.includes(10) ? 'bg-indigo-400 scale-125 ring-2 ring-indigo-400/40' : 'bg-white/80'
                      }`}
                      style={{
                        transform: `translate(${axes[0] * 12}px, ${axes[1] * 12}px)`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-white/45">L</span>
                </div>

                {/* Right Stick */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.02] relative flex items-center justify-center">
                    <div className="absolute inset-x-0 h-px bg-white/[0.04]" />
                    <div className="absolute inset-y-0 w-px bg-white/[0.04]" />
                    <div
                      className={`w-3 h-3 rounded-full ${
                        pressedButtons.includes(11) ? 'bg-indigo-400 scale-125 ring-2 ring-indigo-400/40' : 'bg-white/80'
                      }`}
                      style={{
                        transform: `translate(${axes[2] * 12}px, ${axes[3] * 12}px)`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-white/45">R</span>
                </div>
              </div>

              {/* Triggers */}
              <div className="flex flex-col justify-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-white/50 font-mono">
                    <span>{leftTriggerLabel}</span>
                    <span className="text-white/70">{Math.round(triggers.lt * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${Math.round(triggers.lt * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-white/50 font-mono">
                    <span>{rightTriggerLabel}</span>
                    <span className="text-white/70">{Math.round(triggers.rt * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${Math.round(triggers.rt * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Minimalist Vibration Action */}
          <button
            onClick={handleTestVibration}
            disabled={isVibrating}
            className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-xs font-medium text-white/75 hover:text-white transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Vibrate size={13} className={isVibrating ? 'animate-pulse text-amber-400' : 'text-white/60'} />
            <span>
              {vibrateStatus === 'testing'
                ? t('controllerVibrating')
                : vibrateStatus === 'success'
                  ? t('controllerVibrateSuccess')
                  : vibrateStatus === 'unsupported'
                    ? t('controllerVibrateUnsupported')
                    : t('controllerVibrateTest')}
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
