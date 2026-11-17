import { useState, useEffect, useMemo } from 'react'
import { User, Save, Check, Loader2, Cpu, Image as ImageIcon, Sparkles, X, RefreshCw, MessageSquare, CheckCircle2, Play } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { syncMyProfile, fetchUserProfile, sendFriendRequest } from '../../services/socialService'
import { fetchSteamUserProfile, isValidSteamBackground } from '../../services/steamService'
import { formatLastSeen } from '../../services/assetHelper'
import { sendAppNotification } from '../../services/notificationService'
import type { SteamBadge, SteamProfileGame } from '../../types/game'
import { buildProfileGames, formatProfileTime, profileGameKey, resolvePinnedGames, safeProfileMedia } from '../../services/profileModel'
import { ProfileOverview, type ProfileDisplayGame } from './ProfileOverview'
import { ProfileMedia } from './ProfileMedia'
import { ProfileDialog } from './ProfileDialog'
import { ProfileAvatar } from './ProfileAvatar'
import { profileBannerPreset } from './ProfileBannerArt'
import { ProfileBannerPicker } from './ProfileBannerPicker'
import { profileAvatarFrameValue, steamFrameImage } from '../../services/steamProfileAppearance'

const AVATAR_FRAMES = [
  { id: 'none', label: 'None', labelDe: 'Kein Rahmen', color: 'border-white/10' },
  { id: 'eclipse_neon', label: 'Eclipse Glow', labelDe: 'Eclipse-Leuchten', color: 'border-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.35)]' },
  { id: 'cyberpunk', label: 'Cyberpunk', labelDe: 'Cyberpunk', color: 'border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.35)]' },
  { id: 'golden_vip', label: 'Gold VIP', labelDe: 'Gold VIP', color: 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]' },
  { id: 'fire_blaze', label: 'Fire Blaze', labelDe: 'Feuerschein', color: 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)]' },
  { id: 'emerald_pulse', label: 'Emerald', labelDe: 'Smaragd', color: 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]' },
]

