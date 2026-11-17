import { useEffect, useRef, useState } from 'react'
import { Check, Gamepad2, Link, Loader2, Palette, Search } from 'lucide-react'
import { resolveProfileBannerArtwork } from '../../services/profileBannerArtwork'
import { profileGameKey, type ProfileGame } from '../../services/profileModel'
import { PosterArt } from '../shared/PosterArt'
import { ProfileMedia } from './ProfileMedia'
import { PROFILE_BANNERS, profileBannerPreset } from './ProfileBannerArt'

export function ProfileBannerPicker({ value, onChange, position, onPosition, games, language }: {
  value: string; onChange: (value: string) => void; position: number; onPosition: (value: number) => void; games: ProfileGame[]; language: string
}) {
  const de = language === 'de', tr = (german: string, english: string) => de ? german : english
  const [tab, setTab] = useState<'eclipse' | 'games' | 'custom'>(value && !profileBannerPreset(value) ? 'games' : 'eclipse')
  const [query, setQuery] = useState(''), [pending, setPending] = useState<string>(), [error, setError] = useState(''), [limit, setLimit] = useState(24)
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])
  const choose = (url: string) => { revision.current++; setPending(undefined); setError(''); onChange(url) }
  const selectGame = async (game: ProfileGame) => {
    const current = ++revision.current; setPending(profileGameKey(game)); setError('')
    try {
      const url = await resolveProfileBannerArtwork(game)
      if (current !== revision.current) return
      if (!url || url.startsWith('data:')) throw Error('Missing game artwork')
      onChange(url); onPosition(44)
    } catch { if (current === revision.current) setError(tr('Für dieses Spiel konnte kein Banner geladen werden.', 'No banner could be loaded for this game.')) }
    finally { if (current === revision.current) setPending(undefined) }
  }
  const filtered = games.filter(game => game.name.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)))
  return <div className="profile-banner-picker">
    <div className="profile-banner-preview"><ProfileMedia src={value} position={position}/><span>{tr('Vorschau', 'Preview')}</span></div>
    <div className="profile-banner-sources" aria-label={tr('Bannerquelle', 'Banner source')}>{([
      ['eclipse', 'Eclipse', Palette], ['games', tr('Aus deinen Spielen', 'From your games'), Gamepad2], ['custom', tr('Eigener Link', 'Custom link'), Link],
    ] as const).map(([id, label, Icon]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { revision.current++; setPending(undefined); setTab(id); setError('') }}><Icon size={13}/>{label}</button>)}</div>
    {tab === 'eclipse' && <div className="profile-banner-presets">{PROFILE_BANNERS.map(preset => {
      const selected = profileBannerPreset(value) === preset.id || (!value && preset.id === 'solar')
      return <button type="button" key={preset.id} aria-pressed={selected} onClick={() => choose(`eclipse-banner:${preset.id}`)}><ProfileMedia src={`eclipse-banner:${preset.id}`}/><span>{de ? preset.de : preset.en}</span>{selected && <Check size={13}/>}</button>
    })}</div>}
    {tab === 'games' && <><label className="profile-search"><Search size={14}/><input aria-label={tr('Banner-Spiel suchen', 'Search banner games')} value={query} placeholder={tr('Spiel suchen …', 'Search games …')} onChange={event => { setQuery(event.target.value); setLimit(24) }}/></label><div className="profile-banner-games">{filtered.slice(0, limit).map(game => <button key={profileGameKey(game)} type="button" onClick={() => void selectGame(game)} aria-label={`${tr('Banner von', 'Banner from')} ${game.name}`} aria-busy={pending === profileGameKey(game)}><div><PosterArt game={game} shape="landscape"/>{pending === profileGameKey(game) && <Loader2 size={18} className="animate-spin"/>}</div><span>{game.name}</span></button>)}</div>{filtered.length > limit && <button type="button" className="profile-button profile-load-more" onClick={() => setLimit(count => count + 24)}>{tr('Weitere Spiele', 'More games')}</button>}{!filtered.length && <p className="profile-empty">{tr('Keine passenden Spiele gefunden.', 'No matching games found.')}</p>}</>}
    {tab === 'custom' && <label className="profile-banner-custom">{tr('Bild- oder Video-Link', 'Image or video URL')}<input type="url" value={profileBannerPreset(value) ? '' : value} onChange={event => choose(event.target.value)} placeholder="https://…"/><span>{tr('JPG, PNG, WebP oder MP4/WebM. Der Banner wird erst beim Speichern übernommen.', 'JPG, PNG, WebP or MP4/WebM. Your banner changes when you save.')}</span></label>}
    {value && !profileBannerPreset(value) && <label className="profile-banner-position">{tr('Bildausschnitt', 'Image position')}<input type="range" min="0" max="100" value={position} onChange={event => onPosition(Number(event.target.value))}/></label>}
    {error && <p className="profile-error" role="alert">{error}</p>}
  </div>
}
