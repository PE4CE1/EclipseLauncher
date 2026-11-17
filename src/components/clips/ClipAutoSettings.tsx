import { useId, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Keyboard, Loader2, RefreshCw } from 'lucide-react'
import { SmoothCollapse } from '../shared/SmoothCollapse'
import { SettingsGroup as Group, SettingsToggle as Toggle, SettingsSelect as Select } from './ClipSettingsControls'
import type { ClipSettings } from '../../types/game'
import type { AutoClipConnection, AutoClipGameId, AutoClipSetupResult, GsiGameId } from '../../types/autoClips'

function Game({ game, name, source, connection, de, children }: { game: AutoClipGameId; name: string; source: string; connection?: AutoClipConnection; de: boolean; children: ReactNode }) {
  const [open,setOpen]=useState(false), id=useId()
  const state=connection?.state || 'waiting'
  const labels={disabled:de?'Aus':'Off',waiting:de?'Wartet auf Spiel':'Waiting for game',listening:de?'Wartet auf Daten':'Waiting for data',connected:de?'Daten verbunden':'Data connected',error:de?'Einrichtung prüfen':'Check setup',manual:de?'Hotkey-Modus':'Hotkey mode'}
  return <section className="clip-auto-game" data-auto-game={game}>
    <button id={id} className="clip-auto-game-heading" data-auto-expand={game} aria-expanded={open} aria-controls={`${id}-body`} onClick={()=>setOpen(value=>!value)}>
      <ChevronRight size={15} className={open?'is-open':''}/><span><strong>{name}</strong><small>{source}</small></span><em data-state={state}>{labels[state]}</em>
    </button>
    <SmoothCollapse open={open}><div id={`${id}-body`} role="region" aria-labelledby={id} className="clip-auto-game-body">{children}</div></SmoothCollapse>
  </section>
}

