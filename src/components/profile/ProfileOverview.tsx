import { Select } from '../shared/Select'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, Award, Check, ChevronDown, Clock, Copy, Cpu, Edit3, ExternalLink, Gamepad2, Image, Library, Loader2, Lock, Pin, Search, Settings, Trophy, User, UserPlus, X } from 'lucide-react'
import type { SteamBadge, SteamFavoriteBadge, SteamRecentGame } from '../../types/game'
import { formatProfileTime, profileGameKey, profileSocialUrl, safeProfileMedia, type ProfileGame } from '../../services/profileModel'
import { useUIStore } from '../../store/uiStore'
import { PosterArt } from '../shared/PosterArt'
import { ProfileMedia } from './ProfileMedia'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileActivity } from './ProfileActivity'
import './profile.css'
import {copyText} from '../../services/clipboard'
import {useTranslation} from '../../hooks/useTranslation'

export interface ProfileDisplayGame extends ProfileGame { steamPlaytime?: string }
interface Props {
  language: string; own: boolean; name: string; avatar?: string; banner?: string; bannerPosition?: number; steamFrame?: string | null; steamFrameStatic?: string | null; frameClass: string; bio: string; code?: string
  online: boolean; playing: boolean; status: string; gameName?: string | null; startedAt?: number
  steamUrl?: string; steamLevel?: number; steamGamesCount?: number; favoriteBadge?: SteamFavoriteBadge | null
  discord: string; twitch: string; youtube: string
  showPlaytime: boolean; showSteam: boolean; totalTime: string; libraryCount: number; installedCount: number | string
  games: ProfileDisplayGame[]; topGames: ProfileDisplayGame[]; pinned: ProfileDisplayGame[]; badges: SteamBadge[]; recent: SteamRecentGame[]
  ownSteamIds: number[]
  hardware?: { cpu?: string; gpu?: string; ram?: string; display?: string; os?: string }
  edit: (tab: 'general' | 'banner') => void; savePins: (keys: string[]) => Promise<void>
  back: () => void; addFriend: () => void; alreadyFriend: boolean; sending: boolean; requestSent: boolean
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const {t}=useTranslation()
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle'), timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return <button type="button" className="profile-copy" data-copy-state={state} title={label} aria-label={label} onClick={async () => {
    try { await copyText(value); setState('copied') } catch { setState('error') }
    clearTimeout(timer.current); timer.current = setTimeout(() => setState('idle'), 2200)
  }}><span>{value}</span>{state === 'copied' ? <Check size={12} /> : <Copy size={12} />}<span className={state==='idle'?'sr-only':'profile-copy-feedback'} role="status">{state === 'error' ? t('friendsCopyFailed') : state === 'copied' ? t('friendsCodeCopied') : ''}</span></button>
}

function GameLink({ game, className = '', children }: { game: ProfileGame; className?: string; children: ReactNode }) {
  const open = useUIStore(state => state.openGameDetails)
  return game.steamId ? <button type="button" className={className} onClick={() => open(game.steamId!, game.name)} aria-label={game.name}>{children}</button>
    : <div className={className}>{children}</div>
}

