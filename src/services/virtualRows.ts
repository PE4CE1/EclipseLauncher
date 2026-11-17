export interface VirtualRows {
  start: number
  end: number
  before: number
  after: number
}

/** Spacer rows include the grid's own gaps so its total height never changes. */
export function virtualRows(count: number, columns: number, height: number, gap: number, top: number, viewport: number, overscan = 3): VirtualRows {
  const cols = Math.max(1, Math.floor(columns)), rows = Math.ceil(Math.max(0, count) / cols)
  if (!rows || !Number.isFinite(height) || height <= 0) return {start: 0, end: Math.min(count, 48), before: 0, after: 0}
  const spacing = Math.max(0, gap), stride = height + spacing
  const first = Math.max(0, Math.min(rows - 1, Math.floor(Math.max(0, top) / stride)))
  const startRow = Math.max(0, first - overscan)
  const endRow = Math.min(rows, Math.max(first + 1, Math.ceil((Math.max(0, top) + viewport) / stride)) + overscan)
  return {
    start: startRow * cols,
    end: Math.min(count, endRow * cols),
    before: startRow ? startRow * stride - spacing : 0,
    after: endRow < rows ? (rows - endRow) * stride - spacing : 0,
  }
}