export function ClipAutoSettings({settings,setSettings,de,onHotkeys}:{settings:ClipSettings;setSettings:(patch:Partial<ClipSettings>)=>void;de:boolean;onHotkeys:()=>void}) {
  const client=useQueryClient(),[working,setWorking]=useState<GsiGameId|null>(null),[setup,setSetup]=useState<{id:GsiGameId;result:AutoClipSetupResult}|null>(null)
  const {data,status}=useQuery({queryKey:['clip-auto-status'],queryFn:async()=>await window.electronAPI?.clips?.getAutoClipStatus?.()||null,refetchInterval:2000,refetchOnWindowFocus:false,retry:false})
  const master=settings.enabled&&settings.autoClipEnabled===true
  const duration=(game:'rocket-league'|'overwatch')=>{
    const field=game==='overwatch'?'overwatchClipDurationSeconds':'rocketLeagueClipDurationSeconds'
    return <Select id={`clip-profile-duration-${game}`} title={de?'Cliplänge für dieses Spiel':'Clip length for this game'} description={de?'Gilt für Tastenkürzel und automatische Clips, sobald dieses Spiel aufgenommen wird.':'Used for shortcut and automatic clips while recording this game.'} value={String(settings[field]||0)} options={[{value:'0',label:de?'Globale Einstellung':'Global setting'},...[15,30,45,60,90,120].map(seconds=>({value:String(seconds),label:seconds+'s'}))]} onChange={value=>setSettings({[field]:Number(value)})}/>
  }
  const players=data?.rocketLeaguePlayers||[]
  const selectedId=settings.autoClipRocketLeaguePlayerId||''
  const setupButton=(id:GsiGameId)=><>
    <button className="clip-settings-button" data-auto-setup={id} disabled={working!==null} onClick={async()=>{
      setWorking(id);setSetup(null)
      try{const result=await window.electronAPI?.clips?.setupAutoClipGame?.(id);setSetup({id,result:result||{success:false,error:'configuration'}});await client.invalidateQueries({queryKey:['clip-auto-status']})}
      catch{setSetup({id,result:{success:false,error:'configuration'}})}finally{setWorking(null)}
    }}>{working===id?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>} {de?'Verbindung einrichten / prüfen':'Set up / check connection'}</button>
    {setup?.id===id&&<p className="clip-settings-note" role="status">{setup.result.success?(setup.result.changed?(de?'Konfiguration gespeichert. Starte das Spiel neu.':'Configuration saved. Restart the game.'):(de?'Konfiguration ist vorhanden. Die Verbindung wird beim Spielen geprüft.':'Configuration exists. The connection is checked while playing.')):setup.result.error==='not-installed'?(de?'Die Steam-Installation dieses Spiels wurde nicht gefunden.':'This game’s Steam installation was not found.'):(de?'Die Verbindung konnte nicht eingerichtet werden. Bestehende fremde Konfigurationen werden nicht überschrieben.':'Unable to set up the connection. Existing third-party configurations are not overwritten.')}</p>}
  </>
  const detail=(id:AutoClipGameId)=>{
    const value=data?.games?.[id]?.detail
    const text=value==='restart'?(de?'Neue Konfiguration: Spiel neu starten.':'New configuration: restart the game.')
      :value==='not-installed'?(de?'Steam-Spielordner nicht gefunden.':'Steam game folder not found.')
      :value==='port-busy'?(de?'Der lokale Anschluss wird bereits verwendet.':'The local port is already in use.')
      :value==='certificate'?(de?'Das Zertifikat der lokalen Riot-Verbindung konnte nicht bestätigt werden.':'Unable to verify the local Riot connection certificate.')
      :value==='select-player'?(de?'Daten empfangen. Wähle unten deinen eigenen Spieler aus.':'Receiving data. Select your own player below.')
      :value==='connection'?(de?'Noch keine lokale Datenverbindung. Starte ein Match und prüfe die Einrichtung.':'No local data connection yet. Start a match and check setup.') :''
    return text&&<p className="clip-settings-note" role="status">{text}</p>
  }
  const hotkeys=<button className="clip-settings-button" onClick={onHotkeys}><Keyboard size={12}/>{de?'Clip-Tastenkürzel ansehen':'View clip shortcut'} · {settings.hotkey||'F8'}</button>
  return <>
    <Group title={de?'Spielereignisse':'Game events'}><Toggle id="clip-setting-autoclip" title={de?'Automatische Clips aktivieren':'Enable automatic clips'} description={de?'Speichert eigene Ereignisse über lokale Datenschnittstellen. Der Replay-Buffer muss laufen.':'Saves your own events through local data interfaces. The replay buffer must be running.'} checked={settings.autoClipEnabled===true} onChange={()=>setSettings({autoClipEnabled:!settings.autoClipEnabled})}/></Group>
    {status==='error'&&<p className="clip-settings-note" role="status">{de?'Verbindungsstatus nicht verfügbar. Starte Eclipse vollständig neu.':'Connection status unavailable. Restart Eclipse completely.'}</p>}
    <Game game="cs2" name="Counter-Strike 2" source="Valve Game State Integration" connection={data?.games?.cs2} de={de}>
      <Toggle id="auto-cs2-enabled" title={de?'Automatische Clips für CS2':'Automatic clips for CS2'} checked={settings.autoClipCS2Enabled!==false} disabled={!master} onChange={()=>setSettings({autoClipCS2Enabled:settings.autoClipCS2Enabled===false})}/>
      <Toggle title={de?'Eigene Kills & Multi-Kills':'Your kills & multi-kills'} checked={settings.autoClipCS2Kills!==false} disabled={!master||settings.autoClipCS2Enabled===false} onChange={()=>setSettings({autoClipCS2Kills:settings.autoClipCS2Kills===false})}/>
      <Toggle title={de?'Eigene Rundensiege':'Your round wins'} checked={settings.autoClipCS2Wins===true} disabled={!master||settings.autoClipCS2Enabled===false} onChange={()=>setSettings({autoClipCS2Wins:!settings.autoClipCS2Wins})}/>
      <p className="clip-settings-note">{de?'CS2 sendet Daten an Eclipse auf diesem PC. Zuschauer und fremde Spieler werden nicht als eigene Highlights gewertet. Nach der ersten Einrichtung das Spiel neu starten.':'CS2 sends data to Eclipse on this PC. Spectators and other players are not counted as your highlights. Restart the game after initial setup.'}</p>{detail('cs2')}{setupButton('cs2')}
    </Game>
    <Game game="rocket-league" name="Rocket League" source={de?'Offizielle Rocket League StatsAPI':'Official Rocket League StatsAPI'} connection={data?.games?.['rocket-league']} de={de}>
      <Toggle id="auto-rocket-league-enabled" title={de?'Automatische Clips für Rocket League':'Automatic clips for Rocket League'} checked={settings.autoClipRocketLeagueEnabled===true} disabled={!master} onChange={()=>setSettings({autoClipRocketLeagueEnabled:!settings.autoClipRocketLeagueEnabled})}/>
      <Select id="auto-rocket-league-player" title={de?'Dein Spieler':'Your player'} description={de?'Wähle während eines Matches deinen eigenen Namen aus. Die Zuordnung bleibt über deine Plattform-ID erhalten. Die Kameraperspektive wird dafür nicht verwendet.':'Select your own name during a match. Your platform ID preserves the selection. Camera perspective is not used for identification.'} value={selectedId} options={[{value:'',label:de?'Im Match auswählen …':'Select in a match …'},...(selectedId&&!players.some(player=>player.id===selectedId)?[{value:selectedId,label:de?'Gespeicherter Spieler (offline)':'Saved player (offline)'}]:[]),...players.map(player=>({value:player.id,label:player.name}))]} onChange={value=>setSettings({autoClipRocketLeaguePlayerId:value})}/>
      <Toggle title={de?'Eigene Tore':'Your goals'} checked={settings.autoClipRocketLeagueGoals!==false} disabled={!master||!settings.autoClipRocketLeagueEnabled} onChange={()=>setSettings({autoClipRocketLeagueGoals:settings.autoClipRocketLeagueGoals===false})}/>
      <Toggle title={de?'Eigene Paraden':'Your saves'} checked={settings.autoClipRocketLeagueSaves!==false} disabled={!master||!settings.autoClipRocketLeagueEnabled} onChange={()=>setSettings({autoClipRocketLeagueSaves:settings.autoClipRocketLeagueSaves===false})}/>
      <Toggle title={de?'Eigene Demolierungen':'Your demolitions'} checked={settings.autoClipRocketLeagueDemos===true} disabled={!master||!settings.autoClipRocketLeagueEnabled} onChange={()=>setSettings({autoClipRocketLeagueDemos:!settings.autoClipRocketLeagueDemos})}/>
      <Toggle title={de?'Eigene Spielsiege':'Your match wins'} checked={settings.autoClipRocketLeagueWins!==false} disabled={!master||!settings.autoClipRocketLeagueEnabled} onChange={()=>setSettings({autoClipRocketLeagueWins:settings.autoClipRocketLeagueWins===false})}/>
      {duration('rocket-league')}{detail('rocket-league')}
      <p className="clip-settings-note">{de?'Einmalige Einrichtung bei geschlossenem Spiel: Im Installationsordner unter TAGame → Config die Datei TAStatsAPI.ini bearbeiten (falls nicht vorhanden: DefaultStatsAPI.ini). Im folgenden Abschnitt diese Werte setzen, andere Einträge beibehalten und das Spiel neu starten:':'One-time setup with the game closed: in its installation folder, open TAGame → Config → TAStatsAPI.ini (if absent: DefaultStatsAPI.ini). Set these values in the following section, preserve other entries, then restart the game:'}</p>
      <pre className="clip-auto-config">{'[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nPort=0\nWebPort=49124'}</pre>
      <p className="clip-settings-note">{de?'Eclipse liest nur die offizielle lokale Schnittstelle. Easy Anti-Cheat bleibt eingeschaltet. Kein BakkesMod erforderlich. Bei eigener abweichender Port-Konfiguration muss WebPort 49124 verfügbar sein.':'Eclipse only reads the official local interface. Easy Anti-Cheat stays enabled. BakkesMod is not required. If using a custom configuration, WebPort 49124 must be available.'}</p>{hotkeys}
    </Game>
    <Game game="overwatch" name="Overwatch 2" source={de?'Aufnahme per Tastenkürzel':'Shortcut recording'} connection={{state:'manual'}} de={de}>
      {duration('overwatch')}
      <p className="clip-settings-note">{de?'Cliplänge und Tastenkürzel funktionieren mit der bestehenden Bildschirm- und Tonaufnahme. Automatische Kills und Siege erfordern eine für Eclipse freigeschaltete Overwolf-Ereignisanbindung. Diese ist noch nicht eingerichtet; daher werden dafür keine aktiven Schalter angezeigt.':'Clip length and shortcuts work with the existing screen/audio recorder. Automatic kills and wins require an Overwolf event integration enabled for Eclipse. This is not configured yet, so active event toggles are not offered.'}</p>{hotkeys}
    </Game>
    <Game game="dota2" name="Dota 2" source="Valve Game State Integration" connection={data?.games?.dota2} de={de}>
      <Toggle id="auto-dota2-enabled" title={de?'Automatische Clips für Dota 2':'Automatic clips for Dota 2'} checked={settings.autoClipDota2Enabled===true} disabled={!master} onChange={()=>setSettings({autoClipDota2Enabled:!settings.autoClipDota2Enabled})}/>
      <Toggle title={de?'Eigene Kills':'Your kills'} checked={settings.autoClipDota2Kills!==false} disabled={!master||!settings.autoClipDota2Enabled} onChange={()=>setSettings({autoClipDota2Kills:settings.autoClipDota2Kills===false})}/>
      <Toggle title={de?'Eigene Tode':'Your deaths'} checked={settings.autoClipDota2Deaths===true} disabled={!master||!settings.autoClipDota2Enabled} onChange={()=>setSettings({autoClipDota2Deaths:!settings.autoClipDota2Deaths})}/>
      <Toggle title={de?'Spielsiege':'Match wins'} checked={settings.autoClipDota2Wins!==false} disabled={!master||!settings.autoClipDota2Enabled} onChange={()=>setSettings({autoClipDota2Wins:settings.autoClipDota2Wins===false})}/>
      <p className="clip-settings-note">{de?'In Steam unter Eigenschaften → Startoptionen ergänzen:':'In Steam, add under Properties → Launch Options:'} <code>-gamestateintegration</code>. {de?'Danach das Spiel neu starten. Siege werden nur bei ausdrücklich gemeldeter Gewinnerseite erfasst.':'Then restart the game. Wins require an explicit winning-team report.'}</p>{detail('dota2')}{setupButton('dota2')}
    </Game>
    <Game game="lol" name="League of Legends" source="Riot Live Client Data API" connection={data?.games?.lol} de={de}>
      <Toggle id="auto-lol-enabled" title={de?'Automatische Clips für League of Legends':'Automatic clips for League of Legends'} checked={settings.autoClipLoLEnabled===true} disabled={!master} onChange={()=>setSettings({autoClipLoLEnabled:!settings.autoClipLoLEnabled})}/>
      <Toggle title={de?'Eigene Kills & Multi-Kills':'Your kills & multi-kills'} checked={settings.autoClipLoLKills!==false} disabled={!master||!settings.autoClipLoLEnabled} onChange={()=>setSettings({autoClipLoLKills:settings.autoClipLoLKills===false})}/>
      <Toggle title={de?'Eigene Tode':'Your deaths'} checked={settings.autoClipLoLDeaths===true} disabled={!master||!settings.autoClipLoLEnabled} onChange={()=>setSettings({autoClipLoLDeaths:!settings.autoClipLoLDeaths})}/>
      <Toggle title={de?'Gemeldete Spielsiege':'Reported match wins'} checked={settings.autoClipLoLWins!==false} disabled={!master||!settings.autoClipLoLEnabled} onChange={()=>setSettings({autoClipLoLWins:settings.autoClipLoLWins===false})}/>
      <p className="clip-settings-note">{de?'Die lokale Riot-Schnittstelle ist erst im Match verfügbar. Keine Konto-Anmeldung und kein API-Schlüssel erforderlich. Bereits vergangene Ereignisse werden beim Verbinden übersprungen.':'The local Riot interface is available only during a match. No account sign-in or API key required. Past events are skipped on connection.'}</p>{detail('lol')}
      <p className="clip-auto-disclaimer">Eclipse is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
    </Game>
    <Group title={de?'Abstand zwischen Clips':'Time between clips'}><Select id="clip-setting-cooldown" title={de?'Mindestabstand':'Minimum interval'} description={de?'Gilt gemeinsam für automatische Ereignisse und verhindert doppelte Clips.':'Shared by automatic events to prevent duplicate clips.'} value={String(settings.autoClipCooldownSeconds||15)} options={[10,15,20,30].map(value=>({value:String(value),label:value+'s'}))} onChange={value=>setSettings({autoClipCooldownSeconds:Number(value)})}/></Group>
    <p className="clip-settings-note">{de?'Die Erkennung liest lokale Schnittstellen. Sie injiziert keinen Code und liest keinen Spielspeicher. Eine Datenverbindung ist keine Anti-Cheat-Freigabe des Herstellers.':'Detection reads local interfaces. It injects no code and reads no game memory. A data connection is not publisher anti-cheat approval.'}</p>
  </>
}