function cleanPlaytime(str?: string): string {
  if (typeof str !== 'string' || !str) return ''
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatLocalizedPlaytime(str?: string, lang: string = 'de'): string {
  if (!str) return ''
  const cleaned = cleanPlaytime(str)
  if (!cleaned) return ''

  // Match minutes: e.g. "45 Min. insgesamt", "45 mins on record", "45 min"
  const minMatch = cleaned.match(/([\d.,]+)\s*(?:min|mins|minuten)/i)
  if (minMatch) {
    const num = minMatch[1]
    return lang === 'de' ? `${num} Min. insgesamt` : `${num} mins on record`
  }

  // Match hours: e.g. "311 Std. insgesamt", "311 hrs on record", "311.5 hours", "311 Std."
  const hrMatch = cleaned.match(/([\d.,]+)\s*(?:hrs?|std\.?|hours?|stunden?)/i)
  if (hrMatch) {
    let num = hrMatch[1]
    if (lang === 'de') {
      num = num.replace('.', ',')
      return `${num} Std. insgesamt`
    } else {
      num = num.replace(',', '.')
      return `${num} hrs on record`
    }
  }

  // Generic number fallback
  const anyNumMatch = cleaned.match(/([\d.,]+)/)
  if (anyNumMatch) {
    let num = anyNumMatch[1]
    if (lang === 'de') {
      num = num.replace('.', ',')
      return `${num} Std. insgesamt`
    } else {
      num = num.replace(',', '.')
      return `${num} hrs on record`
    }
  }

  return cleaned
}

function CleanCheckbox({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) {
  return <label className="profile-checkbox flex items-start gap-3 cursor-pointer select-none">
    <input type="checkbox" className="sr-only" checked={checked} onChange={onChange}/>
    <span aria-hidden="true" className={`w-4 h-4 rounded-[4px] flex items-center justify-center border flex-shrink-0 mt-0.5 ${checked ? 'bg-white border-white text-black' : 'bg-white/[0.04] border-white/20'}`}>{checked && <Check size={11} strokeWidth={3}/>}</span>
    <span className="flex-1"><span className="text-xs text-white/85 block font-medium">{label}</span>{description && <span className="text-[11px] text-white/40 block mt-0.5">{description}</span>}</span>
  </label>
}


export function ProfileView() {
  const library = useGameStore(state => state.library)
  const installedGames = useGameStore(state => state.installedGames)
  const settings = useGameStore(state => state.settings)
  const updateSettings = useGameStore(state => state.updateSettings)
  const activeGame = useGameStore(state => state.activeGame)
  const selectedFriendId = useUIStore(s => s.selectedFriendId)
  const setSelectedFriendId = useUIStore(s => s.setSelectedFriendId)
  const { t, language } = useTranslation()
  
  const [fetchedProfile, setFetchedProfile] = useState<any | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [settledProfile, setSettledProfile] = useState<string | null>(null)
  const [profileRevision, setProfileRevision] = useState(0)
  const [isSendingRequest, setIsSendingRequest] = useState(false)
  const [requestSent, setRequestSent] = useState(false)

  const friend = selectedFriendId ? settings.eclipseFriends?.find(f => f.id === selectedFriendId) : null
  const isViewingFriend = !!selectedFriendId
  const isAlreadyFriend = isViewingFriend && (!!friend || (settings.eclipseFriends?.some(f => f.id === selectedFriendId) ?? false))

  useEffect(() => {
    let disposed = false
    setIsLoadingProfile(Boolean(selectedFriendId))
    setRequestSent(false)
    setFetchedProfile(null)
    if (selectedFriendId) {
      void fetchUserProfile(selectedFriendId).then(async data => {
        if (disposed) return
        if (data) {
          setFetchedProfile({ ...data, __profileId: selectedFriendId })
          return
        }
        const steamUrl = friend?.steamProfileUrl || (/^\d{17}$/.test(selectedFriendId) ? selectedFriendId : '')
        if (!steamUrl) return
        const steam = await fetchSteamUserProfile(steamUrl)
        if (disposed || !steam?.steamId64) return
        setFetchedProfile({ ...steam, __profileId: selectedFriendId, username: steam.username, avatarUrl: steam.avatarFull,
          steamProfileUrl: 'https://steamcommunity.com/profiles/' + steam.steamId64,
          status: steam.onlineState === 'in-game' ? 'ingame' : steam.onlineState === 'online' ? 'online' : 'offline',
          currentGame: steam.stateMessage?.replace(/<[^>]+>/g, ' ').replace(/^in-game:?\s*/i, '').trim(),
        })
      }).catch(() => {}).finally(() => { if (!disposed) { setIsLoadingProfile(false); setSettledProfile(selectedFriendId) } })
    } else {
      void syncMyProfile().catch(() => {})
      if (settings.steamProfileUrl) void fetchSteamUserProfile(settings.steamProfileUrl).then(steam => {
        if (disposed || !steam) return
        const current = useGameStore.getState().settings
        if (current.steamProfileUrl !== settings.steamProfileUrl) return
        const patch = {
          steamLevel: steam.steamLevel ?? current.steamLevel, steamGamesCount: steam.steamGamesCount ?? current.steamGamesCount,
          steamBadgesCount: steam.steamBadgesCount ?? current.steamBadgesCount, steamRecentGames: steam.steamRecentGames || current.steamRecentGames,
          steamFavoriteBadge: steam.steamFavoriteBadge || current.steamFavoriteBadge, steamBadges: steam.steamBadges || current.steamBadges,
          steamGames: steam.steamGames || current.steamGames,
          steamAvatarFrameUrl: steam.steamAvatarFrameUrl !== undefined ? steam.steamAvatarFrameUrl : current.steamAvatarFrameUrl,
          steamAvatarFrameStaticUrl: steam.steamAvatarFrameStaticUrl !== undefined ? steam.steamAvatarFrameStaticUrl : current.steamAvatarFrameStaticUrl,
          steamBackgroundUrl: isValidSteamBackground(steam.steamBackgroundUrl) ? steam.steamBackgroundUrl : current.steamBackgroundUrl,
          steamBackgroundMovie: isValidSteamBackground(steam.steamBackgroundMovie) ? steam.steamBackgroundMovie : current.steamBackgroundMovie,
        }
        updateSettings(patch)
        void window.electronAPI?.setSettings?.(patch).catch(() => {})
      }).catch(() => {})
    }
    return () => { disposed = true }
  }, [selectedFriendId, settings.steamProfileUrl, profileRevision])

  // Customization Form States
  const [isEditing, setIsEditing] = useState(false)
  const [editTab, setEditTab] = useState<'general' | 'banner' | 'bg_steam' | 'frame' | 'socials' | 'steam' | 'hardware'>('general')
  const [editName, setEditName] = useState(settings.username || 'User')
  const [editAvatar, setEditAvatar] = useState(settings.avatarUrl || '')
  const [editBanner, setEditBanner] = useState(settings.bannerUrl || '')
  const [editBannerPosition, setEditBannerPosition] = useState(settings.profileBannerPosition ?? 44)
  const [editFrame, setEditFrame] = useState(profileAvatarFrameValue(settings))
  const [editBio, setEditBio] = useState(settings.bio || '')
  const [editDiscord, setEditDiscord] = useState(settings.socialDiscord || '')
  const [editTwitch, setEditTwitch] = useState(settings.socialTwitch || '')
  const [editYoutube, setEditYoutube] = useState(settings.socialYoutube || '')
  const [editSteamUrl, setEditSteamUrl] = useState(settings.steamProfileUrl || '')
  const [editShowHardware, setEditShowHardware] = useState(Boolean(settings.showHardwareSpecs))
  const [editShowPlaytime, setEditShowPlaytime] = useState(settings.profileShowPlaytime !== false)
  const [editShowSteamStats, setEditShowSteamStats] = useState(settings.profileShowSteamStats !== false)
  const [editShowSteamBg, setEditShowSteamBg] = useState(settings.profileShowSteamBackground !== false)

  const [isSyncingSteam, setIsSyncingSteam] = useState(false)
  const [isDetectingHardware, setIsDetectingHardware] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setEditName(settings.username || 'User')
      setEditAvatar(settings.avatarUrl || '')
      setEditBanner(settings.bannerUrl || '')
      setEditBannerPosition(settings.profileBannerPosition ?? 44)
      setEditFrame(profileAvatarFrameValue(settings))
      setEditBio(settings.bio || '')
      setEditDiscord(settings.socialDiscord || '')
      setEditTwitch(settings.socialTwitch || '')
      setEditYoutube(settings.socialYoutube || '')
      setEditSteamUrl(settings.steamProfileUrl || '')
      setEditShowHardware(Boolean(settings.showHardwareSpecs))
      setEditShowPlaytime(settings.profileShowPlaytime !== false)
      setEditShowSteamStats(settings.profileShowSteamStats !== false)
      setEditShowSteamBg(settings.profileShowSteamBackground !== false)
    }
  }, [settings, isEditing])

  // Combined stats resolution
  const profileData = (fetchedProfile?.__profileId === selectedFriendId ? fetchedProfile : null) || friend
  const activeFriendCode = isViewingFriend 
    ? (profileData?.friendCode || friend?.friendCode) 
    : (settings.friendCode || (typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity?.friendCode : null))

  const displayName = isViewingFriend 
    ? (profileData?.username || friend?.username || 'Eclipse Player') 
    : (settings.username || 'User')
  
  const displayAvatar = isViewingFriend 
    ? (profileData?.avatarUrl || friend?.avatarUrl || '') 
    : settings.avatarUrl

  const steamBackgroundMovie = isViewingFriend
    ? (profileData?.steamBackgroundMovie || friend?.steamBackgroundMovie)
    : settings.steamBackgroundMovie

  const steamBackgroundUrl = isViewingFriend
    ? (profileData?.steamBackgroundUrl || friend?.steamBackgroundUrl)
    : settings.steamBackgroundUrl

  // 1. Full Profile View Background (Steam Live Video or Artwork)
  const rawSteamBg = isViewingFriend
    ? (profileData?.steamBackgroundMovie || profileData?.steamBackgroundUrl || friend?.steamBackgroundMovie || friend?.steamBackgroundUrl)
    : (settings.steamBackgroundMovie || settings.steamBackgroundUrl)

  const steamBg = isValidSteamBackground(rawSteamBg) ? rawSteamBg : null

  const showSteamBg = isViewingFriend 
    ? (profileData?.showSteamBackground !== false) 
    : (settings.profileShowSteamBackground !== false)

  const activeProfileBg = showSteamBg ? steamBg : null

  // 2. Profile Card Banner (Presets or Custom Link) - strictly independent from Steam Background
  const rawUserBanner = isViewingFriend ? (profileData?.bannerUrl || friend?.bannerUrl) : settings.bannerUrl
  const displayBanner = rawUserBanner || ''

  const displayFrame = isViewingFriend
    ? (profileData?.avatarFrame || friend?.avatarFrame || 'steam')
    : profileAvatarFrameValue(settings)
  const steamFrame = isViewingFriend ? (profileData?.steamAvatarFrameUrl !== undefined ? profileData.steamAvatarFrameUrl : friend?.steamAvatarFrameUrl) : settings.steamAvatarFrameUrl
  const steamFrameStatic = isViewingFriend ? (profileData?.steamAvatarFrameStaticUrl !== undefined ? profileData.steamAvatarFrameStaticUrl : friend?.steamAvatarFrameStaticUrl) : settings.steamAvatarFrameStaticUrl
  const bannerPosition = isViewingFriend ? profileData?.bannerPosition ?? friend?.bannerPosition ?? 44 : settings.profileBannerPosition ?? 44

  const displayBio = isViewingFriend
    ? (profileData?.bio || friend?.bio || '')
    : (settings.bio || '')

  const displayDiscord = isViewingFriend
    ? (profileData?.socialDiscord || friend?.socialDiscord || '')
    : (settings.socialDiscord || '')

  const displayTwitch = isViewingFriend
    ? (profileData?.socialTwitch || friend?.socialTwitch || '')
    : (settings.socialTwitch || '')

  const displayYoutube = isViewingFriend
    ? (profileData?.socialYoutube || friend?.socialYoutube || '')
    : (settings.socialYoutube || '')

  const displayShowHardware = isViewingFriend
    ? Boolean(profileData?.showHardwareSpecs)
    : Boolean(settings.showHardwareSpecs)

  const displayHardware = isViewingFriend
    ? (profileData?.hardwareSpecs || friend?.hardwareSpecs)
    : settings.hardwareSpecs

  const steamLevel = isViewingFriend 
    ? (profileData?.steamLevel ?? profileData?.level ?? friend?.steamLevel ?? friend?.level) 
    : settings.steamLevel

  const steamGamesCount = isViewingFriend 
    ? (profileData?.steamGamesCount ?? friend?.steamGamesCount) 
    : settings.steamGamesCount

  const steamBadgesCount = isViewingFriend 
    ? (profileData?.steamBadgesCount ?? friend?.steamBadgesCount) 
    : settings.steamBadgesCount

  const rawSteamRecentGames = isViewingFriend
    ? (profileData?.steamRecentGames || friend?.steamRecentGames || []) 
    : (settings.steamRecentGames || [])

  const steamRecentGames = useMemo(() => {
    return (Array.isArray(rawSteamRecentGames) ? rawSteamRecentGames : []).filter((g: any) => g && typeof g.name === 'string').slice(0, 20).map((g: any) => ({
      ...g,
      name: cleanPlaytime(g.name),
      playtime: cleanPlaytime(g.playtime)
    }))
  }, [rawSteamRecentGames])

  const steamFavoriteBadge = isViewingFriend 
    ? (profileData?.steamFavoriteBadge || friend?.steamFavoriteBadge) 
    : settings.steamFavoriteBadge

  const rawSteamBadges = isViewingFriend
    ? (profileData?.steamBadges || friend?.steamBadges || []) 
    : (settings.steamBadges || [])

  const rawSteamGames = isViewingFriend
    ? (profileData?.steamGames || friend?.steamGames || []) 
    : (settings.steamGames || [])
  const steamBadges: SteamBadge[] = (Array.isArray(rawSteamBadges) ? rawSteamBadges : []).filter(badge => badge && typeof badge.name === 'string').slice(0, 200)
  const steamGames: SteamProfileGame[] = (Array.isArray(rawSteamGames) ? rawSteamGames : []).filter(game => game && typeof game.name === 'string').slice(0, 5000)

  const friendStatus = friend?.status || profileData?.status || 'offline'
  const friendCurrentGame = friendStatus === 'ingame' ? (friend ? friend.currentGame : profileData?.currentGame) : null
  
  let friendLastSeen: number | undefined = friend?.lastSeen
  if (profileData?.lastSeen) {
    if (typeof profileData.lastSeen.toMillis === 'function') {
      friendLastSeen = profileData.lastSeen.toMillis()
    } else if (typeof profileData.lastSeen.toDate === 'function') {
      friendLastSeen = profileData.lastSeen.toDate().getTime()
    } else if (typeof profileData.lastSeen === 'number') {
      friendLastSeen = profileData.lastSeen
    } else if (profileData.lastSeen.seconds) {
      friendLastSeen = profileData.lastSeen.seconds * 1000
    }
  }

  const friendStatusText = friendStatus === 'ingame' 
    ? (friendCurrentGame ? `In-Game: ${friendCurrentGame}` : 'In-Game')
    : friendStatus === 'online' 
      ? t('online') 
      : formatLastSeen(friendLastSeen, language)

  const isOnline = isViewingFriend ? friendStatus !== 'offline' : true
  const isIngame = isViewingFriend ? (friendStatus === 'ingame' && !!friendCurrentGame) : !!activeGame
  const currentGameName = isViewingFriend ? friendCurrentGame : activeGame?.name

  // Helper to check if banner is a video (Live Steam Background)
  const isVideoBanner = (url: string | undefined | null) => {
    if (!url) return false
    const clean = url.toLowerCase().split('?')[0]
    return clean.endsWith('.webm') || clean.endsWith('.mp4') || url.includes('.webm') || url.includes('.mp4')
  }

  const allUserGames = useMemo(() => buildProfileGames(library, installedGames), [library, installedGames])
  const ownSteamIds = useMemo(() => allUserGames.flatMap(game => game.steamId ? [game.steamId] : []), [allUserGames])
  const showPlaytime = isViewingFriend ? profileData?.showPlaytime !== false : settings.profileShowPlaytime !== false
  const showSteam = isViewingFriend ? profileData?.showSteamStats !== false : settings.profileShowSteamStats !== false
  const ownTopGames = useMemo(() => [...allUserGames].filter(game => game.playTimeMinutes > 0).sort((a, b) => b.playTimeMinutes - a.playTimeMinutes).slice(0, 5), [allUserGames])
  const publicGame = (game: any): ProfileDisplayGame => ({ id: String(game.id || game.appId || game.name), name: String(game.name || ''),
    platform: game.platform || (game.steamId || game.appId ? 'steam' : 'custom'), steamId: Number(game.steamId || game.appId) || undefined,
    installed: false, playTimeMinutes: showPlaytime && Number.isFinite(game.playTimeMinutes) ? Math.max(0, game.playTimeMinutes) : 0,
    lastPlayed: showPlaytime && Number.isFinite(game.lastPlayed) ? Math.max(0, game.lastPlayed) : 0,
  })
  const publicTopGames: ProfileDisplayGame[] = isViewingFriend && showPlaytime && Array.isArray(profileData?.topPlayedGames) ? profileData.topPlayedGames.filter((game: any) => game && typeof game.name === 'string').slice(0, 5).map(publicGame) : []
  const displayTopGames = isViewingFriend ? publicTopGames : ownTopGames
  const pinned: ProfileDisplayGame[] = isViewingFriend ? (Array.isArray(profileData?.pinnedGames) ? profileData.pinnedGames.filter((game: any) => game && typeof game.name === 'string').slice(0, 3).map(publicGame) : []) : resolvePinnedGames(allUserGames, settings.profilePinnedGames)
  const publicSteamGames: ProfileDisplayGame[] = showSteam ? steamGames.map(game => ({ ...publicGame(game), steamPlaytime: showPlaytime ? formatLocalizedPlaytime(game.playtime, language) : undefined })) : []
  const displayGames: ProfileDisplayGame[] = isViewingFriend ? [...new Map([...publicSteamGames, ...publicTopGames, ...pinned].map(game => [profileGameKey(game), game])).values()] : allUserGames
  const displayTotalPlaytime = isViewingFriend ? (Number.isFinite(profileData?.totalPlaytimeMins) ? formatProfileTime(profileData.totalPlaytimeMins, language) : profileData?.totalPlaytimeHours || '—')
    : formatProfileTime(allUserGames.reduce((sum, game) => sum + game.playTimeMinutes, 0), language)
  const displayLibraryCount = isViewingFriend ? (profileData?.totalLibraryCount ?? (showSteam ? steamGamesCount : undefined) ?? displayGames.length) : allUserGames.length
  const displayInstalledCount = isViewingFriend ? (profileData?.totalInstalledCount ?? '—') : allUserGames.filter(game => game.installed).length
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  async function savePins(keys: string[]) {
    const patch = { profilePinnedGames: keys.slice(0, 3) }
    const result = await window.electronAPI?.setSettings?.(patch)
    if (result?.success === false) throw Error('Settings write failed')
    updateSettings(patch)
    void syncMyProfile().catch(() => {})
  }

  async function handleSave() {
    if (isSaving) return
    setSaveError('')
    if (!editName.trim()) { setSaveError(language === 'de' ? 'Bitte gib einen Namen ein.' : 'Please enter a name.'); return }
    if ((editAvatar.trim() && !safeProfileMedia(editAvatar.trim())) || (editBanner.trim() && !profileBannerPreset(editBanner.trim()) && !safeProfileMedia(editBanner.trim()))) {
      setSaveError(language === 'de' ? 'Bitte verwende einen gültigen Bild- oder Video-Link (https://).' : 'Please use a valid image or video URL (https://).'); return
    }
    const patch = { username: editName.trim().slice(0, 64), avatarUrl: editAvatar.trim(), bannerUrl: editBanner.trim(), profileBannerPosition: editBannerPosition, avatarFrame: editFrame, profileAvatarFrameSelected: true,
      bio: editBio.trim().slice(0, 160), socialDiscord: editDiscord.trim().slice(0, 100), socialTwitch: editTwitch.trim().slice(0, 200),
      socialYoutube: editYoutube.trim().slice(0, 200), steamProfileUrl: editSteamUrl.trim(), showHardwareSpecs: editShowHardware,
      profileShowPlaytime: editShowPlaytime, profileShowSteamStats: editShowSteamStats, profileShowSteamBackground: editShowSteamBg }
    setIsSaving(true)
    try {
      const result = await window.electronAPI?.setSettings?.(patch)
      if (result?.success === false) throw Error('Settings write failed')
      updateSettings(patch)
      void window.electronAPI?.account?.saveIdentity?.({ username: patch.username }).catch(() => {})
      void syncMyProfile().catch(() => {})
      setIsEditing(false)
    } catch { setSaveError(language === 'de' ? 'Das Profil konnte nicht gespeichert werden. Bitte erneut versuchen.' : 'Could not save your profile. Please try again.') }
    finally { setIsSaving(false) }
  }

  async function handleSyncSteam() {
    if (!editSteamUrl.trim()) return
    setIsSyncingSteam(true)
    try {
      const profile = await fetchSteamUserProfile(editSteamUrl.trim())
      if (profile) {
        setEditName(profile.username)
        setEditAvatar(profile.avatarFull)
        
        const patch: any = {
          username: profile.username,
          avatarUrl: profile.avatarFull,
          steamAvatarFrameUrl: profile.steamAvatarFrameUrl ?? null,
          steamAvatarFrameStaticUrl: profile.steamAvatarFrameStaticUrl ?? null,
          steamProfileUrl: editSteamUrl.trim(),
          steamLevel: profile.steamLevel ?? 0,
          steamGamesCount: profile.steamGamesCount ?? 0,
          steamBadgesCount: profile.steamBadgesCount ?? 0,
          steamRecentGames: profile.steamRecentGames || [],
          steamFavoriteBadge: profile.steamFavoriteBadge || null,
          steamBadges: profile.steamBadges || [],
          steamGames: profile.steamGames || [],
          steamBackgroundUrl: profile.steamBackgroundUrl,
          steamBackgroundMovie: profile.steamBackgroundMovie,
        }
        if (window.electronAPI?.setSettings) {
          const result = await window.electronAPI.setSettings(patch)
          if (result?.success === false) throw Error('Settings write failed')
        }
        updateSettings(patch)
        if (window.electronAPI?.account?.saveIdentity) {
          void window.electronAPI.account.saveIdentity({ username: profile.username }).catch(() => {})
        }
        void syncMyProfile().catch(() => {})
        sendAppNotification({
          title: language === 'de' ? 'Steam synchronisiert' : 'Steam Synced',
          body: language === 'de' ? `Profil von ${profile.username} erfolgreich verknüpft (inkl. Steam Live-Hintergrund).` : `Profile of ${profile.username} linked.`,
          type: 'success'
        })
      } else {
        sendAppNotification({
          title: language === 'de' ? 'Fehler' : 'Error',
          body: language === 'de' ? 'Konnte Steam-Profil nicht abrufen.' : 'Could not fetch Steam profile.',
          type: 'error'
        })
      }
    } catch (e) {
      setSaveError(language === 'de' ? 'Steam konnte nicht synchronisiert werden. Bitte erneut versuchen.' : 'Could not sync Steam. Please try again.')
    } finally {
      setIsSyncingSteam(false)
    }
  }

  async function handleRedetectHardware() {
    if (!window.electronAPI?.getHardwareSpecs) return
    setIsDetectingHardware(true)
    try {
      const specs = await window.electronAPI.getHardwareSpecs()
      if (specs) {
        if (window.electronAPI?.setSettings) {
          const result = await window.electronAPI.setSettings({ hardwareSpecs: specs })
          if (result?.success === false) throw Error('Settings write failed')
        }
        updateSettings({ hardwareSpecs: specs })
        void syncMyProfile().catch(() => {})
        sendAppNotification({
          title: language === 'de' ? 'Hardware aktualisiert' : 'Hardware Refreshed',
          body: language === 'de' ? 'PC-Komponenten wurden neu ausgelesen.' : 'PC specs refreshed.',
          type: 'success'
        })
      }
    } catch {
      setSaveError(language === 'de' ? 'Die Hardware konnte nicht aktualisiert werden.' : 'Could not refresh hardware.')
    } finally {
      setIsDetectingHardware(false)
    }
  }

  async function handleRefreshSteamFrame() {
    if (!settings.steamProfileUrl || isSyncingSteam) return
    setIsSyncingSteam(true); setSaveError('')
    try {
      const profile = await fetchSteamUserProfile(settings.steamProfileUrl)
      if (!profile || profile.steamAvatarFrameUrl === undefined) throw Error('Steam frame unavailable')
      const patch = { steamAvatarFrameUrl: profile.steamAvatarFrameUrl, steamAvatarFrameStaticUrl: profile.steamAvatarFrameStaticUrl ?? null }
      const result = await window.electronAPI?.setSettings?.(patch)
      if (result?.success === false) throw Error('Settings write failed')
      updateSettings(patch)
      void syncMyProfile().catch(() => {})
    } catch { setSaveError(language === 'de' ? 'Der Steam-Rahmen konnte nicht aktualisiert werden. Bitte erneut versuchen.' : 'Could not refresh your Steam frame. Please try again.') }
    finally { setIsSyncingSteam(false) }
  }

  async function handleSendFriendReq() {
    if (!profileData?.friendCode && !selectedFriendId) return
    setIsSendingRequest(true)
    try {
      const codeOrUid = profileData?.friendCode || selectedFriendId
      const res = await sendFriendRequest(codeOrUid)
      if (res.success) {
        if (res.state === 'incoming') {
          if (window.electronAPI?.openFriendsWindow) void window.electronAPI.openFriendsWindow()
          else useUIStore.getState().setIsFriendsOpen(true)
          void sendAppNotification({ title: language==='de'?'Freundschaftsanfrage':'Friend request', body: language==='de'?'Du hast bereits eine Anfrage von diesem Spieler. Öffne Freunde, um sie anzunehmen.':'This player has already sent you a request. Open Friends to accept it.', type:'info' })
          return
        }
        setRequestSent(true)
        sendAppNotification({
          title: language === 'de' ? 'Anfrage gesendet! 👥' : 'Request Sent! 👥',
          body: res.message || (language === 'de' ? 'Freundschaftsanfrage übermittelt.' : 'Friend request sent.'),
          type: 'success',
          duration: 5000
        })
        return
      }

      const isNotFound = res.error?.includes('Kein Spieler') || res.error?.includes('not found')
      sendAppNotification({
        title: language === 'de' ? 'Hinweis' : 'Notice',
        body: isNotFound
          ? (language === 'de' ? 'Kein Spieler mit diesem Code gefunden.' : 'No player found with this code.')
          : (res.error || (language === 'de' ? 'Konnte Anfrage nicht senden.' : 'Could not send request.')),
        type: 'info',
        duration: 5000
      })
    } catch (err: any) {
      console.warn('sendFriendReq error:', err)
    } finally {
      setIsSendingRequest(false)
    }
  }

  const getFrameClass = (frameId: string) => {
    const f = AVATAR_FRAMES.find(item => item.id === frameId)
    return f ? f.color : 'border-white/10'
  }

  return (
    <div className="view-scroll profile-page" data-profile-page>
      {activeProfileBg && <div className="profile-wallpaper"><ProfileMedia src={activeProfileBg}/></div>}
      {isViewingFriend && !profileData ? settledProfile !== selectedFriendId || isLoadingProfile ? <div className="profile-loading" role="status"><Loader2 size={18} className="animate-spin"/>{language === 'de' ? 'Profil wird geladen …' : 'Loading profile …'}</div> : <div className="profile-loading" data-profile-error><div><p>{language === 'de' ? 'Dieses Profil konnte nicht geladen werden.' : 'This profile could not be loaded.'}</p><div className="flex gap-3 mt-4"><button className="profile-button" onClick={() => { setSettledProfile(null); setProfileRevision(value => value + 1) }}>{language === 'de' ? 'Erneut versuchen' : 'Try again'}</button><button className="profile-button" onClick={() => setSelectedFriendId(null)}>{language === 'de' ? 'Mein Profil' : 'My profile'}</button></div></div></div> : <ProfileOverview key={selectedFriendId || 'own-profile'}
        language={language} own={!isViewingFriend} name={displayName} avatar={displayAvatar} banner={displayBanner} bannerPosition={bannerPosition} frameClass={getFrameClass(displayFrame)} bio={displayBio} code={activeFriendCode}
        steamFrame={displayFrame === 'steam' ? steamFrame : undefined} steamFrameStatic={displayFrame === 'steam' ? steamFrameStatic : undefined}
        online={isOnline} playing={isIngame} gameName={currentGameName} startedAt={!isViewingFriend ? activeGame?.startTime : undefined} status={isViewingFriend ? friendStatusText : (language === 'de' ? 'Online' : 'Online')}
        steamUrl={isViewingFriend ? profileData?.steamProfileUrl : settings.steamProfileUrl} steamLevel={steamLevel} steamGamesCount={steamGamesCount} favoriteBadge={steamFavoriteBadge}
        discord={displayDiscord} twitch={displayTwitch} youtube={displayYoutube} showPlaytime={showPlaytime} showSteam={showSteam}
        totalTime={displayTotalPlaytime} libraryCount={displayLibraryCount} installedCount={displayInstalledCount} games={displayGames} topGames={displayTopGames} pinned={pinned} badges={steamBadges} ownSteamIds={ownSteamIds}
        recent={steamRecentGames.map((game: any) => ({ ...game, playtime: formatLocalizedPlaytime(game.playtime, language) }))} hardware={displayShowHardware ? displayHardware : undefined}
        edit={tab => { setSaveError(''); setEditTab(tab); setIsEditing(true) }} savePins={savePins} back={() => setSelectedFriendId(null)}
        addFriend={() => void handleSendFriendReq()} alreadyFriend={isAlreadyFriend} sending={isSendingRequest} requestSent={requestSent}/>}
        <>
          {isEditing && !isViewingFriend && (
          <ProfileDialog close={() => { if (!isSaving) setIsEditing(false) }}>
            <div className="profile-editor">
              <header className="profile-editor-header"><div><h2 id="profile-edit-title">{language === 'de' ? 'Profil bearbeiten' : 'Edit profile'}</h2><p>{language === 'de' ? 'Dein Name, dein Look, deine Spiele.' : 'Your name, your look, your games.'}</p></div><button type="button" aria-label={language === 'de' ? 'Schließen' : 'Close'} disabled={isSaving} onClick={() => setIsEditing(false)}><X size={18}/></button></header>
              {/* Minimalist Flat Nav Tabs */}
              <div className="profile-editor-nav" role="tablist" aria-label={language === 'de' ? 'Profil anpassen' : 'Customize profile'}>
                {[
                  { id: 'general', label: language === 'de' ? 'Allgemein' : 'General', icon: User },
                  { id: 'banner', label: language === 'de' ? 'Banner' : 'Banner', icon: ImageIcon },
                  { id: 'bg_steam', label: language === 'de' ? 'Profil-Hintergrund' : 'Profile Background', icon: Play },
                  { id: 'frame', label: language === 'de' ? 'Avatar-Rahmen' : 'Avatar Frames', icon: Sparkles },
                  { id: 'socials', label: language === 'de' ? 'Biografie & Links' : 'Bio & socials', icon: MessageSquare },
                  { id: 'steam', label: t('uiSteamSync'), icon: RefreshCw },
                  { id: 'hardware', label: language === 'de' ? 'PC-Hardware' : 'Hardware Specs', icon: Cpu },
                ].map(tab => {
                  const Icon = tab.icon
                  const isActive = editTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      data-profile-edit-tab={tab.id}
                      type="button" role="tab" aria-selected={isActive}
                      onClick={() => { setEditTab(tab.id as any); setSaveError('') }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 ${
                        isActive 
                          ? 'bg-white/10 text-white font-semibold' 
                          : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon size={13} className={isActive ? 'text-white' : 'text-white/40'} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Tab 1: General & Privacy */}
              {editTab === 'general' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">{t('username')}</label>
                      <input 
                        type="text" maxLength={64} aria-label={t('username')}
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/20 transition-colors focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">{t('avatarUrl')}</label>
                      <input 
                        type="text" 
                        placeholder="https://..."
                        value={editAvatar}
                        onChange={e => setEditAvatar(e.target.value)}
                        className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/20 transition-colors focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] space-y-3">
                    <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block mb-2">
                      {language === 'de' ? 'Privatsphäre & Anzeige' : 'Privacy & Display'}
                    </span>

                    <CleanCheckbox 
                      checked={editShowPlaytime}
                      onChange={() => setEditShowPlaytime(!editShowPlaytime)}
                      label={language === 'de' ? 'Gesamte Spielzeit im Profil anzeigen' : 'Show Total Playtime on Profile'}
                      description={language === 'de' ? 'Zeigt deine Gesamtspielzeit über alle Spiele auf deinem Profil an.' : 'Displays your total playtime across all games on your profile.'}
                    />

                    <CleanCheckbox 
                      checked={editShowSteamStats}
                      onChange={() => setEditShowSteamStats(!editShowSteamStats)}
                      label={language === 'de' ? 'Steam-Level, Badges & Spiele anzeigen' : 'Show Steam Level, Badges & Games'}
                      description={language === 'de' ? 'Zeigt dein synchronisiertes Steam-Level, Abzeichen und Steam-Spiele an.' : 'Displays your synced Steam level, badges, and games.'}
                    />

                    <CleanCheckbox 
                      checked={editShowSteamBg}
                      onChange={() => setEditShowSteamBg(!editShowSteamBg)}
                      label={language === 'de' ? 'Steam Profil-Hintergrund im Profil verwenden' : 'Use Steam Profile Background on Profile'}
                      description={language === 'de' ? 'Zeigt deinen synchronisierten Steam-Hintergrund (Bild oder Live Video) als Profil-Hintergrund an.' : 'Applies your synced Steam background (image or live video) to your profile.'}
                    />
                  </div>
                </div>
              )}

              {editTab === 'banner' && <ProfileBannerPicker value={editBanner} onChange={setEditBanner} position={editBannerPosition} onPosition={setEditBannerPosition} games={allUserGames} language={language}/>}

              {/* Tab 2.5: Profil-Hintergrund (Steam Live Background) */}
              {editTab === 'bg_steam' && (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                      {language === 'de' ? 'Profil-Hintergrund (Steam Live Background)' : 'Profile View Background (Steam Live Background)'}
                    </span>
                    <p className="text-xs text-white/60">
                      {language === 'de'
                        ? 'Dein synchronisierter Steam Live-Hintergrund (Video / HD-Artwork) wird als Hintergrund der gesamten Profil-Ansicht hinter deinen Karten angezeigt.'
                        : 'Your synced Steam live animated background (video or HD artwork) is displayed as the full background of your profile view.'}
                    </p>
                  </div>

                  {steamBg ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#66c0f4] font-medium flex items-center gap-1.5">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-3.5 h-3.5" alt="Steam" />
                          <span>{isVideoBanner(steamBg) ? 'Steam Live Animated Video (.mp4 / .webm)' : 'Steam High-Res Artwork'}</span>
                        </span>

                        <button
                          onClick={() => setEditShowSteamBg(!editShowSteamBg)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            editShowSteamBg 
                              ? 'bg-[#66c0f4]/20 border-[#66c0f4]/50 text-[#66c0f4]' 
                              : 'bg-white/5 border-white/10 text-white/40'
                          }`}
                        >
                          {editShowSteamBg ? (language === 'de' ? 'Aktiviert' : 'Enabled') : (language === 'de' ? 'Deaktiviert' : 'Disabled')}
                        </button>
                      </div>

                      <div className="relative h-44 rounded-xl overflow-hidden border border-white/10">
                        <ProfileMedia src={steamBg} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
                      <p className="text-xs text-white/50">
                        {language === 'de' 
                          ? 'Noch kein Steam-Profil verknüpft oder kein Steam-Hintergrund vorhanden.' 
                          : 'No Steam profile linked or no Steam background detected.'}
                      </p>
                      <button
                        onClick={() => setEditTab('steam')}
                        className="text-xs text-[#66c0f4] hover:underline cursor-pointer"
                      >
                        {language === 'de' ? 'Steam-Profil im Steam Sync Tab verknüpfen →' : 'Link Steam profile in Steam Sync Tab →'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Avatar Frames */}
              {editTab === 'frame' && (
                <div className="space-y-4">
                  <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                    {language === 'de' ? 'Avatar-Rahmen' : 'Avatar Frames'}
                  </label>
                  <div className="profile-steam-frame-choice">
                    <button id="profile-use-steam-frame" type="button" disabled={!steamFrameImage(settings.steamAvatarFrameUrl)} aria-pressed={editFrame === 'steam'} onClick={() => setEditFrame('steam')}>
                      <ProfileAvatar avatar={editAvatar} name={editName} steamFrame={settings.steamAvatarFrameUrl} steamFrameStatic={settings.steamAvatarFrameStaticUrl} small/>
                      <span><strong>{language === 'de' ? 'Mein Steam-Rahmen' : 'My Steam frame'}</strong><span>{steamFrameImage(settings.steamAvatarFrameUrl) ? (language === 'de' ? 'Verwendet den aktuell auf Steam ausgerüsteten Rahmen.' : 'Uses the frame currently equipped on Steam.') : (language === 'de' ? 'Noch kein ausgerüsteter Rahmen synchronisiert.' : 'No equipped frame has been synced yet.')}</span></span>
                      {editFrame === 'steam' && <Check size={16}/>}
                    </button>
                    <button type="button" className="profile-text-button" disabled={isSyncingSteam} onClick={() => settings.steamProfileUrl ? void handleRefreshSteamFrame() : setEditTab('steam')}><RefreshCw size={12} className={isSyncingSteam ? 'animate-spin' : ''}/>{settings.steamProfileUrl ? (language === 'de' ? 'Von Steam aktualisieren' : 'Refresh from Steam') : (language === 'de' ? 'Steam verknüpfen' : 'Link Steam')}</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    {AVATAR_FRAMES.map(frame => {
                      const isSelected = editFrame === frame.id
                      return (
                        <button type="button" aria-pressed={isSelected}
                          key={frame.id}
                          data-avatar-frame={frame.id}
                          onClick={() => setEditFrame(frame.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer flex flex-col items-center gap-2.5 transition-all ${
                            isSelected 
                              ? 'border-white bg-white/[0.06]' 
                              : 'border-white/[0.08] bg-[#14161c] hover:border-white/20'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-full p-1 launcher-card bg-[var(--launcher-card,#0c0d12)] border-2 ${frame.color} flex items-center justify-center`}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-black/90 flex items-center justify-center">
                              {editAvatar ? (
                                <img src={editAvatar} alt={t('uiPreview')} className="w-full h-full object-cover" />
                              ) : (
                                <User size={16} className="text-white/40" />
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-white/90 text-center">
                            {language === 'de' ? frame.labelDe : frame.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab 4: Bio & Socials */}
              {editTab === 'socials' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                        {language === 'de' ? 'Über mich / Status-Spruch' : 'About Me / Status Quote'}
                      </label>
                      <span className="text-[10px] text-white/40 font-mono">{editBio.length}/160</span>
                    </div>
                    <textarea 
                      rows={2}
                      maxLength={160}
                      placeholder={language === 'de' ? 'Schreibe einen kurzen Spruch...' : 'Write a short quote or bio...'}
                      value={editBio}
                      onChange={e => setEditBio(e.target.value)}
                      className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl p-3 text-xs text-white transition-colors focus:outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">Discord Tag</label>
                      <input 
                        type="text" 
                        placeholder="gamer#0001"
                        value={editDiscord}
                        onChange={e => setEditDiscord(e.target.value)}
                        className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white transition-colors focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">Twitch</label>
                      <input 
                        type="text" 
                        placeholder="streamer123"
                        value={editTwitch}
                        onChange={e => setEditTwitch(e.target.value)}
                        className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white transition-colors focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">YouTube</label>
                      <input 
                        type="text" 
                        placeholder="@pro_gamer"
                        value={editYoutube}
                        onChange={e => setEditYoutube(e.target.value)}
                        className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white transition-colors focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Steam Integration & Live Sync */}
              {editTab === 'steam' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">

                      {t('uiSteamIntegration')}
                    </span>
                    <p className="text-xs text-white/60">
                      {language === 'de' 
                        ? 'Verknüpfe dein Steam-Profil, um Avatar, Benutzernamen, Steam-Level, alle Abzeichen, Steam-Spiele und deinen Steam Live-Hintergrund automatisch zu synchronisieren.' 
                        : 'Link your Steam profile to sync avatar, username, level, badges, full game library, and live animated background.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                      {language === 'de' ? 'Steam Profil-URL oder SteamID64' : 'Steam Profile URL or SteamID64'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input 
                        type="text" 
                        placeholder={t('uiSteamProfileInput')}
                        value={editSteamUrl}
                        onChange={e => setEditSteamUrl(e.target.value)}
                        className="flex-1 bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none font-mono"
                      />
                      <button 
                        onClick={handleSyncSteam}
                        disabled={isSyncingSteam || !editSteamUrl.trim()}
                        className="px-4 py-2 bg-white text-black hover:bg-white/90 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-40 flex-shrink-0"
                      >
                        <RefreshCw size={13} className={isSyncingSteam ? 'animate-spin text-black' : 'text-black'} />
                        <span>{isSyncingSteam ? (language === 'de' ? 'Synchronisiere...' : 'Syncing...') : (language === 'de' ? 'Profil synchronisieren' : 'Sync Profile')}</span>
                      </button>
                    </div>
                  </div>

                  {settings.steamProfileUrl && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
                      <CheckCircle2 size={13} />
                      <span>{language === 'de' ? 'Steam-Profil ist verknüpft' : 'Steam profile is linked'}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 6: Gaming Rig & PC Specs */}
              {editTab === 'hardware' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                    <div>
                      <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                        {language === 'de' ? 'PC-Hardware (Automatisch erkannt)' : 'Hardware Specs (Auto-detected)'}
                      </span>
                      <span className="text-xs text-white/60">
                        {language === 'de' ? 'Vollständige Hardware-Komponenten aus Windows' : 'Full hardware specifications from Windows'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRedetectHardware}
                        disabled={isDetectingHardware}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <RefreshCw size={12} className={isDetectingHardware ? 'animate-spin' : ''} />
                        {language === 'de' ? 'Neu auslesen' : 'Refresh'}
                      </button>

                      <button
                        onClick={() => setEditShowHardware(!editShowHardware)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          editShowHardware 
                            ? 'bg-white/10 border-white/20 text-white' 
                            : 'bg-white/[0.03] border-white/10 text-white/40'
                        }`}
                      >
                        {editShowHardware 
                          ? (language === 'de' ? 'Sichtbar im Profil' : 'Visible on Profile') 
                          : (language === 'de' ? 'Ausgeblendet' : 'Hidden')}
                      </button>
                    </div>
                  </div>

                  {/* Clean Non-Truncated Specs Layout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">GPU</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">{displayHardware?.gpu || '—'}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">CPU</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">{displayHardware?.cpu || '—'}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">{t('uiMemory')}</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">{displayHardware?.ram || '—'}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">{t('uiDisplayOs')}</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">
                        {displayHardware?.display || 'Primary Monitor'}
                        {displayHardware?.os ? ` • ${displayHardware.os}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {saveError && <p className="profile-error" role="alert">{saveError}</p>}
              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-2.5 pt-5 border-t border-white/[0.06] mt-5">
                <button 
                  disabled={isSaving}
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button 
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                  className="profile-editor-save"
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin"/> : <Save size={13}/>} {t('save')}
                </button>
              </div>
            </div>
          </ProfileDialog>
          )}
        </>
    </div>
  )
}
