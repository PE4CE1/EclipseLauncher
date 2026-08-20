// Full crosshair system: presets + custom CS2/Valorant-style editor

export type CrosshairConfig = {
  preset: string
  color: string
  size: number        // arm length
  thickness: number
  gap: number
  dot: boolean
  dotSize: number
  outline: boolean
  outlineColor: string
  opacity: number
  tStyle: boolean     // remove top arm
  style: 'cross' | 'x' | 'circle'
  offsetX?: number
  offsetY?: number
}

export const CROSSHAIR_PRESETS: Record<string, Partial<CrosshairConfig> & { label: string }> = {
  classic:      { label: 'Klassisch',         size: 8,  thickness: 1, gap: 3,  dot: false, dotSize: 0, tStyle: false, style: 'cross' },
  classicDot:   { label: 'Klassisch + Punkt', size: 8,  thickness: 1, gap: 3,  dot: true,  dotSize: 2, tStyle: false, style: 'cross' },
  small:        { label: 'Klein',             size: 4,  thickness: 1, gap: 2,  dot: false, dotSize: 0, tStyle: false, style: 'cross' },
  dot:          { label: 'Nur Punkt',         size: 0,  thickness: 0, gap: 0,  dot: true,  dotSize: 3, tStyle: false, style: 'cross' },
  cs2:          { label: 'CS2',               size: 7,  thickness: 1, gap: 3,  dot: true,  dotSize: 2, tStyle: false, style: 'cross' },
  valorant:     { label: 'Valorant',          size: 5,  thickness: 2, gap: 2,  dot: false, dotSize: 0, tStyle: false, style: 'cross' },
  tStyle:       { label: 'T-Form',            size: 8,  thickness: 1, gap: 3,  dot: false, dotSize: 0, tStyle: true,  style: 'cross' },
  circle:       { label: 'Kreis',             size: 12, thickness: 1, gap: 0,  dot: false, dotSize: 0, tStyle: false, style: 'circle' },
  circleDot:    { label: 'Kreis + Punkt',     size: 12, thickness: 1, gap: 0,  dot: true,  dotSize: 2, tStyle: false, style: 'circle' },
  x:            { label: 'X-Form',            size: 7,  thickness: 1, gap: 3,  dot: false, dotSize: 0, tStyle: false, style: 'x' },
  large:        { label: 'Groß',              size: 14, thickness: 2, gap: 5,  dot: false, dotSize: 0, tStyle: false, style: 'cross' },
  sniper:       { label: 'Scharfschütze',     size: 22, thickness: 1, gap: 8,  dot: true,  dotSize: 1, tStyle: false, style: 'cross' },
}

export const DEFAULT_CROSSHAIR: CrosshairConfig = {
  preset: 'cs2',
  color: '#00ff88',
  size: 7,
  thickness: 1,
  gap: 3,
  dot: true,
  dotSize: 2,
  outline: false,
  outlineColor: '#000000',
  opacity: 0.95,
  tStyle: false,
  style: 'cross',
  offsetX: 0,
  offsetY: 0,
}

function buildConfig(config?: Partial<CrosshairConfig>): CrosshairConfig {
  const base = { ...DEFAULT_CROSSHAIR, ...config }
  // Apply preset values if a known preset is selected
  if (base.preset && base.preset !== 'custom' && CROSSHAIR_PRESETS[base.preset]) {
    return { ...DEFAULT_CROSSHAIR, ...CROSSHAIR_PRESETS[base.preset], ...config, preset: base.preset }
  }
  return base
}

