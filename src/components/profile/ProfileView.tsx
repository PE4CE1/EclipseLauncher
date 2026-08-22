import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Library, Clock, Save, Edit3, Settings, Trophy, Gamepad2, Award, 
  UserPlus, Check, ArrowLeft, Loader2, Cpu, Zap, HardDrive, Monitor, 
  Image as ImageIcon, Sparkles, Copy, ExternalLink, X, RefreshCw, Shield, 
  Link2, MessageSquare, CheckCircle2
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
  { id: 'galaxy', name: 'Eclipse Galaxy', url: 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?q=80&w=1600&auto=format&fit=crop' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop' },
  { id: 'synthwave', name: 'Retro Synthwave', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop' },
  { id: 'minimal', name: 'Dark Minimalist', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop' },
  { id: 'aurora', name: 'Aurora Glow', url: 'https://images.unsplash.com/photo-1579033461380-adb47c3eb938?q=80&w=1600&auto=format&fit=crop' },
  { id: 'deep_space', name: 'Deep Space', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1600&auto=format&fit=crop' },
]

const AVATAR_FRAMES = [
  { id: 'none', label: 'None', labelDe: 'Kein Rahmen', color: 'border-white/15' },
  { id: 'eclipse_neon', label: 'Eclipse Neon', labelDe: 'Eclipse Neon', color: 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.7)] ring-2 ring-purple-400' },
  { id: 'cyberpunk', label: 'Cyberpunk', labelDe: 'Cyberpunk', color: 'border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.8)] ring-2 ring-yellow-400' },
  { id: 'golden_vip', label: 'Gold VIP', labelDe: 'Gold VIP', color: 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)] ring-2 ring-yellow-300' },
  { id: 'fire_blaze', label: 'Fire Blaze', labelDe: 'Fire Blaze', color: 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)] ring-2 ring-orange-400' },
  { id: 'emerald_pulse', label: 'Emerald', labelDe: 'Smaragd', color: 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] ring-2 ring-teal-300' },
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
            title: language === 'de' ? 'Profil gespeichert! ✨' : 'Profile Saved! ✨',
            body: language === 'de' ? 'Deine Änderungen wurden erfolgreich synchronisiert.' : 'Your changes were successfully synced.',
            type: 'success'
          })
        }
      })
    } else {
      updateSettings(patch)
      syncMyProfile()
      setIsEditing(false)
      sendAppNotification({
        title: language === 'de' ? 'Profil gespeichert! ✨' : 'Profile Saved! ✨',
        body: language === 'de' ? 'Deine Änderungen wurden erfolgreich synchronisiert.' : 'Your changes were successfully synced.',
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
          title: language === 'de' ? 'Steam synchronisiert! 🎮' : 'Steam Synced! 🎮',
          body: language === 'de' ? `Profil von ${profile.username} erfolgreich verknüpft.` : `Profile of ${profile.username} successfully linked.`,
          type: 'success'
        })
      } else {
        sendAppNotification({
          title: language === 'de' ? 'Fehler' : 'Error',
          body: language === 'de' ? 'Konnte Steam-Profil nicht abrufen. Bitte prüfe die URL / SteamID.' : 'Could not fetch Steam profile. Please check URL / SteamID.',
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
          title: language === 'de' ? 'Hardware aktualisiert! ⚡' : 'Hardware Refreshed! ⚡',
          body: language === 'de' ? 'Deine PC-Komponenten wurden neu ausgelesen.' : 'Your PC hardware specs have been refreshed.',
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

      // If friend request to D1 fails, but this is a valid profile / Steam profile, add to local friends directly
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
    return f ? f.color : 'border-white/15'
  }

  return (
    <div className="h-full overflow-y-auto bg-[#07080a] select-none">
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        
        {/* Header Profile Card with Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#101216] border border-white/10 rounded-3xl overflow-hidden mb-10 shadow-2xl relative"
        >
          {/* Cover Banner */}
          <div className="relative h-44 md:h-56 w-full overflow-hidden bg-black/50">
            {displayBanner && (
              <img 
                src={displayBanner} 
                alt="Profile Banner" 
                className="w-full h-full object-cover object-center transform scale-105 filter brightness-90" 
              />
            )}
            {/* Banner Dark Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#101216] via-[#101216]/40 to-transparent" />
            
            {/* Quick Edit Banner Button (for local user) */}
            {!isViewingFriend && !isEditing && (
              <button 
                onClick={() => { setIsEditing(true); setEditTab('banner'); }}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white/90 hover:text-white px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <ImageIcon size={13} /> {language === 'de' ? 'Banner anpassen' : 'Edit Banner'}
              </button>
            )}
          </div>

          {/* Profile Header Content */}
          <div className="px-8 pb-8 pt-0 relative z-10 flex flex-col md:flex-row items-center md:items-end gap-6 -mt-16 md:-mt-20">
            
            {/* Avatar with Animated Frame */}
            <div className="relative group flex-shrink-0">
              <div className={`w-32 h-32 md:w-36 md:h-36 rounded-full p-1.5 bg-[#101216] border-2 ${getFrameClass(displayFrame)} transition-all duration-300 relative flex items-center justify-center`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-black/80 flex items-center justify-center">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User size={64} className="text-white/30" />
                  )}
                </div>
              </div>

              {!isViewingFriend && !isEditing && (
                <button
                  onClick={() => { setIsEditing(true); setEditTab('frame'); }}
                  className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-medium gap-1"
                >
                  <Sparkles size={14} className="text-purple-400" />
                </button>
              )}
            </div>

            {/* Profile Info & Badges */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start mb-1.5">
                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase drop-shadow-md">
                  {displayName}
                </h1>
                
                {profileData?.friendCode && (
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/70">
                    {profileData.friendCode}
                  </span>
                )}
              </div>

              {/* Status and Badges Line */}
              <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start mt-1">
                {/* Live Status */}
                <div className="flex items-center gap-2 text-xs font-medium text-hub-muted bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                  <span className={`w-2 h-2 rounded-full inline-block ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white/30'}`} />
                  <span className={isOnline ? 'text-white/90' : 'text-white/50'}>
                    {isViewingFriend ? friendStatusText : t('online')}
                  </span>
                </div>

                {/* Member Badge */}
                {(isViewingFriend ? (profileData?.steamProfileUrl || friend?.steamProfileUrl) : settings.steamProfileUrl) ? (
                  <span className="text-xs font-bold text-[#66c0f4] flex items-center gap-1.5 bg-[#1b2838]/80 border border-[#2a475e]/60 px-2.5 py-1 rounded-full">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-3.5 h-3.5" alt="Steam" />
                    Steam Player
                  </span>
                ) : (
                  <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-400 to-red-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                    ECLIPSE MEMBER
                  </span>
                )}

                {/* In-Game Live Badge */}
                {!isViewingFriend && activeGame && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 backdrop-blur-md shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.9)] animate-pulse flex-shrink-0" />
                    <Gamepad2 size={13} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-indigo-200 truncate">
                      <span className="text-white/50">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                      <span className="text-white font-bold">{activeGame.name}</span>
                    </span>
                  </div>
                )}
                {isViewingFriend && friendCurrentGame && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.9)] animate-pulse flex-shrink-0" />
                    <Gamepad2 size={13} className="text-purple-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-purple-200 truncate">
                      <span className="text-white/50">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                      <span className="text-white font-bold">{friendCurrentGame}</span>
                    </span>
                  </div>
                )}

                {/* Steam Stats Grouping */}
                {steamLevel !== undefined && (settings.profileShowSteamStats !== false) && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1b2838] border border-[#2a475e] text-[#66c0f4] text-xs font-bold">
                    <Trophy size={12} />
                    <span>Level {steamLevel}</span>
                  </div>
                )}
              </div>

              {/* Bio & Status Quote */}
              {displayBio && (
                <p className="mt-3 text-xs md:text-sm text-white/70 italic max-w-xl font-normal leading-relaxed border-l-2 border-purple-500/40 pl-3">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/30 text-[#8ea1e1] hover:text-white hover:bg-[#5865F2]/20 text-[11px] font-semibold transition-all cursor-pointer"
                      title="Click to copy Discord Tag"
                    >
                      <span className="font-bold">Discord:</span> {displayDiscord}
                      {copiedDiscord ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="opacity-60" />}
                    </button>
                  )}
                  {displayTwitch && (
                    <a 
                      href={`https://twitch.tv/${displayTwitch.replace('@', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#9146FF]/10 border border-[#9146FF]/30 text-[#bf94ff] hover:text-white hover:bg-[#9146FF]/20 text-[11px] font-semibold transition-all"
                    >
                      <span className="font-bold">Twitch:</span> {displayTwitch}
                      <ExternalLink size={11} className="opacity-60" />
                    </a>
                  )}
                  {displayYoutube && (
                    <a 
                      href={`https://youtube.com/${displayYoutube.startsWith('@') ? displayYoutube : '@' + displayYoutube}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FF0000]/10 border border-[#FF0000]/30 text-[#ff7373] hover:text-white hover:bg-[#FF0000]/20 text-[11px] font-semibold transition-all"
                    >
                      <span className="font-bold">YouTube:</span> {displayYoutube}
                      <ExternalLink size={11} className="opacity-60" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Profile Action Buttons */}
            <div className="flex flex-wrap gap-2.5 justify-center md:justify-end flex-shrink-0">
              {!isViewingFriend ? (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-white/10 hover:bg-white/15 border border-white/15 text-white px-4 py-2 rounded-xl font-medium text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02]"
                  >
                    <Edit3 size={14} /> {t('editProfile')}
                  </button>
                  <button 
                    onClick={() => {
                      setActiveSettingsTab('profile')
                      setActiveView('settings')
                    }}
                    className="bg-transparent hover:bg-white/5 text-hub-muted hover:text-white px-3 py-2 rounded-xl font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings size={14} /> {t('settings')}
                  </button>
                </>
              ) : (
                <>
                  {!isAlreadyFriend && (
                    <button 
                      onClick={handleSendFriendReq}
                      disabled={isSendingRequest || requestSent}
                      className="bg-white text-black font-bold hover:bg-white/90 px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
                    >
                      {isSendingRequest ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : requestSent ? (
                        <Check size={14} className="text-green-600" />
                      ) : (
                        <UserPlus size={14} />
                      )}
                      {requestSent 
                        ? (language === 'de' ? 'Anfrage gesendet' : 'Request Sent') 
                        : (language === 'de' ? 'Freund hinzufügen' : 'Add Friend')}
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedFriendId(null)}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3.5 py-2 rounded-xl font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft size={14} /> {language === 'de' ? 'Mein Profil' : 'My Profile'}
                  </button>
                </>
              )}
            </div>

          </div>
        </motion.div>

        {/* Clean, Unified Profile Customization & Settings Suite */}
        <AnimatePresence>
          {isEditing && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              className="bg-[#0f1117] border border-white/15 rounded-3xl p-6 md:p-8 mb-10 shadow-2xl relative overflow-hidden backdrop-blur-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-white tracking-wide">
                      {language === 'de' ? 'Profil-Personalisierung & Einstellungen' : 'Profile Customization & Settings'}
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      {language === 'de' 
                        ? 'Passe deinen Banner, Rahmen, Bio, Steam-Synchronisation und Gaming-Rig an.' 
                        : 'Customize your banner, frame, bio, Steam synchronization, and gaming rig.'}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer border border-white/5"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Subtabs Bar */}
              <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-4">
                {[
                  { id: 'general', label: language === 'de' ? 'Allgemein & Privatsphäre' : 'General & Privacy', icon: User },
                  { id: 'banner', label: language === 'de' ? 'Profil-Banner' : 'Banner', icon: ImageIcon },
                  { id: 'frame', label: language === 'de' ? 'Avatar-Rahmen' : 'Avatar Frames', icon: Sparkles },
                  { id: 'socials', label: language === 'de' ? 'Bio & Socials' : 'Bio & Socials', icon: MessageSquare },
                  { id: 'steam', label: language === 'de' ? 'Steam & Sync' : 'Steam & Sync', icon: RefreshCw },
                  { id: 'hardware', label: language === 'de' ? 'Gaming Rig (PC-Stats)' : 'Gaming Rig (Specs)', icon: Cpu },
                ].map(tab => {
                  const Icon = tab.icon
                  const isActive = editTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setEditTab(tab.id as any)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                        isActive 
                          ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-400/40' 
                          : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5'
                      }`}
                    >
                      <Icon size={14} className={isActive ? 'text-white' : 'text-white/50'} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Tab 1: General & Privacy */}
              {editTab === 'general' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('username')}</label>
                      <input 
                        type="text" 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full bg-[#16181f] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('avatarUrl')}</label>
                      <input 
                        type="text" 
                        placeholder="https://..."
                        value={editAvatar}
                        onChange={e => setEditAvatar(e.target.value)}
                        className="w-full bg-[#16181f] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Privacy Toggles Card */}
                  <div className="bg-[#14161d] border border-white/10 rounded-2xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Shield size={14} className="text-purple-400" />
                      {language === 'de' ? 'Privatsphäre auf dem Profil' : 'Profile Privacy Options'}
                    </h4>

                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer group select-none">
                        <input 
                          type="checkbox" 
                          checked={editShowPlaytime}
                          onChange={e => setEditShowPlaytime(e.target.checked)}
                          className="mt-0.5 rounded border-white/20 bg-white/5 text-purple-600 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors block">
                            {language === 'de' ? 'Gesamte Spielzeit anzeigen' : 'Show Total Playtime'}
                          </span>
                          <span className="text-[11px] text-white/50 block">
                            {language === 'de' ? 'Zeigt deine Gesamtspielzeit auf deinem Profil an.' : 'Display your accumulated playtime across all games.'}
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group select-none">
                        <input 
                          type="checkbox" 
                          checked={editShowSteamStats}
                          onChange={e => setEditShowSteamStats(e.target.checked)}
                          className="mt-0.5 rounded border-white/20 bg-white/5 text-purple-600 focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors block">
                            {language === 'de' ? 'Steam-Abzeichen & Level anzeigen' : 'Show Steam Badges & Level'}
                          </span>
                          <span className="text-[11px] text-white/50 block">
                            {language === 'de' ? 'Zeigt dein verknüpftes Steam-Level und Abzeichen an.' : 'Display your synced Steam level and badge showcases.'}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Banner Presets & Custom */}
              {editTab === 'banner' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">
                      {language === 'de' ? 'Wähle eine Banner-Vorlage' : 'Choose a Banner Preset'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                      {BANNER_PRESETS.map(preset => {
                        const isSelected = editBanner === preset.url
                        return (
                          <div 
                            key={preset.id}
                            onClick={() => setEditBanner(preset.url)}
                            className={`group relative h-24 rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
                              isSelected ? 'border-purple-500 scale-105 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            <img src={preset.url} alt={preset.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-md">
                                <Check size={11} className="text-white" strokeWidth={3} />
                              </div>
                            )}

                            <span className="absolute bottom-1.5 left-2 text-[10px] font-bold text-white drop-shadow-md truncate max-w-[90%]">
                              {preset.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                      {language === 'de' ? 'Oder eigene Banner-Bild URL einfügen (JPG / PNG / GIF)' : 'Or enter custom banner image URL (JPG / PNG / GIF)'}
                    </label>
                    <input 
                      type="text" 
                      placeholder="https://images.unsplash.com/... oder Tenor GIF Link"
                      value={editBanner}
                      onChange={e => setEditBanner(e.target.value)}
                      className="w-full bg-[#16181f] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Avatar Frames */}
              {editTab === 'frame' && (
                <div className="space-y-4">
                  <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider">
                    {language === 'de' ? 'Wähle deinen animierten Avatar-Rahmen' : 'Choose your Animated Avatar Frame'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {AVATAR_FRAMES.map(frame => {
                      const isSelected = editFrame === frame.id
                      return (
                        <div 
                          key={frame.id}
                          onClick={() => setEditFrame(frame.id)}
                          className={`p-4 rounded-2xl bg-[#14161d] border-2 cursor-pointer flex flex-col items-center gap-3 transition-all ${
                            isSelected 
                              ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] bg-purple-500/10 scale-105' 
                              : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className={`w-14 h-14 rounded-full p-1 bg-[#101216] border-2 ${frame.color} flex items-center justify-center`}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-black/80 flex items-center justify-center">
                              {editAvatar ? (
                                <img src={editAvatar} alt="preview" className="w-full h-full object-cover" />
                              ) : (
                                <User size={20} className="text-white/40" />
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-white text-center">
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
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider">
                        {language === 'de' ? 'Über mich / Status-Spruch (Bio)' : 'About Me / Status Quote (Bio)'}
                      </label>
                      <span className="text-[11px] text-white/40 font-mono">{editBio.length}/160</span>
                    </div>
                    <textarea 
                      rows={2}
                      maxLength={160}
                      placeholder={language === 'de' ? 'Schreibe einen kurzen Spruch, Zitat oder eine Bio...' : 'Write a short bio or quote...'}
                      value={editBio}
                      onChange={e => setEditBio(e.target.value)}
                      className="w-full bg-[#16181f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#8ea1e1] uppercase tracking-wider mb-2">Discord Tag</label>
                      <input 
                        type="text" 
                        placeholder="z.B. gamer#0001 oder username"
                        value={editDiscord}
                        onChange={e => setEditDiscord(e.target.value)}
                        className="w-full bg-[#16181f] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#5865F2] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#bf94ff] uppercase tracking-wider mb-2">Twitch Username</label>
                      <input 
                        type="text" 
                        placeholder="z.B. streamer123"
                        value={editTwitch}
                        onChange={e => setEditTwitch(e.target.value)}
                        className="w-full bg-[#16181f] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#9146FF] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#ff7373] uppercase tracking-wider mb-2">YouTube Handle</label>
                      <input 
                        type="text" 
                        placeholder="z.B. @pro_gamer"
                        value={editYoutube}
                        onChange={e => setEditYoutube(e.target.value)}
                        className="w-full bg-[#16181f] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#FF0000] transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 5: Steam Integration & Live Sync */}
              {editTab === 'steam' && (
                <div className="space-y-5">
                  <div className="bg-[#14161d] border border-white/10 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-5 h-5" alt="Steam" />
                        <h4 className="text-sm font-bold text-white">Steam Integration & Synchronisation</h4>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#1b2838] text-[#66c0f4] border border-[#2a475e]">
                        Steam API
                      </span>
                    </div>

                    <p className="text-xs text-hub-muted leading-relaxed">
                      {language === 'de' 
                        ? 'Verknüpfe dein Steam-Profil, um Avatar, Benutzernamen, Steam-Level, Abzeichen und zuletzt gespielte Spiele automatisch in Eclipse zu synchronisieren.' 
                        : 'Link your Steam profile to automatically sync your avatar, username, Steam level, badges, and recent games in Eclipse.'}
                    </p>

                    <div>
                      <label className="block text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-2">
                        {language === 'de' ? 'Steam Profil-URL oder SteamID64' : 'Steam Profile URL or SteamID64'}
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input 
                          type="text" 
                          placeholder="https://steamcommunity.com/id/... oder 76561198..."
                          value={editSteamUrl}
                          onChange={e => setEditSteamUrl(e.target.value)}
                          className="flex-1 bg-[#16181f] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#66c0f4] transition-colors font-mono"
                        />
                        <button 
                          onClick={handleSyncSteam}
                          disabled={isSyncingSteam || !editSteamUrl.trim()}
                          className="px-5 py-2.5 bg-white text-black hover:bg-white/90 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 hover:scale-105 flex-shrink-0"
                        >
                          <RefreshCw size={14} className={isSyncingSteam ? 'animate-spin text-black' : 'text-black'} />
                          <span>{isSyncingSteam ? (language === 'de' ? 'Synchronisiere...' : 'Syncing...') : (language === 'de' ? 'Profil synchronisieren' : 'Sync Profile')}</span>
                        </button>
                      </div>
                    </div>

                    {settings.steamProfileUrl && (
                      <div className="pt-2 flex items-center gap-2 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 size={14} />
                        <span>{language === 'de' ? 'Steam-Profil ist aktuell verknüpft' : 'Steam profile is linked'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 6: Gaming Rig & PC Specs */}
              {editTab === 'hardware' && (
                <div className="space-y-5">
                  <div className="bg-[#14161d] border border-white/10 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <Cpu size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {language === 'de' ? 'Gaming Rig & Hardware-Erkennung' : 'Gaming Rig & Hardware Detection'}
                          </h4>
                          <span className="text-[11px] text-white/50">
                            {language === 'de' ? 'Automatisch aus Windows ausgelesen' : 'Automatically detected from Windows'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={handleRedetectHardware}
                          disabled={isDetectingHardware}
                          className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw size={13} className={isDetectingHardware ? 'animate-spin' : ''} />
                          {language === 'de' ? 'Neu erkennen' : 'Redetect Specs'}
                        </button>

                        <button
                          onClick={() => setEditShowHardware(!editShowHardware)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            editShowHardware 
                              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                              : 'bg-white/5 border-white/10 text-white/40'
                          }`}
                        >
                          {editShowHardware 
                            ? (language === 'de' ? 'Sichtbar im Profil' : 'Visible on Profile') 
                            : (language === 'de' ? 'Ausgeblendet' : 'Hidden')}
                        </button>
                      </div>
                    </div>

                    {/* Detected Specs Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                      <div className="bg-[#181a22] border border-white/5 rounded-xl p-3.5 flex items-center gap-3">
                        <Zap size={18} className="text-purple-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">GPU</span>
                          <span className="text-xs font-bold text-white truncate block">{displayHardware?.gpu || 'Auto-detecting...'}</span>
                        </div>
                      </div>

                      <div className="bg-[#181a22] border border-white/5 rounded-xl p-3.5 flex items-center gap-3">
                        <Cpu size={18} className="text-indigo-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">CPU</span>
                          <span className="text-xs font-bold text-white truncate block">{displayHardware?.cpu || 'Auto-detecting...'}</span>
                        </div>
                      </div>

                      <div className="bg-[#181a22] border border-white/5 rounded-xl p-3.5 flex items-center gap-3">
                        <HardDrive size={18} className="text-pink-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block">RAM</span>
                          <span className="text-xs font-bold text-white truncate block">{displayHardware?.ram || 'Auto-detecting...'}</span>
                        </div>
                      </div>

                      <div className="bg-[#181a22] border border-white/5 rounded-xl p-3.5 flex items-center gap-3">
                        <Monitor size={18} className="text-emerald-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">{displayHardware?.os || 'OS / Monitor'}</span>
                          <span className="text-xs font-bold text-white truncate block">{displayHardware?.display || 'Auto-detecting...'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-white/10 mt-6">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleSave}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center gap-2 cursor-pointer hover:scale-105"
                >
                  <Save size={15} /> {t('save')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gaming Rig & Hardware Showcase (Feature 3: Fully Automatic & Toggleable) */}
        {displayShowHardware && displayHardware && (displayHardware.cpu || displayHardware.gpu) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#101216] border border-white/10 rounded-3xl p-6 md:p-8 mb-10 relative overflow-hidden shadow-xl"
          >
            {/* Header with Title & Auto-Detected Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                    {language === 'de' ? 'Gaming Rig & Hardware-Showcase' : 'Gaming Rig & Hardware Showcase'}
                  </h3>
                  <p className="text-xs text-hub-muted">
                    {language === 'de' ? 'Vollautomatisch von Eclipse aus Windows ausgelesen' : 'Automatically detected by Eclipse from Windows'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  {language === 'de' ? 'Automatisch erkannt' : 'Auto-detected'}
                </span>

                {/* Toggle on own profile */}
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
                    className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      settings.showHardwareSpecs !== false 
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                    title="Toggle public visibility"
                  >
                    {settings.showHardwareSpecs !== false 
                      ? (language === 'de' ? 'Sichtbar' : 'Visible') 
                      : (language === 'de' ? 'Ausgeblendet' : 'Hidden')}
                  </button>
                )}
              </div>
            </div>

            {/* Hardware Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* GPU */}
              {displayHardware.gpu && (
                <div className="bg-[#15171d] border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 hover:border-purple-500/30 transition-colors group">
                  <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Zap size={20} />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <span className="text-[10px] font-bold text-purple-400/80 uppercase tracking-wider block">GPU</span>
                    <p className="text-xs font-bold text-white truncate drop-shadow-sm" title={displayHardware.gpu}>
                      {displayHardware.gpu}
                    </p>
                  </div>
                </div>
              )}

              {/* CPU */}
              {displayHardware.cpu && (
                <div className="bg-[#15171d] border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 hover:border-indigo-500/30 transition-colors group">
                  <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Cpu size={20} />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <span className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-wider block">CPU</span>
                    <p className="text-xs font-bold text-white truncate drop-shadow-sm" title={displayHardware.cpu}>
                      {displayHardware.cpu}
                    </p>
                  </div>
                </div>
              )}

              {/* RAM */}
              {displayHardware.ram && (
                <div className="bg-[#15171d] border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 hover:border-pink-500/30 transition-colors group">
                  <div className="w-11 h-11 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <HardDrive size={20} />
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <span className="text-[10px] font-bold text-pink-400/80 uppercase tracking-wider block">Memory</span>
                    <p className="text-xs font-bold text-white truncate drop-shadow-sm" title={displayHardware.ram}>
                      {displayHardware.ram}
                    </p>
                  </div>
                </div>
              )}

              {/* Display / OS */}
              <div className="bg-[#15171d] border border-white/5 rounded-2xl p-4 flex items-center gap-3.5 hover:border-emerald-500/30 transition-colors group">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Monitor size={20} />
                </div>
                <div className="overflow-hidden min-w-0">
                  <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider block">
                    {displayHardware.os || 'Display'}
                  </span>
                  <p className="text-xs font-bold text-white truncate drop-shadow-sm">
                    {displayHardware.display ? `${displayHardware.display}` : 'Primary Monitor'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {(!isViewingFriend ? settings.profileShowPlaytime !== false : true) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-[#101216] border border-white/10 rounded-2xl p-6 relative overflow-hidden group shadow-lg"
            >
              <div className="w-11 h-11 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Clock className="text-indigo-400" size={22} />
              </div>
              <h3 className="text-2xl font-black text-white mb-1">
                {displayTotalPlaytime}
              </h3>
              <p className="text-xs font-semibold text-hub-muted uppercase tracking-wider">{t('totalPlaytime')}</p>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#101216] border border-white/10 rounded-2xl p-6 relative overflow-hidden group shadow-lg"
          >
            <div className="w-11 h-11 bg-pink-500/10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Library className="text-pink-400" size={22} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              {displayLibraryCount}
            </h3>
            <p className="text-xs font-semibold text-hub-muted uppercase tracking-wider">
              {t('gamesInLibrary')}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-[#101216] border border-white/10 rounded-2xl p-6 relative overflow-hidden group shadow-lg"
          >
            <div className="w-11 h-11 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Save className="text-emerald-400" size={22} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">
              {displayInstalledCount}
            </h3>
            <p className="text-xs font-semibold text-hub-muted uppercase tracking-wider">
              {isViewingFriend ? 'Activity / Installed' : t('installedGames')}
            </p>
          </motion.div>
        </div>

        {/* Most Played Games Section */}
        {displayTopGames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#101216] border border-white/10 rounded-2xl p-6 mb-10 shadow-lg"
          >
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Trophy size={16} className="text-amber-400" />
              {language === 'de' ? 'Meistgespielte Spiele' : 'Most Played Games'}
            </h3>
            <div className="space-y-2.5">
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
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-white/50 w-5 text-center">#{idx + 1}</span>
                      <p className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">{game.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-white/40" />
                      <span className="text-xs font-semibold text-white/90">{hrs}</span>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-5">
              <h3 className="text-base font-bold text-white tracking-wide">Steam Recent Activity</h3>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {steamRecentGames.slice(0, 3).map((game: any) => (
                <div key={game.appId || game.name} className="bg-[#101216] rounded-2xl overflow-hidden border border-white/5 hover:border-white/20 transition-all shadow-md">
                  <div className="relative h-24 overflow-hidden">
                    <img src={game.iconUrl} alt={game.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101216] to-transparent" />
                  </div>
                  <div className="p-4 relative -mt-6">
                    <h4 className="font-semibold text-white text-xs truncate drop-shadow-md mb-1">{game.name}</h4>
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
