import { memo, useState } from 'react'
import { ChevronDown, Monitor } from 'lucide-react'
import type { AppSettings } from '../../types/game'
import { CROSSHAIR_GAMES, getGameCrosshairProfile, patchGameCrosshair, type CrosshairGameId } from '../../services/gameCrosshairs'
import { persistAppSettings } from '../../services/settingsPersistence'
import { useGameStore } from '../../store/gameStore'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import { CrosshairSettings } from './CrosshairSettings'
import valorantIcon from '../../assets/game-icons/valorant.png'
import fortniteIcon from '../../assets/game-icons/fortnite.svg'
import cs2Icon from '../../assets/game-icons/cs2.jpg'
import { CS2StatsSettings } from './CS2StatsSettings'
import { overlayStatus } from '../../services/overlayStatus'

const icons = { valorant: valorantIcon, fortnite: fortniteIcon, cs2: cs2Icon }

export const GameCrosshairSettings = memo(function GameCrosshairSettings({ id, settings, language }: {
  id: CrosshairGameId
  settings: Partial<AppSettings>
  language: string
}) {
  const [open, setOpen] = useState(false)
  const de = language === 'de', game = CROSSHAIR_GAMES.find(game => game.id === id)!
  const profile = getGameCrosshairProfile(settings, id)
  const activeCount = Number(profile.enabled) + Number(id==='cs2'&&settings.overlayCS2Stats===true)
  const panelId = `game-crosshair-panel-${id}`
  // Read the latest store before writing so rapid edits in another game cannot be lost.
  const commit = (patch: Partial<AppSettings>) => persistAppSettings(patchGameCrosshair(useGameStore.getState().settings, id, patch))
  const save = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => { void commit({ [key]: value }) }
  const editorSettings = { ...settings, overlayCrosshair: profile.enabled, crosshairConfig: profile.config, crosshairProfiles: profile.designs }

  return <div id={`overlay-game-${id}`} className="settings-glass-card game-crosshair-settings" data-enabled={activeCount>0}>
    <div className="game-crosshair-header">
      <button type="button" className="game-crosshair-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <span className={`game-crosshair-icon game-crosshair-icon--${id}`}><img src={icons[id]} alt="" width={28} height={28}/></span>
        <span className="game-crosshair-title"><strong>{game.name}</strong><small>{overlayStatus(activeCount,language)}</small></span>
      </button>
      <div className="game-crosshair-actions">
        <button type="button" className="crosshair-expand-icon" aria-label={de ? `${game.name}-Einstellungen` : `${game.name} settings`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}><ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }}/></button>
      </div>
    </div>
    <SmoothCollapse open={open}>{() => <div id={panelId}>
      <div className="game-crosshair-info"><p>{de ? `Eigenes Profil für ${game.name}. Ersetzt im Spiel das allgemeine Fadenkreuz; Größe und Position bleiben unabhängig.` : `Your profile for ${game.name}. Replaces the general crosshair in this game, with its own size and position.`}</p><button type="button" className="overlay-layout-button" disabled={!profile.enabled} onClick={() => void window.electronAPI?.startOverlayEdit(id)}><Monitor size={13}/>{de ? 'Auf Desktop testen' : 'Test on desktop'}</button></div>
      <CrosshairSettings id={`overlay-crosshair-${id}`} settings={editorSettings} save={save} commit={commit} language={language}/>
      {id==='cs2'&&<CS2StatsSettings enabled={settings.overlayCS2Stats===true} language={language}/>}
    </div>}</SmoothCollapse>
  </div>
})
