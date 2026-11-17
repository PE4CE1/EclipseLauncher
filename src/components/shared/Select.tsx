import { Children, Fragment, forwardRef, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import './select.css'

interface Option { value: string; label: string; disabled: boolean; group?: string; data: Record<string, unknown> }
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  triggerProps?: ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, unknown>
  menuClassName?: string
}
function text(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join('')
}
function entries(children: ReactNode, group?: string, disabled = false): Option[] {
  const options: Option[] = []
  Children.forEach(children, child => {
    if (!isValidElement<any>(child)) return
    if (child.type === Fragment) options.push(...entries(child.props.children, group, disabled))
    if (child.type === 'optgroup') options.push(...entries(child.props.children, child.props.label, disabled || child.props.disabled))
    if (child.type === 'option' && !child.props.hidden) {
      const label = String(child.props.label ?? text(child.props.children))
      options.push({ value: String(child.props.value ?? label), label, disabled: disabled || !!child.props.disabled, group,
        data: Object.fromEntries(Object.entries(child.props).filter(([key]) => key.startsWith('data-'))) })
    }
  })
  return options
}

/** Keep native form/change semantics while rendering a single consistent, accessible menu. */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ children, value, defaultValue, onChange, className = '', style, id, disabled, autoFocus, tabIndex, triggerProps, menuClassName = '', ...props }, forwarded) {
  const native = useRef<HTMLSelectElement | null>(null), anchor = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const generated = useId(), menuId = generated + '-options', [draft, setDraft] = useState(String(value ?? defaultValue ?? ''))
  const [open, setOpen] = useState(false), [present, setPresent] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 180, maxHeight: 320, above: false })
  const [label, setLabel] = useState<string>()
  const options = useMemo(() => entries(children), [children]), typed = useRef({ text: '', time: 0 })
  const groups = useMemo(() => {
    const result: { label?: string; options: Option[] }[] = []
    for (const option of options) {
      const last = result[result.length - 1]
      if (last && last.label === option.group) last.options.push(option)
      else result.push({ label: option.group, options: [option] })
    }
    return result
  }, [options])
  const current = String(value ?? draft), selected = options.find(option => option.value === current) || options[0]
  const close = (restore = false) => {
    if (menu.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
    setOpen(false)
    if (restore) anchor.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (props['aria-label'] || props['aria-labelledby']) return
    const labels = id ? [...document.querySelectorAll<HTMLLabelElement>('label[for]')].filter(item => item.htmlFor === id) : []
    const parent = anchor.current?.closest('label')
    setLabel(labels.map(item => item.textContent).join(' ') || parent?.querySelector('span')?.textContent || undefined)
  }, [id, props['aria-label'], props['aria-labelledby']])
  useLayoutEffect(() => {
    if (!open) return
    if (disabled) { close(); return }
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect(); if (!rect) return
      const labelWidth = Math.min(420, Math.max(160, ...options.map(option => option.label.length * 6.2 + 44)))
      const width = Math.min(Math.max(rect.width, labelWidth), window.innerWidth - 24), below = window.innerHeight - rect.bottom - 12
      const above = below < 180 && rect.top > below, maxHeight = Math.max(40, Math.min(340, above ? rect.top - 18 : below - 6))
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: above ? rect.top - 6 : rect.bottom + 6, width, maxHeight, above })
    }
    place(); setPresent(true)
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) place() }
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !anchor.current?.contains(event.target) && !menu.current?.contains(event.target)) close() }
    window.addEventListener('resize', place); window.addEventListener('scroll', scroll, true); document.addEventListener('pointerdown', outside, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true); document.removeEventListener('pointerdown', outside, true) }
  }, [open, disabled])
  useLayoutEffect(() => {
    if (menu.current) menu.current.inert = !open
    if (open && present) {
      const node = menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') || menu.current?.querySelector<HTMLButtonElement>('[role=option]:not(:disabled)')
      node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, present])
  useEffect(() => { if (open || !present) return; const timer = setTimeout(() => setPresent(false), 140); return () => clearTimeout(timer) }, [open, present])
  const choose = (option: Option) => {
    if (option.disabled || !native.current) return
    if (native.current.value !== option.value) {
      native.current.value = option.value
      native.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
    close(true)
  }
  const keyboard = (event: React.KeyboardEvent) => {
    const buttons = [...menu.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)') || []]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      const option = options.find(option => option.value === buttons[index].dataset.selectValue)
      if (option) { event.preventDefault(); choose(option) }
      return
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    let next = -1
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
      typed.current = { text: (Date.now() - typed.current.time < 600 ? typed.current.text : '') + event.key.toLocaleLowerCase(), time: Date.now() }
      next = buttons.findIndex(button => button.textContent?.toLocaleLowerCase().startsWith(typed.current.text))
    }
    if (next >= 0) { event.preventDefault(); buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: 'nearest' }) }
  }
  const portalHost = anchor.current?.closest<HTMLElement>(':fullscreen') || document.body
  return <>
    <select {...props} ref={node => { native.current = node; if (typeof forwarded === 'function') forwarded(node); else if (forwarded) forwarded.current = node }} id={id ? id + '-native' : undefined}
      value={value} defaultValue={defaultValue} disabled={disabled} aria-hidden="true" tabIndex={-1} style={{ display: 'none' }}
      onClick={() => { if (!disabled) setOpen(current => !current) }}
      onChange={event => { setDraft(event.target.value); onChange?.(event) }}>{children}</select>
    <button {...triggerProps} ref={anchor} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={present ? menuId : undefined}
      aria-label={props['aria-label'] || label || props.title} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']}
      aria-required={props.required || undefined} aria-invalid={props['aria-invalid']}
      disabled={disabled} autoFocus={autoFocus} tabIndex={tabIndex} className={`app-select-trigger ${className} ${triggerProps?.className || ''}`} style={style}
      data-select-trigger={id || props['aria-label'] || ''} onClick={() => setOpen(current => !current)}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(current => event.key === 'Enter' || event.key === ' ' ? !current : true) } }}>
      <span>{selected?.label || ''}</span><ChevronDown size={13} aria-hidden="true"/>
    </button>
    {present && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={props['aria-label'] || label || props.title} aria-hidden={!open}
      data-app-select-menu data-state={open ? 'open' : 'closing'} data-above={position.above || undefined} className={`app-select-menu ${menuClassName}`}
      style={{ left: position.left, top: position.above ? undefined : position.top, bottom: position.above ? window.innerHeight - position.top : undefined, width: position.width, maxHeight: position.maxHeight }} onKeyDown={keyboard}>
      {groups.map((group, groupIndex) => <div key={groupIndex} role={group.label ? 'group' : undefined} aria-label={group.label}>
        {group.label && <div className="app-select-heading">{group.label}</div>}
        {group.options.map((option, index) =>
        <button key={option.value+':'+index} {...option.data} type="button" role="option" tabIndex={-1} disabled={option.disabled} title={option.label} aria-selected={selected?.value === option.value} data-select-value={option.value} onClick={() => choose(option)}>
          <span>{option.label}</span>{selected?.value === option.value && <Check size={13} aria-hidden="true"/>}
        </button>
        )}
      </div>)}
    </div>, portalHost)}
  </>
})
