import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Library, Clock, Save, Edit3, Settings, Trophy, Gamepad2, 
  UserPlus, Check, ArrowLeft, Loader2, Cpu, Zap, HardDrive, Monitor, 
  Image as ImageIcon, Sparkles, Copy, ExternalLink, X, RefreshCw, 
  MessageSquare, CheckCircle2
} from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { syncMyProfile, fetchUserProfile, sendFriendRequest } from '../../services/socialService'
import { fetchSteamUserProfile } from '../../services/steamService'
import { formatLastSeen } from '../../services/assetHelper'
import { sendAppNotification } from '../../services/notificationService'
import type { EclipseFriend } from '../../types/game'

const BANNER_PRESETS = [
  { id: 'galaxy', name: 'Galaxy', url: 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?q=80&w=1600&auto=format&fit=crop' },
  { id: 'cyberpunk', name: 'Cyberpunk', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop' },
  { id: 'synthwave', name: 'Synthwave', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop' },
  { id: 'minimal', name: 'Minimalist', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop' },
  { id: 'aurora', name: 'Aurora', url: 'https://images.unsplash.com/photo-1579033461380-adb47c3eb938?q=80&w=1600&auto=format&fit=crop' },
  { id: 'deep_space', name: 'Deep Space', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1600&auto=format&fit=crop' },
]

const AVATAR_FRAMES = [
  { id: 'none', label: 'None', labelDe: 'Kein Rahmen', color: 'border-white/10' },
  { id: 'eclipse_neon', label: 'Eclipse Glow', labelDe: 'Eclipse Glow', color: 'border-purple-400/90 shadow-[0_0_12px_rgba(168,85,247,0.4)]' },
  { id: 'cyberpunk', label: 'Cyberpunk', labelDe: 'Cyberpunk', color: 'border-cyan-400/90 shadow-[0_0_12px_rgba(6,182,212,0.4)]' },
  { id: 'golden_vip', label: 'Gold VIP', labelDe: 'Gold VIP', color: 'border-amber-400/90 shadow-[0_0_12px_rgba(251,191,36,0.4)]' },
  { id: 'fire_blaze', label: 'Fire Blaze', labelDe: 'Fire Blaze', color: 'border-rose-400/90 shadow-[0_0_12px_rgba(244,63,94,0.4)]' },
  { id: 'emerald_pulse', label: 'Emerald', labelDe: 'Smaragd', color: 'border-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.4)]' },
]

export function ProfileView() {
  const { library, installedGames, settings, updateSettings, activeGame } = useGameStore()
  const { setActiveView, openGameDetails, setActiveSettingsTab, selectedFriendId, setSelectedFriendId } = useUIStore()
  const { t, language } = useTranslation()
  
  const [fetchedProfile, setFetchedProfile] = useState<any | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isSendingRequest, setIsSendingRequest] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [copiedDiscord, setCopiedDiscord] = useState(false)

  const friend = selectedFriendId ? settings.eclipseFriends?.find(f => f.id === selectedFriendId) : null
  const isViewingFriend = !!selectedFriendId
  const isAlreadyFriend = isViewingFriend && (!!friend || (settings.eclipseFriends?.some(f => f.id === selectedFriendId) ?? false))

  // Fetch full live profile data when viewing a friend or searched player
  useEffect(() => {
    if (selectedFriendId) {
      setIsLoadingProfile(true)
      setRequestSent(false)
      fetchUserProfile(selectedFriendId).then(async (data) => {
        if (data) {
          setFetchedProfile(data)
        } else {
          // Fallback to Steam profile lookup if numeric ID
          const steamData = await fetchSteamUserProfile(selectedFriendId)
          if (steamData && steamData.steamId64) {
            setFetchedProfile({
              username: steamData.username,
              avatarUrl: steamData.avatarFull,
              level: steamData.steamLevel,
              steamLevel: steamData.steamLevel,
              steamGamesCount: steamData.steamGamesCount,
              steamBadgesCount: steamData.steamBadgesCount,
              steamFavoriteBadge: steamData.steamFavoriteBadge,
              steamRecentGames: steamData.steamRecentGames,
              steamProfileUrl: `https://steamcommunity.com/profiles/${steamData.steamId64}`,
              status: steamData.onlineState === 'in-game' ? 'ingame' : steamData.onlineState === 'online' ? 'online' : 'offline',
            })
          }
        }
        setIsLoadingProfile(false)
      }).catch(() => setIsLoadingProfile(false))
    } else {
      setFetchedProfile(null)
      // When viewing own profile, sync latest playtime & games to Firebase
      syncMyProfile()
    }
  }, [selectedFriendId])

  // Customization Form States
  const [isEditing, setIsEditing] = useState(false)
  const [editTab, setEditTab] = useState<'general' | 'banner' | 'frame' | 'socials' | 'steam' | 'hardware'>('general')
  const [editName, setEditName] = useState(settings.username || 'User')
  const [editAvatar, setEditAvatar] = useState(settings.avatarUrl || '')
  const [editBanner, setEditBanner] = useState(settings.bannerUrl || '')
  const [editFrame, setEditFrame] = useState(settings.avatarFrame || 'none')
  const [editBio, setEditBio] = useState(settings.bio || '')
  const [editDiscord, setEditDiscord] = useState(settings.socialDiscord || '')
  const [editTwitch, setEditTwitch] = useState(settings.socialTwitch || '')
  const [editYoutube, setEditYoutube] = useState(settings.socialYoutube || '')
  const [editSteamUrl, setEditSteamUrl] = useState(settings.steamProfileUrl || '')
  const [editShowHardware, setEditShowHardware] = useState(settings.showHardwareSpecs !== false)
  const [editShowPlaytime, setEditShowPlaytime] = useState(settings.profileShowPlaytime !== false)
  const [editShowSteamStats, setEditShowSteamStats] = useState(settings.profileShowSteamStats !== false)

  const [isSyncingSteam, setIsSyncingSteam] = useState(false)
  const [isDetectingHardware, setIsDetectingHardware] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setEditName(settings.username || 'User')
      setEditAvatar(settings.avatarUrl || '')
      setEditBanner(settings.bannerUrl || '')
      setEditFrame(settings.avatarFrame || 'none')
      setEditBio(settings.bio || '')
      setEditDiscord(settings.socialDiscord || '')
      setEditTwitch(settings.socialTwitch || '')
      setEditYoutube(settings.socialYoutube || '')
      setEditSteamUrl(settings.steamProfileUrl || '')
      setEditShowHardware(settings.showHardwareSpecs !== false)
      setEditShowPlaytime(settings.profileShowPlaytime !== false)
      setEditShowSteamStats(settings.profileShowSteamStats !== false)
    }
  }, [settings, isEditing])

  // Combined stats resolution
  const profileData = fetchedProfile || friend

  const displayName = isViewingFriend 
    ? (profileData?.username || friend?.username || 'Eclipse Player') 
    : (settings.username || 'User')
  
  const displayAvatar = isViewingFriend 
    ? (profileData?.avatarUrl || friend?.avatarUrl || '') 
    : settings.avatarUrl

  const displayBanner = isViewingFriend
    ? (profileData?.bannerUrl || friend?.bannerUrl || BANNER_PRESETS[0].url)
    : (settings.bannerUrl || BANNER_PRESETS[0].url)

  const displayFrame = isViewingFriend
    ? (profileData?.avatarFrame || friend?.avatarFrame || 'none')
    : (settings.avatarFrame || 'none')

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
    ? (profileData?.showHardwareSpecs !== false)
    : (settings.showHardwareSpecs !== false)

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

  const steamFavoriteBadge = isViewingFriend 
    ? (profileData?.steamFavoriteBadge || friend?.steamFavoriteBadge) 
    : settings.steamFavoriteBadge

  const steamRecentGames = isViewingFriend 
    ? (profileData?.steamRecentGames || friend?.steamRecentGames || []) 
    : (settings.steamRecentGames || [])

  const friendStatus = profileData?.status || friend?.status || 'offline'
  const friendCurrentGame = friendStatus === 'ingame' ? (profileData?.currentGame || friend?.currentGame) : null
  
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

  // Local Playtime Calculations (for own profile)
  const allUserGamesMap = new Map<string, any>()
  library.forEach(g => allUserGamesMap.set(g.id || g.name, { ...g }))
  installedGames.forEach(g => {
    const key = g.id || g.name
    let base = allUserGamesMap.get(key)
    if (!base) {
      const foundEntry = Array.from(allUserGamesMap.entries()).find(([k, lg]) => lg.name.toLowerCase() === g.name.toLowerCase())
      if (foundEntry) {
        base = foundEntry[1]
        allUserGamesMap.delete(foundEntry[0])
      }
    }
    const existingData = base || {}
    allUserGamesMap.set(key, {
      ...existingData,
      ...g,
      playTimeMinutes: Math.max(existingData.playTimeMinutes || 0, g.playTimeMinutes || 0),
      lastPlayed: Math.max(existingData.lastPlayed || 0, g.lastPlayed || 0)
    })
  })

  const allUserGames = Array.from(allUserGamesMap.values())
  const totalPlaytimeMins = Math.round(allUserGames.reduce((acc, g) => acc + (g.playTimeMinutes || 0), 0))
  const totalPlaytimeHours = totalPlaytimeMins >= 60 
    ? (totalPlaytimeMins / 60).toFixed(1) + 'h' 
    : `${totalPlaytimeMins}m`

  const topPlayedGames = [...allUserGames]
    .sort((a, b) => (b.playTimeMinutes || 0) - (a.playTimeMinutes || 0))
    .filter(g => (g.playTimeMinutes || 0) > 0)
    .slice(0, 5)

  const totalLibraryCount = installedGames.length + library.filter(g => !installedGames.some(ig => ig.name === g.name)).length

  // Profile Display Values (seamlessly bridging cloud-synced friends and local user)
  const displayTotalPlaytime = isViewingFriend 
    ? (profileData?.totalPlaytimeHours || friend?.totalPlaytimeHours || (steamRecentGames.length > 0 ? (() => {
        let hrs = 0
        steamRecentGames.forEach((g: any) => {
          const m = g.playtime ? g.playtime.match(/([\d.,]+)\s*hrs?/i) : null
          if (m) hrs += parseFloat(m[1].replace(',', '.')) || 0
        })
        return hrs > 0 ? `${hrs.toFixed(1)}h` : '0h'
      })() : '0h'))
    : totalPlaytimeHours

  const displayLibraryCount = isViewingFriend
    ? (profileData?.totalLibraryCount ?? friend?.totalLibraryCount ?? steamGamesCount ?? (steamRecentGames.length || 0))
    : totalLibraryCount

  const displayInstalledCount = isViewingFriend
    ? (profileData?.totalInstalledCount ?? friend?.totalInstalledCount ?? (friendStatus === 'ingame' ? (friendCurrentGame || 'In-Game') : (friendStatus === 'online' ? 'Online' : 'Offline')))
    : installedGames.filter(g => g.installed !== false).length

  const displayTopGames = isViewingFriend
    ? (profileData?.topPlayedGames || friend?.topPlayedGames || [])
    : topPlayedGames

  function handleSave() {
    const patch = {
      username: editName,
      avatarUrl: editAvatar,
      bannerUrl: editBanner,
      avatarFrame: editFrame,
      bio: editBio,
      socialDiscord: editDiscord,
      socialTwitch: editTwitch,
      socialYoutube: editYoutube,
      steamProfileUrl: editSteamUrl,
      showHardwareSpecs: editShowHardware,
      profileShowPlaytime: editShowPlaytime,
      profileShowSteamStats: editShowSteamStats
    }

    if (window.electronAPI?.setSettings) {
      window.electronAPI.setSettings(patch).then(res => {
        if (res?.success !== false) {
          updateSettings(patch)
          syncMyProfile()
          setIsEditing(false)
          sendAppNotification({
            title: language === 'de' ? 'Profil gespeichert' : 'Profile Saved',
            body: language === 'de' ? 'Änderungen wurden übernommen.' : 'Changes have been saved.',
            type: 'success'
          })
        }
      })
    } else {
      updateSettings(patch)
      syncMyProfile()
      setIsEditing(false)
      sendAppNotification({
        title: language === 'de' ? 'Profil gespeichert' : 'Profile Saved',
        body: language === 'de' ? 'Änderungen wurden übernommen.' : 'Changes have been saved.',
        type: 'success'
      })
    }
  }

  async function handleSyncSteam() {
    if (!editSteamUrl.trim()) return
    setIsSyncingSteam(true)
    try {
      const profile = await fetchSteamUserProfile(editSteamUrl.trim())
      if (profile) {
        setEditName(profile.username)
        setEditAvatar(profile.avatarFull)
        const patch = {
          username: profile.username,
          avatarUrl: profile.avatarFull,
          steamProfileUrl: editSteamUrl.trim(),
          steamLevel: profile.steamLevel ?? 0,
          steamGamesCount: profile.steamGamesCount ?? 0,
          steamBadgesCount: profile.steamBadgesCount ?? 0,
          steamRecentGames: profile.steamRecentGames || [],
          steamFavoriteBadge: profile.steamFavoriteBadge || null
        }
        updateSettings(patch)
        if (window.electronAPI?.setSettings) {
          await window.electronAPI.setSettings(patch)
        }
        await syncMyProfile()
        sendAppNotification({
          title: language === 'de' ? 'Steam synchronisiert' : 'Steam Synced',
          body: language === 'de' ? `Profil von ${profile.username} erfolgreich verknüpft.` : `Profile of ${profile.username} linked.`,
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
      console.warn('Steam sync error:', e)
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
        updateSettings({ hardwareSpecs: specs })
        if (window.electronAPI?.setSettings) {
          await window.electronAPI.setSettings({ hardwareSpecs: specs })
        }
        await syncMyProfile()
        sendAppNotification({
          title: language === 'de' ? 'Hardware aktualisiert' : 'Hardware Refreshed',
          body: language === 'de' ? 'PC-Komponenten wurden neu ausgelesen.' : 'PC specs refreshed.',
          type: 'success'
        })
      }
    } finally {
      setIsDetectingHardware(false)
    }
  }

  async function handleSendFriendReq() {
    if (!profileData?.friendCode && !selectedFriendId) return
    setIsSendingRequest(true)
    try {
      const codeOrUid = profileData?.friendCode || selectedFriendId
      const res = await sendFriendRequest(codeOrUid)
      if (res.success) {
        setRequestSent(true)
        sendAppNotification({
          title: language === 'de' ? 'Anfrage gesendet! 👥' : 'Request Sent! 👥',
          body: res.message || (language === 'de' ? 'Freundschaftsanfrage erfolgreich übermittelt.' : 'Friend request sent.'),
          type: 'success',
          duration: 5000
        })
        return
      }

      const currentFriends = settings.eclipseFriends || []
      const targetId = profileData?.uid || profileData?.steamId64 || selectedFriendId
      if (targetId && !currentFriends.some(f => f.id === targetId)) {
        const newFriend: EclipseFriend = {
          id: targetId,
          username: displayName,
          avatarUrl: displayAvatar || '',
          bannerUrl: displayBanner,
          avatarFrame: displayFrame,
          bio: displayBio,
          status: friendStatus as any,
          currentGame: friendCurrentGame || undefined,
          steamProfileUrl: profileData?.steamProfileUrl || (selectedFriendId ? `https://steamcommunity.com/profiles/${selectedFriendId}` : undefined),
          level: steamLevel || 1,
          steamLevel: steamLevel || 1,
          steamRecentGames: steamRecentGames || [],
          steamFavoriteBadge: steamFavoriteBadge || null,
        }
        updateSettings({
          eclipseFriends: [...currentFriends, newFriend]
        })
        setRequestSent(true)
        sendAppNotification({
          title: language === 'de' ? 'Freund hinzugefügt! 👥' : 'Friend Added! 👥',
          body: language === 'de' ? `Freund ${displayName} wurde hinzugefügt!` : `Friend ${displayName} added!`,
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

  // Reusable clean monochrome checkbox
  const CleanCheckbox = ({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) => (
    <label className="flex items-start gap-3 cursor-pointer group select-none">
      <div 
        className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-all duration-150 flex-shrink-0 mt-0.5 ${
          checked 
            ? 'bg-white border-white text-black shadow-sm' 
            : 'bg-white/[0.04] border-white/20 group-hover:border-white/40'
        }`}
      >
        {checked && <Check size={11} strokeWidth={3} className="text-black" />}
      </div>
      <div className="flex-1">
        <span className="text-xs text-white/85 group-hover:text-white transition-colors block font-medium">
          {label}
        </span>
        {description && (
          <span className="text-[11px] text-white/40 block mt-0.5">
            {description}
          </span>
        )}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={onChange} />
    </label>
  )

  return (
    <div className="h-full overflow-y-auto bg-[#07080a] select-none">
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        
        {/* Header Profile Card with Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0e1015] border border-white/[0.08] rounded-2xl overflow-hidden mb-8 shadow-xl relative"
        >
          {/* Cover Banner */}
          <div className="relative h-44 md:h-52 w-full overflow-hidden bg-[#07080a]">
            {displayBanner && (
              <img 
                src={displayBanner} 
                alt="Profile Banner" 
                className="w-full h-full object-cover object-center filter brightness-95" 
              />
            )}
            {/* Banner Dark Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e1015] via-[#0e1015]/40 to-transparent" />
            
            {/* Quick Edit Banner Button (for local user) */}
            {!isViewingFriend && !isEditing && (
              <button 
                onClick={() => { setIsEditing(true); setEditTab('banner'); }}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <ImageIcon size={13} /> {language === 'de' ? 'Banner bearbeiten' : 'Edit Banner'}
              </button>
            )}
          </div>

          {/* Profile Header Content */}
          <div className="px-7 pb-7 pt-0 relative z-10 flex flex-col md:flex-row items-center md:items-end gap-5 -mt-16 md:-mt-18">
            
            {/* Avatar with Frame */}
            <div className="relative group flex-shrink-0">
              <div className={`w-32 h-32 md:w-36 md:h-36 rounded-full p-1 bg-[#0e1015] border-2 ${getFrameClass(displayFrame)} transition-all duration-200 relative flex items-center justify-center`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-black/90 flex items-center justify-center">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User size={56} className="text-white/30" />
                  )}
                </div>
              </div>

              {!isViewingFriend && !isEditing && (
                <button
                  onClick={() => { setIsEditing(true); setEditTab('frame'); }}
                  className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-medium gap-1"
                >
                  <Sparkles size={14} className="text-white/80" />
                </button>
              )}
            </div>

            {/* Profile Info & Badges */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-wrap items-center gap-2.5 justify-center md:justify-start mb-1.5">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight uppercase">
                  {displayName}
                </h1>
                
                {profileData?.friendCode && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-white/[0.04] border border-white/10 text-white/60">
                    {profileData.friendCode}
                  </span>
                )}
              </div>

              {/* Status and Badges Line */}
              <div className="flex flex-wrap items-center gap-2.5 justify-center md:justify-start mt-1">
                {/* Live Status */}
                <div className="flex items-center gap-2 text-xs font-medium text-hub-muted bg-white/[0.03] px-2.5 py-0.5 rounded-md border border-white/[0.06]">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
                  <span className={isOnline ? 'text-white/90' : 'text-white/50'}>
                    {isViewingFriend ? friendStatusText : t('online')}
                  </span>
                </div>

                {/* Member Badge */}
                {(isViewingFriend ? (profileData?.steamProfileUrl || friend?.steamProfileUrl) : settings.steamProfileUrl) ? (
                  <span className="text-xs font-medium text-[#66c0f4] flex items-center gap-1.5 bg-[#1b2838]/60 border border-[#2a475e]/40 px-2.5 py-0.5 rounded-md">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-3.5 h-3.5" alt="Steam" />
                    Steam
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-white/70 bg-white/[0.03] border border-white/[0.08] px-2.5 py-0.5 rounded-md">
                    ECLIPSE
                  </span>
                )}

                {/* In-Game Live Badge */}
                {!isViewingFriend && activeGame && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                    <Gamepad2 size={12} className="text-indigo-400 flex-shrink-0" />
                    <span className="truncate">
                      <span className="text-white/40">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                      <span className="text-white font-medium">{activeGame.name}</span>
                    </span>
                  </div>
                )}
                {isViewingFriend && friendCurrentGame && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse flex-shrink-0" />
                    <Gamepad2 size={12} className="text-purple-400 flex-shrink-0" />
                    <span className="truncate">
                      <span className="text-white/40">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                      <span className="text-white font-medium">{friendCurrentGame}</span>
                    </span>
                  </div>
                )}

                {/* Steam Stats Grouping */}
                {steamLevel !== undefined && (settings.profileShowSteamStats !== false) && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-white/70 text-xs font-medium">
                    <Trophy size={11} className="text-amber-400/80" />
                    <span>Lvl {steamLevel}</span>
                  </div>
                )}
              </div>

              {/* Bio & Status Quote */}
              {displayBio && (
                <p className="mt-2.5 text-xs text-white/65 italic max-w-xl font-normal leading-relaxed">
                  "{displayBio}"
                </p>
              )}

              {/* Social Tags */}
              {(displayDiscord || displayTwitch || displayYoutube) && (
                <div className="flex flex-wrap items-center gap-2 mt-3 justify-center md:justify-start">
                  {displayDiscord && (
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(displayDiscord)
                        setCopiedDiscord(true)
                        setTimeout(() => setCopiedDiscord(false), 2000)
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.06] text-[11px] font-medium transition-all cursor-pointer"
                      title="Click to copy Discord Tag"
                    >
                      <span className="font-semibold text-white/50">Discord:</span> {displayDiscord}
                      {copiedDiscord ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="opacity-40" />}
                    </button>
                  )}
                  {displayTwitch && (
                    <a 
                      href={`https://twitch.tv/${displayTwitch.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.06] text-[11px] font-medium transition-all"
                    >
                      <span className="font-semibold text-white/50">Twitch:</span> {displayTwitch}
                      <ExternalLink size={11} className="opacity-40" />
                    </a>
                  )}
                  {displayYoutube && (
                    <a 
                      href={`https://youtube.com/${displayYoutube.startsWith('@') ? displayYoutube : '@' + displayYoutube}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.06] text-[11px] font-medium transition-all"
                    >
                      <span className="font-semibold text-white/50">YouTube:</span> {displayYoutube}
                      <ExternalLink size={11} className="opacity-40" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Profile Action Buttons */}
            <div className="flex flex-wrap gap-2 justify-center md:justify-end flex-shrink-0">
              {!isViewingFriend ? (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-white text-black hover:bg-white/90 font-semibold px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Edit3 size={13} /> {t('editProfile')}
                  </button>
                  <button 
                    onClick={() => {
                      setActiveSettingsTab('profile')
                      setActiveView('settings')
                    }}
                    className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings size={13} /> {t('settings')}
                  </button>
                </>
              ) : (
                <>
                  {!isAlreadyFriend && (
                    <button 
                      onClick={handleSendFriendReq}
                      disabled={isSendingRequest || requestSent}
                      className="bg-white text-black font-semibold hover:bg-white/90 px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                    >
                      {isSendingRequest ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : requestSent ? (
                        <Check size={13} className="text-emerald-600" />
                      ) : (
                        <UserPlus size={13} />
                      )}
                      {requestSent 
                        ? (language === 'de' ? 'Anfrage gesendet' : 'Request Sent') 
                        : (language === 'de' ? 'Freund hinzufügen' : 'Add Friend')}
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedFriendId(null)}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft size={13} /> {language === 'de' ? 'Mein Profil' : 'My Profile'}
                  </button>
                </>
              )}
            </div>

          </div>
        </motion.div>

        {/* Minimalist Profile Settings & Customization Suite */}
        <AnimatePresence>
          {isEditing && (
            <motion.div 
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0e1015] border border-white/[0.08] rounded-2xl p-6 mb-8 shadow-xl relative"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-5">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {language === 'de' ? 'Profil bearbeiten' : 'Edit Profile'}
                </h3>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Minimalist Flat Nav Tabs */}
              <div className="flex flex-wrap gap-1.5 mb-6 border-b border-white/[0.06] pb-3">
                {[
                  { id: 'general', label: language === 'de' ? 'Allgemein' : 'General', icon: User },
                  { id: 'banner', label: language === 'de' ? 'Banner' : 'Banner', icon: ImageIcon },
                  { id: 'frame', label: language === 'de' ? 'Avatar-Rahmen' : 'Avatar Frames', icon: Sparkles },
                  { id: 'socials', label: language === 'de' ? 'Bio & Socials' : 'Bio & Socials', icon: MessageSquare },
                  { id: 'steam', label: 'Steam Sync', icon: RefreshCw },
                  { id: 'hardware', label: language === 'de' ? 'PC-Hardware' : 'Hardware Specs', icon: Cpu },
                ].map(tab => {
                  const Icon = tab.icon
                  const isActive = editTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setEditTab(tab.id as any)}
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
                        type="text" 
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
                      description={language === 'de' ? 'Zeigt die akkumulierte Spielzeit aller Spiele öffentlich auf deinem Profil an.' : 'Displays your total playtime across all games on your profile.'}
                    />

                    <CleanCheckbox 
                      checked={editShowSteamStats}
                      onChange={() => setEditShowSteamStats(!editShowSteamStats)}
                      label={language === 'de' ? 'Steam-Level & Abzeichen anzeigen' : 'Show Steam Level & Badges'}
                      description={language === 'de' ? 'Zeigt dein synchronisiertes Steam-Level und deine Steam-Aktivität an.' : 'Displays your synced Steam level and recent activity.'}
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Banner Presets & Custom */}
              {editTab === 'banner' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2.5">
                      {language === 'de' ? 'Banner-Vorlage auswählen' : 'Select Banner Preset'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {BANNER_PRESETS.map(preset => {
                        const isSelected = editBanner === preset.url
                        return (
                          <div 
                            key={preset.id}
                            onClick={() => setEditBanner(preset.url)}
                            className={`group relative h-20 rounded-xl overflow-hidden border cursor-pointer transition-all ${
                              isSelected ? 'border-white ring-1 ring-white' : 'border-white/[0.08] hover:border-white/30'
                            }`}
                          >
                            <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                            
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <Check size={10} className="text-black" strokeWidth={3} />
                              </div>
                            )}

                            <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white drop-shadow-sm truncate max-w-[90%]">
                              {preset.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                      {language === 'de' ? 'Oder eigene Banner-Bild URL (JPG / PNG / GIF)' : 'Or custom banner image URL (JPG / PNG / GIF)'}
                    </label>
                    <input 
                      type="text" 
                      placeholder="https://..."
                      value={editBanner}
                      onChange={e => setEditBanner(e.target.value)}
                      className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2 text-xs text-white font-mono transition-colors focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Avatar Frames */}
              {editTab === 'frame' && (
                <div className="space-y-4">
                  <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                    {language === 'de' ? 'Avatar-Rahmen' : 'Avatar Frames'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    {AVATAR_FRAMES.map(frame => {
                      const isSelected = editFrame === frame.id
                      return (
                        <div 
                          key={frame.id}
                          onClick={() => setEditFrame(frame.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer flex flex-col items-center gap-2.5 transition-all ${
                            isSelected 
                              ? 'border-white bg-white/[0.06]' 
                              : 'border-white/[0.08] bg-[#14161c] hover:border-white/20'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-full p-1 bg-[#0e1015] border-2 ${frame.color} flex items-center justify-center`}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-black/90 flex items-center justify-center">
                              {editAvatar ? (
                                <img src={editAvatar} alt="preview" className="w-full h-full object-cover" />
                              ) : (
                                <User size={16} className="text-white/40" />
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-white/90 text-center">
                            {language === 'de' ? frame.labelDe : frame.label}
                          </span>
                        </div>
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
                      Steam Integration
                    </span>
                    <p className="text-xs text-white/60">
                      {language === 'de' 
                        ? 'Verknüpfe dein Steam-Profil, um Avatar, Benutzernamen, Steam-Level, Abzeichen und zuletzt gespielte Spiele automatisch zu synchronisieren.' 
                        : 'Link your Steam profile to sync avatar, username, level, badges, and recent games.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                      {language === 'de' ? 'Steam Profil-URL oder SteamID64' : 'Steam Profile URL or SteamID64'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input 
                        type="text" 
                        placeholder="https://steamcommunity.com/id/... oder 76561198..."
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
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">Memory</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">{displayHardware?.ram || '—'}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-semibold uppercase text-white/40 block">Display & OS</span>
                      <p className="text-xs font-medium text-white break-words leading-relaxed">
                        {displayHardware?.display || 'Primary Monitor'}
                        {displayHardware?.os ? ` • ${displayHardware.os}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-2.5 pt-5 border-t border-white/[0.06] mt-5">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleSave}
                  className="bg-white text-black hover:bg-white/90 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save size={13} className="text-black" /> {t('save')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimalist Gaming Rig & Hardware Showcase (Full Visibility, No Cutoff) */}
        {displayShowHardware && displayHardware && (displayHardware.cpu || displayHardware.gpu) && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0e1015] border border-white/[0.08] rounded-2xl p-5 md:p-6 mb-8 relative shadow-lg"
          >
            {/* Header with Title & Auto-Detected Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Cpu size={15} className="text-white/60" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  {language === 'de' ? 'System-Hardware' : 'System Hardware'}
                </h3>
                <span className="text-[10px] text-emerald-400 font-mono">
                  • {language === 'de' ? 'automatisch erkannt' : 'auto-detected'}
                </span>
              </div>

              {/* Visibility Switch on own profile */}
              {!isViewingFriend && (
                <button
                  onClick={() => {
                    const next = !settings.showHardwareSpecs
                    updateSettings({ showHardwareSpecs: next })
                    if (window.electronAPI?.setSettings) {
                      window.electronAPI.setSettings({ showHardwareSpecs: next })
                    }
                    syncMyProfile()
                  }}
                  className="text-[11px] font-medium text-white/40 hover:text-white transition-colors cursor-pointer"
                  title="Toggle public visibility"
                >
                  {settings.showHardwareSpecs !== false 
                    ? (language === 'de' ? 'Sichtbar' : 'Visible') 
                    : (language === 'de' ? 'Ausgeblendet' : 'Hidden')}
                </button>
              )}
            </div>

            {/* Clean Minimalist Specs Row (Full Visibility, No Truncation) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* GPU */}
              {displayHardware.gpu && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Graphics</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.gpu}
                  </p>
                </div>
              )}

              {/* CPU */}
              {displayHardware.cpu && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Processor</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.cpu}
                  </p>
                </div>
              )}

              {/* RAM */}
              {displayHardware.ram && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Memory</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.ram}
                  </p>
                </div>
              )}

              {/* Display / OS */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Display & OS</span>
                <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                  {displayHardware.display ? displayHardware.display : 'Primary Monitor'}
                  {displayHardware.os ? ` • ${displayHardware.os}` : ''}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-8">
          {(!isViewingFriend ? settings.profileShowPlaytime !== false : true) && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-[#0e1015] border border-white/[0.08] rounded-xl p-4 shadow-sm"
            >
              <span className="text-[10px] font-mono font-medium uppercase text-white/40 block mb-1">{t('totalPlaytime')}</span>
              <p className="text-lg font-bold text-white">{displayTotalPlaytime}</p>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0e1015] border border-white/[0.08] rounded-xl p-4 shadow-sm"
          >
            <span className="text-[10px] font-mono font-medium uppercase text-white/40 block mb-1">{t('gamesInLibrary')}</span>
            <p className="text-lg font-bold text-white">{displayLibraryCount}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-[#0e1015] border border-white/[0.08] rounded-xl p-4 shadow-sm"
          >
            <span className="text-[10px] font-mono font-medium uppercase text-white/40 block mb-1">
              {isViewingFriend ? 'Activity / Installed' : t('installedGames')}
            </span>
            <p className="text-lg font-bold text-white">{displayInstalledCount}</p>
          </motion.div>
        </div>

        {/* Most Played Games Section */}
        {displayTopGames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#0e1015] border border-white/[0.08] rounded-2xl p-5 mb-8 shadow-sm"
          >
            <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy size={14} className="text-amber-400" />
              {language === 'de' ? 'Meistgespielte Spiele' : 'Most Played Games'}
            </h3>
            <div className="space-y-1.5">
              {displayTopGames.map((game: any, idx: number) => {
                const mins = Math.round(game.playTimeMinutes || 0)
                const hrs = mins >= 60 ? (mins / 60).toFixed(1) + ' hrs' : `${mins} mins`
                const sId = 'steamId' in game ? game.steamId : undefined

                return (
                  <div
                    key={game.id || game.name}
                    onClick={() => {
                      if (sId) openGameDetails(sId, game.name)
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-white/30 w-4 text-center">#{idx + 1}</span>
                      <p className="text-xs font-medium text-white group-hover:text-white transition-colors">{game.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-white/30" />
                      <span className="text-xs text-white/70">{hrs}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Steam Recent Activity Showcase */}
        {steamRecentGames && steamRecentGames.length > 0 && (settings.profileShowSteamStats !== false) && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-3.5">
              <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Steam Recent Activity</h3>
              <div className="h-[1px] flex-1 bg-white/[0.06]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {steamRecentGames.slice(0, 3).map((game: any) => (
                <div key={game.appId || game.name} className="bg-[#0e1015] rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/20 transition-all shadow-sm">
                  <div className="relative h-20 overflow-hidden">
                    <img src={game.iconUrl} alt={game.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e1015] to-transparent" />
                  </div>
                  <div className="p-3 relative -mt-4">
                    <h4 className="font-medium text-white text-xs truncate drop-shadow-sm mb-0.5">{game.name}</h4>
                    <p className="text-[11px] text-[#66c0f4] font-medium">{game.playtime}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}
