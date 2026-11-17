import { Select } from '../shared/Select'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId()
  return <section className="clip-settings-group" aria-labelledby={id}>
    <div className="clip-settings-group-heading"><h3 id={id}>{title}</h3>{description && <p>{description}</p>}</div>
    <div>{children}</div>
  </section>
}

export function SettingsRow({ title, description, children, htmlFor }: { title: string; description?: ReactNode; children?: ReactNode; htmlFor?: string }) {
  return <div className="clip-settings-row">
    <div className="clip-settings-label">{htmlFor ? <label htmlFor={htmlFor}>{title}</label> : <span>{title}</span>}{description && <p>{description}</p>}</div>
    {children && <div className="clip-settings-control">{children}</div>}
  </div>
}

export function SettingsToggle({ title, description, checked, onChange, disabled = false, id }: { title: string; description?: string; checked: boolean; onChange: () => void; disabled?: boolean; id?: string }) {
  const generatedId = useId(), controlId = id || generatedId
  return <SettingsRow title={title} description={description} htmlFor={controlId}>
    <button id={controlId} type="button" className="clip-settings-switch" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={onChange}><span aria-hidden="true" /></button>
  </SettingsRow>
}

type SelectOption = { value: string; label: string }
export function SettingsSelect({ title, description, value, options, groups, onChange, id, disabled = false }: { title: string; description?: ReactNode; value: string; options: SelectOption[]; groups?: { label: string; options: SelectOption[] }[]; onChange: (value: string) => void; id?: string; disabled?: boolean }) {
  const generatedId = useId(), controlId = id || generatedId
  return <SettingsRow title={title} description={description} htmlFor={controlId}>
    <div className="clip-settings-select"><Select id={controlId} aria-label={title} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}{groups?.map(group => <optgroup label={group.label} key={group.label}>{group.options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>)}</Select><ChevronDown size={12} aria-hidden="true" /></div>
  </SettingsRow>
}

export function SettingsRange({ title, description, value, min = 0, max = 100, unit = '%', disabled = false, onChange, onPreview, id }: { title: string; description?: string; value: number; min?: number; max?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void; onPreview?: (value: number) => void; id?: string }) {
  const generatedId = useId(), controlId = id || generatedId
  const [draft, setDraft] = useState(value)
  const pending = useRef(value), dirty = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>()
  const change = useRef(onChange); change.current = onChange
  const commit = () => { clearTimeout(timer.current); if (dirty.current) { dirty.current = false; change.current(pending.current) } }
  useEffect(() => { if (!dirty.current) { pending.current = value; setDraft(value) } }, [value])
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current) change.current(pending.current) }, [])
  const preview = (next: number) => {
    pending.current = next; dirty.current = true; setDraft(next); onPreview?.(next)
    clearTimeout(timer.current); timer.current = setTimeout(commit, 180)
  }
  return <SettingsRow title={title} description={description} htmlFor={controlId}>
    <div className="clip-settings-range"><input id={controlId} type="range" min={min} max={max} value={draft} disabled={disabled} onChange={event => preview(Number(event.target.value))} onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} /><output htmlFor={controlId}>{draft}{unit}</output></div>
  </SettingsRow>
}

export function SettingsChoices({ label, value, options, onChange, id }: { label: string; value: string; options: { value: string; label: string; detail?: string }[]; onChange: (value: string) => void; id?: string }) {
  return <div className="clip-settings-choices" role="group" aria-label={label} id={id}>
    {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => { if (value !== option.value) onChange(option.value) }}><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</button>)}
  </div>
}
