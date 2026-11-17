import {ChevronDown, ChevronUp, UserPlus} from 'lucide-react'
import type {AppSettings} from '../../types/game'
import {ProfileAvatar} from '../profile/ProfileAvatar'
import {profileAvatarFrameValue} from '../../services/steamProfileAppearance'

export function ProfileSummary({ settings, playing, expanded, updateAvailable }: { settings: Partial<AppSettings>; playing: boolean; expanded: boolean; updateAvailable: boolean }) {
  const steam = profileAvatarFrameValue(settings) === 'steam'
  const requests = settings.incomingFriendRequests?.length || 0
  const requestLabel = settings.language === 'de' ? (requests === 1 ? '1 Freundschaftsanfrage' : `${requests} Freundschaftsanfragen`) : (requests === 1 ? '1 friend request' : `${requests} friend requests`)
  return <>
    <div className="relative flex-shrink-0" data-sidebar-avatar>
      <ProfileAvatar avatar={settings.avatarUrl} name={settings.username || 'User'} steamFrame={steam ? settings.steamAvatarFrameUrl : undefined} steamFrameStatic={steam ? settings.steamAvatarFrameStaticUrl : undefined} online playing={playing} variant="sidebar"/>
      {updateAvailable && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-hub-surface z-10" />}
      {requests > 0 && <span data-profile-friend-requests className="absolute -top-1 -right-1 z-20 flex items-center justify-center gap-0.5 min-w-5 h-5 px-1 rounded-full bg-[#b5804d] text-[#fff4e6] border-2 border-[#171310] text-[9px] font-bold" title={requestLabel}><UserPlus size={10}/><span>{requests>99?'99+':requests}</span></span>}
    </div>
    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white uppercase tracking-wide truncate">{settings.username || 'User'}</p></div>
    {expanded ? <ChevronUp data-profile-chevron="up" size={16} className="text-white/65 flex-shrink-0" /> : <ChevronDown data-profile-chevron="down" size={16} className="text-hub-muted flex-shrink-0" />}
  </>
}
