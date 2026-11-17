import { useMemo } from 'react'
import { AppWindow, Check, Loader2, Monitor } from 'lucide-react'
import { SettingsGroup, SettingsSelect } from './ClipSettingsControls'

export type CaptureSource = { id: string; name: string; thumbnail?: string }

export function ClipCaptureSources({ sources, selectedId, loading, de, onChange }: {
  sources: CaptureSource[]
  selectedId?: string
  loading: boolean
  de: boolean
  onChange: (id: string) => void
}) {
  const groups = useMemo(() => {
    const displays = sources.filter(source => source.id.startsWith('screen:')).map((source, index) => {
      // Electron supplies generic display names in the OS language, independent
      // of Eclipse's language. Keep their number and localize the label here.
      const number = /^(?:screen|display|bildschirm|monitor)\s*(\d+)\s*$/i.exec(source.name)?.[1] || String(index + 1)
      return { ...source, name: (de ? 'Bildschirm ' : 'Display ') + number }
    })
    const programs = sources.filter(source => source.id.startsWith('window:')).map((source, index) => ({
      ...source, name: source.name.trim() || (de ? 'Programm ' : 'Program ') + (index + 1),
    }))
    return [
      { id: 'displays', label: de ? 'Bildschirme' : 'Displays', description: de ? 'Den gesamten Bildschirm aufnehmen.' : 'Record an entire display.', sources: displays, icon: Monitor, empty: de ? 'Keine Bildschirme verfügbar.' : 'No displays available.' },
      { id: 'programs', label: de ? 'Programme' : 'Programs', description: de ? 'Nur das ausgewählte Programmfenster aufnehmen.' : 'Record only the selected application window.', sources: programs, icon: AppWindow, empty: de ? 'Keine Programmfenster verfügbar. Öffne ein Programm und aktualisiere die Quellen.' : 'No application windows available. Open an application and refresh sources.' },
    ]
  }, [sources, de])

  const value = selectedId === 'screen:0:0' && !sources.some(source => source.id === selectedId) ? '' : selectedId || ''
  const options = [{ value: '', label: de ? 'Automatisch · Hauptbildschirm' : 'Automatic · primary display' }]
  if (value && !sources.some(source => source.id === value)) options.push({
    value, label: loading ? (de ? 'Quelle wird geladen…' : 'Loading source…') : (de ? 'Gespeicherte Quelle (nicht verfügbar)' : 'Saved source (unavailable)'),
  })

  return <>
    <div className="clip-settings-source-selector">
      <SettingsSelect id="clip-setting-screen" title={de ? 'Aufnahmequelle' : 'Capture source'} value={value} options={options}
        groups={groups.filter(group => group.sources.length).map(group => ({ label: group.label, options: group.sources.map(source => ({ value: source.id, label: source.name })) }))}
        onChange={onChange} />
    </div>
    {loading && <div className="clip-settings-device-loading" role="status"><Loader2 size={14} className="animate-spin" />{de ? 'Quellen werden geladen…' : 'Loading sources…'}</div>}
    {groups.map(group => <div key={group.id} data-capture-source-section={group.id}>
      <SettingsGroup title={group.label} description={group.description}>
        {group.sources.length > 0 ? <div className="clip-settings-displays">
          {group.sources.map(source => <button type="button" key={source.id} data-capture-source={source.id} aria-pressed={value === source.id} title={source.name} onClick={() => onChange(source.id)}>
            {source.thumbnail ? <img src={source.thumbnail} alt="" loading="lazy" decoding="async" /> : <span className="clip-settings-display-placeholder"><group.icon size={25} strokeWidth={1.2} /></span>}
            <span><span className="clip-settings-source-name">{source.name}</span>{value === source.id && <Check size={13} aria-hidden="true" />}</span>
          </button>)}
        </div> : !loading && <p className="clip-settings-source-empty">{group.empty}</p>}
      </SettingsGroup>
    </div>)}
  </>
}
