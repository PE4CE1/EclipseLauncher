import type { MetricsConfig, MetricsData } from '../components/overlay/widgets/Performance'

/** Preserve the snapshot identity until a displayed value actually changes.
 * Frame-time decimals, disabled sensors and AFK ticks must not repaint this HUD. */
export function createPerformanceMetricsSelector(config: MetricsConfig | undefined, pid?: number): (data: MetricsData) => MetricsData {
  let previous: MetricsData | undefined
  const percentage = (value: number | undefined) => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value!))) : undefined
  return data => {
    const hasTarget = !!pid && data.gameFpsPid === pid
    const next: MetricsData = { idleTime: 0,
      cpu: config?.cpu !== false ? percentage(data.cpu) : undefined,
      gpu: config?.gpu !== false ? percentage(data.gpu) : undefined,
      ram: config?.ram !== false ? percentage(data.ram) : undefined,
      gameFps: config?.fps !== false && hasTarget && Number.isFinite(data.gameFps) && data.gameFps! > 0 ? Math.round(data.gameFps!) : undefined,
      gameFpsStatus: config?.fps !== false && hasTarget ? data.gameFpsStatus : 'idle',
    }
    if (previous && (Object.keys(next) as Array<keyof MetricsData>).every(key => previous![key] === next[key])) return previous
    previous = next
    return next
  }
}