export function ProfileOverview(p: Props) {
  const de = p.language === 'de', tr = (deText: string, en: string) => de ? deText : en
  const [tab, setTab] = useState<'overview' | 'games' | 'badges'>('overview'), [query, setQuery] = useState(''), [sort, setSort] = useState(p.showPlaytime ? 'played' : 'name')
  const [limit, setLimit] = useState(36), [pinMode, setPinMode] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const [sharedOnly, setSharedOnly] = useState(false)
  const shared = useMemo(() => new Set(p.games.filter(game => game.steamId && p.ownSteamIds.includes(game.steamId)).map(profileGameKey)), [p.games, p.ownSteamIds])
  const pins = useMemo(() => new Set(p.pinned.map(profileGameKey)), [p.pinned])
  const games = useMemo(() => p.games.filter(game => (!sharedOnly || shared.has(profileGameKey(game))) && game.name.toLocaleLowerCase(p.language).includes(query.trim().toLocaleLowerCase(p.language))).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, p.language)
    : sort === 'recent' ? b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name) : b.playTimeMinutes - a.playTimeMinutes || a.name.localeCompare(b.name)), [p.games, query, sort, p.language, sharedOnly, shared])
  useEffect(() => { setLimit(36) }, [query, sort, sharedOnly])
  useEffect(() => { if (!p.showSteam && tab === 'badges') setTab('overview'); if (!p.showPlaytime) setSort('name') }, [p.showSteam, p.showPlaytime, tab])
  const selectPins = () => { setPinMode(true); setTab('games') }
  const togglePin = async (game: ProfileGame) => {
    const key = profileGameKey(game), next = pins.has(key) ? [...pins].filter(value => value !== key) : [...pins, key]
    if (next.length > 3 || saving) return
    setSaving(true); setError('')
    try { await p.savePins(next) } catch { setError(tr('Die Auswahl konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Could not save your selection. Please try again.')) } finally { setSaving(false) }
  }
  const showcase = p.pinned.length ? p.pinned : p.showPlaytime ? p.topGames.slice(0, 3) : []
  const recent = useMemo(() => [...p.games].filter(game => game.lastPlayed > 0).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 4), [p.games])
  const steam = p.showSteam && p.steamUrl ? profileSocialUrl(p.steamUrl, 'steam') : undefined
  const playingGame = p.playing ? p.games.find(game => game.name.replace(/[™®]/g, '').trim().toLocaleLowerCase() === p.gameName?.replace(/[™®]/g, '').trim().toLocaleLowerCase()) : undefined
  const settings = () => { useUIStore.getState().setActiveSettingsTab('profile'); useUIStore.getState().setActiveView('settings') }
  const lastPlayed = (value: number) => new Date(value).toLocaleDateString(de ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' })
  const sectionHeader = (title: string, subtitle?: string) => <div className="profile-section-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
  return <div className="profile-layout">
    <header className="profile-hero">
      <div className="profile-cover"><ProfileMedia src={p.banner} position={p.bannerPosition} className="profile-cover-art" /><div className="profile-cover-shade" />
        <span className="profile-cover-label">ECLIPSE <span>/</span> {tr('SPIELERPROFIL', 'PLAYER PROFILE')}</span>
        {p.own && <button type="button" className="profile-cover-edit" onClick={() => p.edit('banner')}><Image size={13} />{tr('Banner ändern', 'Change banner')}</button>}
      </div>
      <div className="profile-identity">
        <ProfileAvatar avatar={p.avatar} name={p.name} frameClass={p.frameClass} steamFrame={p.steamFrame} steamFrameStatic={p.steamFrameStatic} online={p.online} playing={p.playing}/>
        <div className="profile-name"><div className="profile-name-line"><h1>{p.name}</h1>{steam && <a className="profile-steam-link" href={steam} target="_blank" rel="noreferrer" aria-label={tr('Steam-Profil öffnen', 'Open Steam profile')}><ExternalLink size={14} />Steam</a>}</div>
          <p className="profile-presence" data-online={p.online || undefined} data-playing={p.playing || undefined}><span />{p.playing ? <><Gamepad2 size={13} />{tr('Spielt', 'Playing')} <strong>{p.gameName}</strong></> : p.status}</p>
          {p.code && <CopyButton value={p.code} label={tr('Freundescode kopieren', 'Copy friend code')} />}
        </div>
        <div className="profile-actions">{p.own ? <><button type="button" className="profile-button profile-button-primary" onClick={() => p.edit('general')}><Edit3 size={14} />{tr('Profil bearbeiten', 'Edit profile')}</button><button type="button" className="profile-button profile-icon-button" aria-label={tr('Profileinstellungen', 'Profile settings')} onClick={settings}><Settings size={15} /></button></>
          : <>{!p.alreadyFriend && <button type="button" className="profile-button profile-button-primary" onClick={p.addFriend} disabled={p.sending || p.requestSent}>{p.sending ? <Loader2 size={14} className="animate-spin" /> : p.requestSent ? <Check size={14} /> : <UserPlus size={14} />}{p.requestSent ? tr('Anfrage gesendet', 'Request sent') : tr('Freund hinzufügen', 'Add friend')}</button>}<button type="button" className="profile-button" onClick={p.back}><ArrowLeft size={14} />{tr('Mein Profil', 'My profile')}</button></>}</div>
      </div>
      <div className="profile-numbers">
        {p.showPlaytime && <div><Clock size={16} /><strong>{p.totalTime}</strong><span>{tr('in Eclipse gespielt', 'played in Eclipse')}</span></div>}
        <div><Library size={16} /><strong>{p.libraryCount.toLocaleString(de ? 'de-DE' : 'en-US')}</strong><span>{tr('Spiele in der Bibliothek', 'games in library')}</span></div>
        <div><Gamepad2 size={16} /><strong>{p.installedCount}</strong><span>{tr('installiert', 'installed')}</span></div>
        {p.showSteam && p.steamLevel !== undefined && <div><Trophy size={16} /><strong>{p.steamLevel}</strong><span>{tr('Steam-Level', 'Steam level')}</span></div>}
      </div>
    </header>
    <div className="profile-navigation" role="tablist" aria-label={tr('Profilbereiche', 'Profile sections')}>{([
      ['overview', tr('Übersicht', 'Overview'), undefined], ['games', tr('Spiele', 'Games'), p.games.length], ...(p.showSteam && p.badges.length ? [['badges', tr('Abzeichen', 'Badges'), p.badges.length]] : []),
    ] as const).map(([id, title, count]) => <button key={id} type="button" role="tab" id={`profile-tab-${id}`} aria-controls="profile-tabpanel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id as typeof tab)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault(); const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]')], index = buttons.indexOf(event.currentTarget)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next].click(); buttons[next].focus()
    }}>{title}{count !== undefined && <span>{count}</span>}</button>)}</div>
    <div id="profile-tabpanel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="profile-body">
      <main className="profile-main">
        {tab === 'overview' && <>
          {(showcase.length > 0 || p.own) && <section className="profile-section profile-showcase-section"><div className="profile-section-title"><div><h2>{p.pinned.length ? tr('Lieblingsspiele', 'Favorite games') : tr('Meistgespielt', 'Most played')}</h2><p>{p.pinned.length ? tr('Bis zu drei ausgewählte Spiele.', 'Up to three selected games.') : tr('Deine Spielzeit, direkt in Eclipse erfasst.', 'Playtime recorded in Eclipse.')}</p></div>{p.own && <button type="button" className="profile-text-button" onClick={selectPins}><Pin size={13} />{tr('Auswählen', 'Choose games')}</button>}</div>
            <div className="profile-showcase">{showcase.map(game => <GameLink key={profileGameKey(game)} game={game} className="profile-featured-game"><div className="profile-featured-image"><PosterArt game={game} shape="landscape" />{p.pinned.length > 0 && <Pin size={12} />}</div><div className="profile-featured-caption"><h3>{game.name}</h3><p>{p.showPlaytime && game.playTimeMinutes > 0 ? formatProfileTime(game.playTimeMinutes, p.language) : game.platform === 'steam' ? 'Steam' : game.platform === 'epic' ? 'Epic Games' : 'Eclipse'}</p></div></GameLink>)}</div>
            {!showcase.length && <p className="profile-empty">{tr('Wähle bis zu drei Spiele für dein Profil aus.', 'Choose up to three games to feature on your profile.')}</p>}
          </section>}
          {p.showPlaytime && p.topGames.length > 0 && <section className="profile-section">{sectionHeader(tr('Spielzeit', 'Playtime'), tr('In Eclipse erfasst · Steam-Spielzeiten werden separat angezeigt.', 'Recorded in Eclipse · Steam playtime is shown separately.'))}<div className="profile-playtime-list">{p.topGames.slice(0, 5).map((game, index) => <GameLink key={profileGameKey(game)} game={game} className="profile-playtime-row"><span className="profile-position">{String(index + 1).padStart(2, '0')}</span><div className="profile-row-art"><PosterArt game={game} shape="landscape" /></div><div className="profile-row-title"><h3>{game.name}</h3><div className="profile-time-track"><span style={{ width: `${Math.max(1, Math.min(100, game.playTimeMinutes / Math.max(1, p.topGames[0].playTimeMinutes) * 100))}%` }} /></div></div><span className="profile-row-time">{formatProfileTime(game.playTimeMinutes, p.language)}</span>{game.steamId && <ArrowUpRight size={14} className="profile-row-arrow" />}</GameLink>)}</div></section>}
          {p.showPlaytime && recent.length > 0 && <section className="profile-section">{sectionHeader(tr('Zuletzt gespielt', 'Recently played'))}<div className="profile-recent-list">{recent.map(game => <GameLink key={profileGameKey(game)} game={game} className="profile-recent-game"><div className="profile-row-art"><PosterArt game={game} shape="landscape" /></div><div><h3>{game.name}</h3><time dateTime={new Date(game.lastPlayed).toISOString()}>{lastPlayed(game.lastPlayed)}</time></div>{game.steamId && <ArrowUpRight size={14} />}</GameLink>)}</div></section>}
          {p.showSteam && p.recent.length > 0 && <section className="profile-section">{sectionHeader(tr('Zuletzt auf Steam', 'Recently on Steam'))}<div className="profile-recent-list">{p.recent.slice(0, 4).map(game => <GameLink key={game.appId} game={{ id: `steam-${game.appId}`, name: game.name, platform: 'steam', steamId: Number(game.appId) || undefined, installed: false, playTimeMinutes: 0, lastPlayed: 0 }} className="profile-recent-game"><div className="profile-row-art"><PosterArt game={{ id: `steam-${game.appId}`, name: game.name, platform: 'steam', steamId: Number(game.appId) || undefined }} shape="landscape" /></div><div><h3>{game.name}</h3>{p.showPlaytime && <p>{game.playtime}</p>}</div></GameLink>)}</div></section>}
          {!showcase.length && !p.own && <div className="profile-empty"><Gamepad2 size={24} /><h2>{tr('Noch keine Spiele geteilt', 'No games shared yet')}</h2><p>{tr('Dieses Profil hat noch keine öffentlichen Spiele.', 'This profile has no public games yet.')}</p></div>}
        </>}
        {tab === 'games' && <section className="profile-section profile-games-section"><div className="profile-section-title"><div><h2>{tr('Spiele', 'Games')}</h2><p>{pinMode ? tr('Bis zu drei Spiele anheften. Erneut anklicken, um sie zu entfernen.', 'Pin up to three games. Click again to unpin.') : tr('Alle auf diesem Profil verfügbaren Spiele.', 'All games available on this profile.')}</p></div>{p.own && <button type="button" className="profile-text-button" onClick={() => setPinMode(!pinMode)}><Pin size={13} />{pinMode ? `${tr('Fertig', 'Done')} · ${pins.size}/3` : tr('Anheften', 'Pin games')}</button>}</div>
          {error && <p role="alert" className="profile-error">{error}</p>}
          {!p.own && shared.size > 0 && <button type="button" className="profile-shared-filter" aria-pressed={sharedOnly} onClick={() => setSharedOnly(!sharedOnly)}><Gamepad2 size={13}/>{tr('Gemeinsame Spiele', 'Games in common')}<span>{shared.size}</span></button>}
          <div className="profile-games-toolbar"><label className="profile-search"><Search size={15} /><input aria-label={tr('Spiele suchen', 'Search games')} placeholder={tr('Spiele suchen …', 'Search games …')} value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label={tr('Suche löschen', 'Clear search')} onClick={() => setQuery('')}><X size={13} /></button>}</label><Select aria-label={tr('Spiele sortieren', 'Sort games')} value={sort} onChange={event => setSort(event.target.value)}>{p.showPlaytime && <option value="played">{tr('Spielzeit', 'Playtime')}</option>}<option value="name">{tr('Name', 'Name')}</option>{p.showPlaytime && <option value="recent">{tr('Zuletzt gespielt', 'Recently played')}</option>}</Select></div>
          <div className="profile-games-grid">{games.slice(0, limit).map(game => <article key={profileGameKey(game)} className="profile-game-tile"><GameLink game={game} className="profile-game-cover"><PosterArt game={game} />{p.own && game.installed && <span className="profile-installed-dot" title={tr('Installiert', 'Installed')} />}</GameLink><h3>{game.name}</h3><p>{p.showPlaytime && (game.playTimeMinutes > 0 || game.steamPlaytime) ? game.steamPlaytime || formatProfileTime(game.playTimeMinutes, p.language) : game.platform === 'steam' ? 'Steam' : game.platform === 'epic' ? 'Epic Games' : 'Eclipse'}</p>{p.own && pinMode && <button type="button" className="profile-pin-button" aria-pressed={pins.has(profileGameKey(game))} disabled={saving || (!pins.has(profileGameKey(game)) && pins.size >= 3)} onClick={() => void togglePin(game)}>{pins.has(profileGameKey(game)) ? <Check size={12} /> : <Pin size={12} />}{pins.has(profileGameKey(game)) ? tr('Angeheftet', 'Pinned') : tr('Anheften', 'Pin')}</button>}</article>)}</div>
          {!games.length && <p className="profile-empty">{tr('Keine Spiele gefunden.', 'No games found.')}</p>}{games.length > limit && <button type="button" className="profile-button profile-load-more" onClick={() => setLimit(value => value + 36)}><ChevronDown size={14} />{tr('Weitere Spiele', 'More games')} ({games.length - limit})</button>}
        </section>}
        {tab === 'badges' && p.showSteam && <section className="profile-section">{sectionHeader(tr('Steam-Abzeichen', 'Steam badges'), tr('Abzeichen aus dem verknüpften Steam-Profil.', 'Badges from the linked Steam profile.'))}<div className="profile-badge-grid">{p.badges.map((badge, i) => <div className="profile-badge" key={`${badge.name}-${i}`}><img src={safeProfileMedia(badge.iconUrl)} alt="" loading="lazy" /><h3>{badge.name}</h3>{badge.xp && <p>{badge.xp}</p>}{badge.level && <span>{badge.level}</span>}</div>)}</div></section>}
      </main>
      <aside className="profile-aside">{p.playing && p.gameName && <ProfileActivity name={p.gameName} game={playingGame} startedAt={p.startedAt} language={p.language}/>}<section className="profile-section"><h2>{tr('Über mich', 'About')}</h2><p className="profile-bio">{p.bio || tr('Hier ist noch Platz für ein paar Worte.', 'A few words can make this space your own.')}</p>{(p.discord || p.twitch || p.youtube) && <div className="profile-socials">{p.discord && <CopyButton value={p.discord} label={tr('Discord-Namen kopieren', 'Copy Discord username')} />}{(['twitch', 'youtube'] as const).map(service => { const value = service === 'twitch' ? p.twitch : p.youtube, url = profileSocialUrl(value, service); return value && url && <a key={service} href={url} target="_blank" rel="noreferrer">{service === 'twitch' ? 'Twitch' : 'YouTube'}<ArrowUpRight size={13} /></a> })}</div>}</section>
        {p.showSteam && steam && <section className="profile-section"><div className="profile-section-title"><h2>Steam</h2><a href={steam} target="_blank" rel="noreferrer" aria-label={tr('Steam-Profil öffnen', 'Open Steam profile')}><ArrowUpRight size={15} /></a></div><dl className="profile-steam-stats">{p.steamLevel !== undefined && <div><dt>{tr('Level', 'Level')}</dt><dd>{p.steamLevel}</dd></div>}{p.steamGamesCount !== undefined && <div><dt>{tr('Spiele', 'Games')}</dt><dd>{p.steamGamesCount}</dd></div>}{p.badges.length > 0 && <div><dt>{tr('Abzeichen', 'Badges')}</dt><dd>{p.badges.length}</dd></div>}</dl>{p.favoriteBadge?.name && <div className="profile-favorite-badge">{safeProfileMedia(p.favoriteBadge.iconUrl) ? <img src={safeProfileMedia(p.favoriteBadge.iconUrl)} alt="" /> : <Award size={28} />}<div><span>{tr('Ausgewähltes Abzeichen', 'Featured badge')}</span><h3>{p.favoriteBadge.name}</h3></div></div>}</section>}
        {p.hardware && <section className="profile-section"><h2><Cpu size={14} />{tr('Mein Setup', 'My setup')}</h2><dl className="profile-hardware">{Object.entries(p.hardware).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{{ cpu: 'CPU', gpu: 'GPU', ram: tr('Arbeitsspeicher', 'Memory'), display: tr('Monitor', 'Display'), os: tr('System', 'System') }[key]}</dt><dd>{value}</dd></div>)}</dl></section>}
        {!p.showPlaytime && <p className="profile-privacy-note"><Lock size={13} />{tr('Spielzeiten sind ausgeblendet.', 'Playtime is hidden.')}</p>}
        <p className="profile-footer-mark">ECLIPSE <span>{tr('SPIELERPROFIL', 'PLAYER PROFILE')}</span></p>
      </aside>
    </div>
  </div>
}
