import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { virtualRows, type VirtualRows } from '../../services/virtualRows'

interface Props<T> {
  items: T[]
  scrollRef: RefObject<HTMLDivElement>
  resetKey: string
  className: string
  children: (item: T) => ReactNode
}

export function WindowedGrid<T>({items, scrollRef, resetKey, className, children}: Props<T>) {
  const grid = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<VirtualRows>({start: 0, end: Math.min(48, items.length), before: 0, after: 0})
  const current = useRef(range)
  const previousKey = useRef(resetKey)
  const count = items.length

  useLayoutEffect(() => {
    const root = grid.current
    // Child layout effects can run before React attaches an ancestor's ref.
    const scroll = scrollRef.current || root?.closest<HTMLDivElement>('[data-windowed-scroll]')
    if (!root || !scroll || !count) return
    if (previousKey.current !== resetKey) {
      previousKey.current = resetKey
      scroll.scrollTop = 0
    }
    let frame = 0, active = true
    let rowHeight = 0, columns = 1, gap = 0, offset = 0
    const update = (sync = false) => {
      const old = current.current
      const top = scroll.scrollTop - offset
      if (sync) {
        const needed = virtualRows(count, columns, rowHeight, gap, top, scroll.clientHeight, 2)
        if (old.start <= needed.start && old.end >= needed.end) return
      }
      // Keep a wider buffer until its safety margin runs out. Replacing cards
      // on every crossed row would put avoidable React work in scrolling frames.
      const next = virtualRows(count, columns, rowHeight, gap, top, scroll.clientHeight, 6)
      if (old.start === next.start && old.end === next.end && old.before === next.before && old.after === next.after) return
      current.current = next
      // Commit only when the buffered row range changes, never for each scroll pixel.
      if (sync) flushSync(() => setRange(next))
      else setRange(next)
    }
    const measure = () => {
      if (!active) return
      const first = [...root.children].find(node => !node.hasAttribute('data-grid-spacer')) as HTMLElement | undefined
      if (!first) return
      const style = getComputedStyle(root)
      rowHeight = first.getBoundingClientRect().height
      columns = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1
      gap = Number.parseFloat(style.rowGap) || 0
      offset = root.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientTop + scroll.scrollTop
      update()
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {frame = 0; if (active) update(true)})
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(scroll)
    const first = [...root.children].find(node => !node.hasAttribute('data-grid-spacer'))
    if (first) observer.observe(first)
    void document.fonts?.ready.then(measure)
    scroll.addEventListener('scroll', onScroll, {passive: true})
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      scroll.removeEventListener('scroll', onScroll)
    }
  }, [count, resetKey, scrollRef])

  // New search results must provide a measurable card even when the previous range was far down.
  const visible = range.start < count ? range : {start: 0, end: Math.min(48, count), before: 0, after: 0}
  return <div ref={grid} className={className} data-windowed-grid data-total-items={count}>
    {visible.before > 0 && <div data-grid-spacer aria-hidden="true" style={{gridColumn: '1 / -1', height: visible.before, pointerEvents: 'none'}}/>}
    {items.slice(visible.start, visible.end).map(children)}
    {visible.after > 0 && <div data-grid-spacer aria-hidden="true" style={{gridColumn: '1 / -1', height: visible.after, pointerEvents: 'none'}}/>}
  </div>
}
