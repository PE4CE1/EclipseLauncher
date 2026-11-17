import { memo, useMemo } from 'react'

export const ClipWaveform = memo(function ClipWaveform({ peaks, muted, color }: { peaks: number[]; muted: boolean; color: string }) {
  const path = useMemo(() => peaks.map((peak, index) => {
    const x = (index + .5) / peaks.length * 1000, size = Math.max(.6, peak * 32)
    return `M${x.toFixed(2)},${(36-size).toFixed(2)}v${(size*2).toFixed(2)}`
  }).join(''), [peaks])
  return <svg viewBox="0 0 1000 72" preserveAspectRatio="none" className="clip-waveform" aria-hidden="true" style={{ opacity: muted ? .25 : .85 }}>
    <path d="M0,36H1000" stroke={color} strokeWidth=".4" opacity=".3" />
    <path d={path} stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
  </svg>
})