export function CrosshairSVG({ cfg, size: svgSize = 80 }: { cfg: CrosshairConfig; size?: number }) {
  const cx = svgSize / 2
  const cy = svgSize / 2
  const { color, thickness, gap, dot, dotSize, outline, outlineColor, opacity, tStyle, style, size: armLen } = cfg
  const outW = thickness + 2

  if (style === 'circle') {
    return (
      <svg width={svgSize} height={svgSize} style={{ display: 'block' }}>
        {outline && <circle cx={cx} cy={cy} r={armLen} stroke={outlineColor} strokeWidth={outW} fill="none" opacity={opacity} />}
        <circle cx={cx} cy={cy} r={armLen} stroke={color} strokeWidth={thickness} fill="none" opacity={opacity} />
        {dot && dotSize > 0 && (
          <>
            {outline && <circle cx={cx} cy={cy} r={dotSize + 1} fill={outlineColor} opacity={opacity} />}
            <circle cx={cx} cy={cy} r={dotSize} fill={color} opacity={opacity} />
          </>
        )}
      </svg>
    )
  }

  if (style === 'x') {
    const g = gap
    const l = armLen
    return (
      <svg width={svgSize} height={svgSize} style={{ display: 'block' }}>
        {outline && <>
          <line x1={cx - g - l} y1={cy - g - l} x2={cx - g} y2={cy - g} stroke={outlineColor} strokeWidth={outW} strokeLinecap="round" opacity={opacity} />
          <line x1={cx + g} y1={cy - g - l} x2={cx + g + l} y2={cy - g} stroke={outlineColor} strokeWidth={outW} strokeLinecap="round" opacity={opacity} />
          <line x1={cx - g - l} y1={cy + g + l} x2={cx - g} y2={cy + g} stroke={outlineColor} strokeWidth={outW} strokeLinecap="round" opacity={opacity} />
          <line x1={cx + g} y1={cy + g + l} x2={cx + g + l} y2={cy + g} stroke={outlineColor} strokeWidth={outW} strokeLinecap="round" opacity={opacity} />
        </>}
        <line x1={cx - g - l} y1={cy - g - l} x2={cx - g} y2={cy - g} stroke={color} strokeWidth={thickness} strokeLinecap="round" opacity={opacity} />
        <line x1={cx + g} y1={cy - g - l} x2={cx + g + l} y2={cy - g} stroke={color} strokeWidth={thickness} strokeLinecap="round" opacity={opacity} />
        <line x1={cx - g - l} y1={cy + g + l} x2={cx - g} y2={cy + g} stroke={color} strokeWidth={thickness} strokeLinecap="round" opacity={opacity} />
        <line x1={cx + g} y1={cy + g + l} x2={cx + g + l} y2={cy + g} stroke={color} strokeWidth={thickness} strokeLinecap="round" opacity={opacity} />
      </svg>
    )
  }

  // Standard cross
  const arms = [
    !tStyle && { x1: cx, y1: cy - gap - armLen, x2: cx, y2: cy - gap }, // top
    { x1: cx, y1: cy + gap, x2: cx, y2: cy + gap + armLen },             // bottom
    { x1: cx - gap - armLen, y1: cy, x2: cx - gap, y2: cy },             // left
    { x1: cx + gap, y1: cy, x2: cx + gap + armLen, y2: cy },             // right
  ].filter(Boolean) as { x1: number; y1: number; x2: number; y2: number }[]

  return (
    <svg width={svgSize} height={svgSize} style={{ display: 'block' }}>
      {/* Outline pass */}
      {outline && arms.map((a, i) => (
        <line key={`out-${i}`} {...a} stroke={outlineColor} strokeWidth={outW} strokeLinecap="round" opacity={opacity} />
      ))}
      {/* Color pass */}
      {arms.map((a, i) => (
        <line key={`arm-${i}`} {...a} stroke={color} strokeWidth={thickness} strokeLinecap="round" opacity={opacity} />
      ))}
      {/* Dot */}
      {dot && dotSize > 0 && <>
        {outline && <circle cx={cx} cy={cy} r={dotSize + 1} fill={outlineColor} opacity={opacity} />}
        <circle cx={cx} cy={cy} r={dotSize} fill={color} opacity={opacity} />
      </>}
    </svg>
  )
}

export function Crosshair({ config }: { config?: Partial<CrosshairConfig> }) {
  const cfg = buildConfig(config)
  const ox = cfg.offsetX || 0
  const oy = cfg.offsetY || 0
  return (
    <div style={{
      transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 80,
      height: 80,
      lineHeight: 0,
      fontSize: 0,
    }}>
      <CrosshairSVG cfg={cfg} size={80} />
    </div>
  )
}
