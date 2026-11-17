import { ArrowUpRight, Gamepad2 } from 'lucide-react'
import type { ProfileGame } from '../../services/profileModel'
import { PosterArt } from '../shared/PosterArt'
import { useUIStore } from '../../store/uiStore'

export function ProfileActivity({ name, game, startedAt, language }: { name: string; game?: ProfileGame; startedAt?: number; language: string }) {
  const de = language === 'de', openGame = useUIStore(state => state.openGameDetails)
  const details = <><div className="profile-activity-art">{game ? <PosterArt game={game} shape="landscape"/> : <Gamepad2 size={26}/>}</div><div className="profile-activity-title"><h3>{name}</h3><span>{startedAt && Number.isFinite(startedAt) && startedAt <= Date.now() ? `${de ? 'Seit' : 'Since'} ${new Date(startedAt).toLocaleTimeString(de ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : de ? 'Jetzt im Spiel' : 'In game now'}</span>{game?.steamId && <span className="profile-activity-link">{de ? 'Spiel ansehen' : 'View game'}<ArrowUpRight size={12}/></span>}</div></>
  return <section className="profile-section profile-activity" data-profile-activity><h2><span/>{de ? 'Spielt gerade' : 'Playing now'}</h2>{game?.steamId ? <button type="button" className="profile-activity-game" onClick={() => openGame(game.steamId!, game.name)}>{details}</button> : <div className="profile-activity-game">{details}</div>}</section>
}
