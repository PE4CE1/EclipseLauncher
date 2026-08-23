import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, Library, Clock, Save, Edit3, Settings, Trophy, Gamepad2, 
  UserPlus, Check, ArrowLeft, Loader2, Cpu, Zap, HardDrive, Monitor, 
  Image as ImageIcon, Sparkles, Copy, ExternalLink, X, RefreshCw, 
  MessageSquare, CheckCircle2, Award, Search, Play
} from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { syncMyProfile, fetchUserProfile, sendFriendRequest } from '../../services/socialService'
import { fetchSteamUserProfile } from '../../services/steamService'
import { formatLastSeen } from '../../services/assetHelper'
import { sendAppNotification } from '../../services/notificationService'
import type { EclipseFriend, SteamBadge, SteamProfileGame } from '../../types/game'

const BANNER_PRESETS = [
  { id: 'galaxy', name: 'Eclipse Galaxy', url: 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?q=80&w=1600&auto=format&fit=crop' },
  { id: 'cyberpunk', name: 'Cyberpunk Night', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop' },
  { id: 'synthwave', name: 'Retro Sunset', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop' },
  { id: 'minimal', name: 'Dark Flow', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop' },
  { id: 'aurora', name: 'Nordic Aurora', url: 'https://images.unsplash.com/photo-1579033461380-adb47c3eb938?q=80&w=1600&auto=format&fit=crop' },
  { id: 'deep_space', name: 'Deep Nebula', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1600&auto=format&fit=crop' },
]

const AVATAR_FRAMES = [
  { id: 'none', label: 'None', labelDe: 'Kein Rahmen', color: 'border-white/10' },
  { id: 'eclipse_neon', label: 'Eclipse Glow', labelDe: 'Eclipse Glow', color: 'border-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.35)]' },
  { id: 'cyberpunk', label: 'Cyberpunk', labelDe: 'Cyberpunk', color: 'border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.35)]' },
  { id: 'golden_vip', label: 'Gold VIP', labelDe: 'Gold VIP', color: 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]' },
  { id: 'fire_blaze', label: 'Fire Blaze', labelDe: 'Fire Blaze', color: 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)]' },
  { id: 'emerald_pulse', label: 'Emerald', labelDe: 'Smaragd', color: 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]' },
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
  const [copiedFriendCode, setCopiedFriendCode] = useState(false)
  
  const [steamGamesSearch, setSteamGamesSearch] = useState('')
  const [activeSteamTab, setActiveSteamTab] = useState<'recent' | 'all'>('recent')

  const friend = selectedFriendId ? settings.eclipseFriends?.find(f => f.id === selectedFriendId) : null
  const isViewingFriend = !!selectedFriendId
  const isAlreadyFriend = isViewingFriend && (!!friend || (settings.eclipseFriends?.some(f => f.id === selectedFriendId) ?? false))

  // Fetch full live profile data when viewing a friend or searched player
  useEffect(() => {
    if (selectedFriendId) {
      setIsLoadingProfile(true)
      setRequestSent(false)
      fetchUserProfile(selectedFriendId).then(async (data) => {
        let finalProfile = data
        const steamUrl = data?.steamProfileUrl || friend?.steamProfileUrl
        if (data) {
          if (steamUrl && (!data.steamBackgroundMovie && !data.steamBackgroundUrl)) {
            const steamData = await fetchSteamUserProfile(steamUrl)
            if (steamData) {
              finalProfile = {
                ...data,
                steamLevel: steamData.steamLevel ?? data.steamLevel,
                steamGamesCount: steamData.steamGamesCount ?? data.steamGamesCount,
                steamBadgesCount: steamData.steamBadgesCount ?? data.steamBadgesCount,
                steamFavoriteBadge: steamData.steamFavoriteBadge || data.steamFavoriteBadge,
                steamBadges: (steamData.steamBadges && steamData.steamBadges.length > 0) ? steamData.steamBadges : (data.steamBadges || []),
                steamGames: (steamData.steamGames && steamData.steamGames.length > 0) ? steamData.steamGames : (data.steamGames || []),
                steamRecentGames: (steamData.steamRecentGames && steamData.steamRecentGames.length > 0) ? steamData.steamRecentGames : (data.steamRecentGames || []),
                steamBackgroundUrl: steamData.steamBackgroundUrl || data.steamBackgroundUrl,
                steamBackgroundMovie: steamData.steamBackgroundMovie || data.steamBackgroundMovie,
                bannerUrl: steamData.steamBackgroundMovie || steamData.steamBackgroundUrl || data.bannerUrl,
              }
            }
          }
          setFetchedProfile(finalProfile)
        } else {
          // Fallback to Steam profile lookup if numeric ID or friend
          const steamData = await fetchSteamUserProfile(steamUrl || selectedFriendId)
          if (steamData && steamData.steamId64) {
            setFetchedProfile({
              username: steamData.username,
              avatarUrl: steamData.avatarFull,
              level: steamData.steamLevel,
              steamLevel: steamData.steamLevel,
              steamGamesCount: steamData.steamGamesCount,
              steamBadgesCount: steamData.steamBadgesCount,
              steamFavoriteBadge: steamData.steamFavoriteBadge,
              steamBadges: steamData.steamBadges || [],
              steamGames: steamData.steamGames || [],
              steamRecentGames: steamData.steamRecentGames || [],
              steamBackgroundUrl: steamData.steamBackgroundUrl,
              steamBackgroundMovie: steamData.steamBackgroundMovie,
              bannerUrl: steamData.steamBackgroundMovie || steamData.steamBackgroundUrl,
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

      // Auto-fetch/refresh Steam data if steamProfileUrl is linked to ensure live background is always fresh
      if (settings.steamProfileUrl) {
        fetchSteamUserProfile(settings.steamProfileUrl).then(steamData => {
          if (steamData) {
            const patch: any = {
              steamLevel: steamData.steamLevel ?? settings.steamLevel,
              steamGamesCount: steamData.steamGamesCount ?? settings.steamGamesCount,
              steamBadgesCount: steamData.steamBadgesCount ?? settings.steamBadgesCount,
              steamRecentGames: steamData.steamRecentGames || settings.steamRecentGames,
              steamFavoriteBadge: steamData.steamFavoriteBadge || settings.steamFavoriteBadge,
              steamBadges: steamData.steamBadges || settings.steamBadges,
              steamGames: steamData.steamGames || settings.steamGames,
              steamBackgroundUrl: steamData.steamBackgroundUrl || settings.steamBackgroundUrl,
              steamBackgroundMovie: steamData.steamBackgroundMovie || settings.steamBackgroundMovie,
            }
            if (steamData.steamBackgroundMovie || steamData.steamBackgroundUrl) {
              patch.bannerUrl = steamData.steamBackgroundMovie || steamData.steamBackgroundUrl
            }
            updateSettings(patch)
            if (window.electronAPI?.setSettings) {
              window.electronAPI.setSettings(patch)
            }
          }
        }).catch(err => console.warn('Auto Steam refresh error:', err))
      }
    }
  }, [selectedFriendId, settings.steamProfileUrl])

  // Customization Form States
  const [isEditing, setIsEditing] = useState(false)
  const [editTab, setEditTab] = useState<'general' | 'banner' | 'bg_steam' | 'frame' | 'socials' | 'steam' | 'hardware'>('general')
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
  const [editShowSteamBg, setEditShowSteamBg] = useState(settings.profileShowSteamBackground !== false)

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
      setEditShowSteamBg(settings.profileShowSteamBackground !== false)
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

  const steamBackgroundMovie = isViewingFriend
    ? (profileData?.steamBackgroundMovie || friend?.steamBackgroundMovie)
    : settings.steamBackgroundMovie

  const steamBackgroundUrl = isViewingFriend
    ? (profileData?.steamBackgroundUrl || friend?.steamBackgroundUrl)
    : settings.steamBackgroundUrl

  // 1. Full Profile View Background (Steam Live Video or Artwork)
  const steamBg = isViewingFriend 
    ? (profileData?.steamBackgroundMovie || profileData?.steamBackgroundUrl || friend?.steamBackgroundMovie || friend?.steamBackgroundUrl)
    : (settings.steamBackgroundMovie || settings.steamBackgroundUrl)

  const showSteamBg = isViewingFriend 
    ? (profileData?.showSteamBackground !== false) 
    : (settings.profileShowSteamBackground !== false)

  const activeProfileBg = showSteamBg ? steamBg : null

  // 2. Profile Card Banner (Presets or Custom Link)
  const userBanner = isViewingFriend ? (profileData?.bannerUrl || friend?.bannerUrl) : settings.bannerUrl
  const displayBanner = userBanner || BANNER_PRESETS[0].url

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

  const steamRecentGames = isViewingFriend 
    ? (profileData?.steamRecentGames || friend?.steamRecentGames || []) 
    : (settings.steamRecentGames || [])

  const steamFavoriteBadge = isViewingFriend 
    ? (profileData?.steamFavoriteBadge || friend?.steamFavoriteBadge) 
    : settings.steamFavoriteBadge

  const steamBadges: SteamBadge[] = isViewingFriend 
    ? (profileData?.steamBadges || friend?.steamBadges || []) 
    : (settings.steamBadges || [])

  const steamGames: SteamProfileGame[] = isViewingFriend 
    ? (profileData?.steamGames || friend?.steamGames || []) 
    : (settings.steamGames || [])

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

  // Helper to check if banner is a video (Live Steam Background)
  const isVideoBanner = (url: string | undefined | null) => {
    if (!url) return false
    const clean = url.toLowerCase().split('?')[0]
    return clean.endsWith('.webm') || clean.endsWith('.mp4') || url.includes('.webm') || url.includes('.mp4')
  }

  // Filtered Steam Games for search
  const filteredSteamGames = useMemo(() => {
    if (!steamGamesSearch.trim()) return steamGames
    const q = steamGamesSearch.toLowerCase().trim()
    return steamGames.filter(g => g.name.toLowerCase().includes(q))
  }, [steamGames, steamGamesSearch])

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

  // Profile Display Values
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
      profileShowSteamStats: editShowSteamStats,
      profileShowSteamBackground: editShowSteamBg
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
        
        // Auto default banner to Steam background if user has not set a custom non-default one
        const steamBg = profile.steamBackgroundMovie || profile.steamBackgroundUrl
        const currentBannerIsCustom = settings.bannerUrl && !BANNER_PRESETS.some(p => p.url === settings.bannerUrl)
        const newBannerUrl = currentBannerIsCustom ? settings.bannerUrl : (steamBg || settings.bannerUrl)

        if (steamBg && !currentBannerIsCustom) {
          setEditBanner(steamBg)
        }

        const patch = {
          username: profile.username,
          avatarUrl: profile.avatarFull,
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
          bannerUrl: newBannerUrl
        }
        updateSettings(patch)
        if (window.electronAPI?.setSettings) {
          await window.electronAPI.setSettings(patch)
        }
        await syncMyProfile()
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
          body: res.message || (language === 'de' ? 'Freundschaftsanfrage übermittelt.' : 'Friend request sent.'),
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
          steamBadges: steamBadges || [],
          steamGames: steamGames || [],
          steamBackgroundUrl: steamBackgroundUrl,
          steamBackgroundMovie: steamBackgroundMovie,
          showSteamBackground: showSteamBg
        }
        updateSettings({
          eclipseFriends: [...currentFriends, newFriend]
        })
        setRequestSent(true)
        sendAppNotification({
          title: language === 'de' ? 'Freund hinzugefügt! 👥' : 'Friend Added! 👥',
          body: language === 'de' ? `Freund ${displayName} hinzugefügt.` : `Friend ${displayName} added.`,
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
    <div className="relative h-full overflow-y-auto bg-[#07080a] select-none">
      {/* ─── 1. Full Profile View Background (Steam Live Video or High-Res Artwork) ─── */}
      {activeProfileBg && (
        <div className="absolute inset-0 pointer-events-none z-0 min-h-full overflow-hidden">
          {isVideoBanner(activeProfileBg) ? (
            <video 
              src={activeProfileBg} 
              autoPlay 
              loop 
              muted 
              playsInline 
              className="w-full h-full object-cover object-center filter brightness-[0.38] saturate-110" 
            />
          ) : (
            <img 
              src={activeProfileBg} 
              alt="Steam Profile Background" 
              className="w-full h-full object-cover object-center filter brightness-[0.38] saturate-110" 
            />
          )}
          {/* Smooth vignette fade for crisp card readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#07080a] via-[#07080a]/60 to-transparent" />
          <div className="absolute inset-0 bg-black/35" />
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 md:px-10 md:py-10 space-y-6">
        
        {/* ─── 2. Hero Header & Identity Card with Card Banner ─── */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl relative"
        >
          {/* Cover Banner (Presets, Steam Live Video, or Custom Link) */}
          <div className="relative h-48 md:h-56 w-full overflow-hidden bg-[#06070a]">
            {displayBanner && (
              isVideoBanner(displayBanner) ? (
                <video 
                  src={displayBanner} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover object-center filter brightness-95" 
                />
              ) : (
                <img 
                  src={displayBanner} 
                  alt="Profile Banner" 
                  className="w-full h-full object-cover object-center filter brightness-95" 
                />
              )
            )}
            {/* Smooth Vignette Gradient Fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-[#0c0d12]/40 to-transparent" />
            
            {/* Quick Edit Background Button (local user) */}
            {!isViewingFriend && !isEditing && (
              <button 
                onClick={() => { setIsEditing(true); setEditTab('banner'); }}
                className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 text-white/80 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                <ImageIcon size={13} /> {language === 'de' ? 'Hintergrund bearbeiten' : 'Edit Background'}
              </button>
            )}
          </div>

          {/* Profile Identity Details */}
          <div className="px-6 pb-6 md:px-8 md:pb-8 pt-0 relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-5 -mt-14 md:-mt-16">
            
            {/* Avatar & User Details */}
            <div className="flex flex-col md:flex-row items-center md:items-end gap-5 text-center md:text-left">
              {/* Avatar with selected frame */}
              <div className="relative group flex-shrink-0">
                <div className={`w-28 h-28 md:w-32 md:h-32 rounded-full p-1 bg-[#0c0d12] border-2 ${getFrameClass(displayFrame)} transition-all duration-200 relative flex items-center justify-center shadow-xl`}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-black/90 flex items-center justify-center">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User size={48} className="text-white/30" />
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

              {/* Identity Typography & Badges */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight uppercase">
                    {displayName}
                  </h1>
                  
                  {profileData?.friendCode && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(profileData.friendCode)
                        setCopiedFriendCode(true)
                        setTimeout(() => setCopiedFriendCode(false), 2000)
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
                      title="Click to copy Friend Code"
                    >
                      <span>#{profileData.friendCode}</span>
                      {copiedFriendCode ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} className="opacity-40" />}
                    </button>
                  )}
                </div>

                {/* ─── Exact Steam Stats Pills (Screenshot Feature) ─── */}
                {(isViewingFriend ? (profileData?.steamProfileUrl || friend?.steamProfileUrl) : settings.steamProfileUrl) && (
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-0.5">
                    {/* Steam Logo */}
                    <div className="w-7 h-7 rounded-full bg-[#1b2838] border border-[#2a475e]/70 flex items-center justify-center flex-shrink-0 shadow-sm" title="Linked Steam Profile">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-4 h-4" alt="Steam" />
                    </div>

                    {/* Level Pill */}
                    {steamLevel !== undefined && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b2838]/90 border border-[#2a475e]/80 text-[#66c0f4] text-xs font-bold shadow-sm">
                        <Trophy size={13} className="text-[#66c0f4]" />
                        <span>Level {steamLevel}</span>
                      </div>
                    )}

                    {/* Games Count Pill */}
                    {steamGamesCount !== undefined && steamGamesCount > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b2838]/90 border border-[#2a475e]/80 text-[#66c0f4] text-xs font-bold shadow-sm">
                        <Gamepad2 size={13} className="text-[#66c0f4]" />
                        <span>{steamGamesCount} Games</span>
                      </div>
                    )}

                    {/* Featured Favorite Badge Pill */}
                    {steamFavoriteBadge && steamFavoriteBadge.name && (
                      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1b2838]/90 border border-[#2a475e]/80 shadow-sm" title={steamFavoriteBadge.xp ? `${steamFavoriteBadge.name} (${steamFavoriteBadge.xp})` : steamFavoriteBadge.name}>
                        {steamFavoriteBadge.iconUrl && (
                          <img src={steamFavoriteBadge.iconUrl} alt={steamFavoriteBadge.name} className="w-5 h-5 object-contain flex-shrink-0" />
                        )}
                        <div className="text-left">
                          <span className="text-[9px] font-bold text-[#66c0f4] uppercase tracking-wider block leading-none">FEATURED</span>
                          <span className="text-xs font-bold text-white leading-none">{steamFavoriteBadge.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Inline Status Row */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-0.5">
                  {/* Status Indicator */}
                  <div className="flex items-center gap-1.5 text-xs text-white/70 bg-white/[0.03] px-2.5 py-0.5 rounded-md border border-white/[0.06]">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-white/30'}`} />
                    <span className="font-medium">{isViewingFriend ? friendStatusText : t('online')}</span>
                  </div>

                  {/* Active In-Game Badge */}
                  {!isViewingFriend && activeGame && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      <Gamepad2 size={12} className="text-indigo-400" />
                      <span className="truncate max-w-[200px]">
                        <span className="text-white/40">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                        <span className="text-white font-medium">{activeGame.name}</span>
                      </span>
                    </div>
                  )}

                  {isViewingFriend && friendCurrentGame && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                      <Gamepad2 size={12} className="text-purple-400" />
                      <span className="truncate max-w-[200px]">
                        <span className="text-white/40">{language === 'de' ? 'Spielt' : 'Playing'}</span>{' '}
                        <span className="text-white font-medium">{friendCurrentGame}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Bio / Quote */}
                {displayBio && (
                  <p className="text-xs text-white/65 italic max-w-md pt-1 leading-relaxed">
                    "{displayBio}"
                  </p>
                )}

                {/* Social Links */}
                {(displayDiscord || displayTwitch || displayYoutube) && (
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1.5">
                    {displayDiscord && (
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(displayDiscord)
                          setCopiedDiscord(true)
                          setTimeout(() => setCopiedDiscord(false), 2000)
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-white/70 hover:text-white text-[11px] transition-colors cursor-pointer"
                      >
                        <span className="text-white/40">Discord:</span>
                        <span>{displayDiscord}</span>
                        {copiedDiscord ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} className="opacity-30" />}
                      </button>
                    )}
                    {displayTwitch && (
                      <a 
                        href={`https://twitch.tv/${displayTwitch.replace('@', '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-white/70 hover:text-white text-[11px] transition-colors"
                      >
                        <span className="text-white/40">Twitch:</span>
                        <span>{displayTwitch}</span>
                        <ExternalLink size={10} className="opacity-30" />
                      </a>
                    )}
                    {displayYoutube && (
                      <a 
                        href={`https://youtube.com/${displayYoutube.startsWith('@') ? displayYoutube : '@' + displayYoutube}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-white/70 hover:text-white text-[11px] transition-colors"
                      >
                        <span className="text-white/40">YouTube:</span>
                        <span>{displayYoutube}</span>
                        <ExternalLink size={10} className="opacity-30" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Profile Action Buttons */}
            <div className="flex items-center gap-2.5 flex-shrink-0 pt-2 md:pt-0">
              {!isViewingFriend ? (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-white text-black font-semibold hover:bg-white/90 px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Edit3 size={13} /> {t('editProfile')}
                  </button>
                  <button 
                    onClick={() => {
                      setActiveSettingsTab('profile')
                      setActiveView('settings')
                    }}
                    className="bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.08] px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
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
                      className="bg-white text-black font-semibold hover:bg-white/90 px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
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
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft size={13} /> {language === 'de' ? 'Mein Profil' : 'My Profile'}
                  </button>
                </>
              )}
            </div>

          </div>
        </motion.div>

        {/* ─── Minimalist Edit Profile Modal / Section ─── */}
        <AnimatePresence>
          {isEditing && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 shadow-2xl relative"
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
                  { id: 'bg_steam', label: language === 'de' ? 'Profil-Hintergrund' : 'Profile Background', icon: Play },
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

              {/* Tab 2: Card Banner (Presets & Custom Link) */}
              {editTab === 'banner' && (
                <div className="space-y-5">
                  {/* Presets Grid */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2.5">
                      {language === 'de' ? 'Vorgegebene Vorlagen' : 'Presets'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
                      {BANNER_PRESETS.map(preset => {
                        const isSelected = editBanner === preset.url
                        return (
                          <div 
                            key={preset.id}
                            onClick={() => setEditBanner(preset.url)}
                            className={`group relative h-20 rounded-xl overflow-hidden border cursor-pointer transition-all ${
                              isSelected ? 'border-white ring-2 ring-white/50' : 'border-white/[0.08] hover:border-white/30'
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

                  {/* Custom Banner Link */}
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
                      {language === 'de' ? 'Eigener Banner-Link (Bild JPG/PNG oder Video MP4/WebM)' : 'Custom Banner Link (Image JPG/PNG or Video MP4/WebM)'}
                    </label>
                    <input 
                      type="text" 
                      placeholder="https://... (z. B. JPG, PNG, GIF, WebM oder MP4)"
                      value={editBanner}
                      onChange={e => setEditBanner(e.target.value)}
                      className="w-full bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono transition-colors focus:outline-none"
                    />
                    {editBanner && (
                      <div className="mt-2 text-[11px] text-white/40 flex items-center gap-1.5">
                        <span>{language === 'de' ? 'Aktiver Banner-Link:' : 'Active Banner Link:'}</span>
                        <span className="text-white/70 truncate max-w-sm">{editBanner}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                        {isVideoBanner(steamBg) ? (
                          <video 
                            src={steamBg} 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <img src={steamBg} alt="Steam Background Preview" className="w-full h-full object-cover" />
                        )}
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
                          <div className={`w-12 h-12 rounded-full p-1 bg-[#0c0d12] border-2 ${frame.color} flex items-center justify-center`}>
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

        {/* ─── System Specs (Hardware Rig) Bar ─── */}
        {displayShowHardware && displayHardware && (displayHardware.cpu || displayHardware.gpu) && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-5 md:p-6 shadow-sm"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-white/60" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  {language === 'de' ? 'System-Hardware' : 'System Hardware'}
                </h3>
                <span className="text-[10px] text-emerald-400/90 font-mono">
                  • {language === 'de' ? 'automatisch erkannt' : 'auto-detected'}
                </span>
              </div>

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
                >
                  {settings.showHardwareSpecs !== false 
                    ? (language === 'de' ? 'Sichtbar' : 'Visible') 
                    : (language === 'de' ? 'Ausgeblendet' : 'Hidden')}
                </button>
              )}
            </div>

            {/* Clean Non-Truncated Specs Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {displayHardware.gpu && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Graphics</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.gpu}
                  </p>
                </div>
              )}

              {displayHardware.cpu && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Processor</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.cpu}
                  </p>
                </div>
              )}

              {displayHardware.ram && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium uppercase text-white/40 block">Memory</span>
                  <p className="text-xs font-medium text-white leading-relaxed whitespace-normal break-words">
                    {displayHardware.ram}
                  </p>
                </div>
              )}

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

        {/* ─── Stats Metrics Strip ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {(!isViewingFriend ? settings.profileShowPlaytime !== false : true) && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-[#0c0d12] border border-white/[0.08] rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-medium uppercase text-white/40 tracking-wider">
                  {t('totalPlaytime')}
                </span>
                <Clock size={13} className="text-white/30" />
              </div>
              <p className="text-xl font-bold text-white tracking-tight">{displayTotalPlaytime}</p>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-medium uppercase text-white/40 tracking-wider">
                {t('gamesInLibrary')}
              </span>
              <Library size={13} className="text-white/30" />
            </div>
            <p className="text-xl font-bold text-white tracking-tight">{displayLibraryCount}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-medium uppercase text-white/40 tracking-wider">
                {isViewingFriend ? 'Activity / Installed' : t('installedGames')}
              </span>
              <Save size={13} className="text-white/30" />
            </div>
            <p className="text-xl font-bold text-white tracking-tight">{displayInstalledCount}</p>
          </motion.div>
        </div>

        {/* ─── Steam Badges Showcase ─── */}
        {(settings.profileShowSteamStats !== false) && steamBadges && steamBadges.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-5 md:p-6 shadow-sm"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <Award size={15} className="text-amber-400/90" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Steam Badges & Abzeichen
                </h3>
                <span className="text-[11px] font-mono text-white/40">
                  ({steamBadges.length}{steamBadgesCount && steamBadgesCount > steamBadges.length ? ` von ${steamBadgesCount}` : ''})
                </span>
              </div>
              {steamFavoriteBadge && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300/80 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  <span>Favorite: {steamFavoriteBadge.name}</span>
                </div>
              )}
            </div>

            {/* Badges Flow Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {steamBadges.map((badge, idx) => (
                <div 
                  key={`${badge.name}-${idx}`}
                  className="bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/20 rounded-xl p-2.5 flex flex-col items-center gap-1.5 transition-all text-center group"
                  title={`${badge.name}${badge.xp ? ` (${badge.xp})` : ''}`}
                >
                  <div className="w-10 h-10 flex items-center justify-center relative">
                    <img 
                      src={badge.iconUrl} 
                      alt={badge.name} 
                      className="max-w-full max-h-full object-contain filter group-hover:scale-110 transition-transform" 
                    />
                  </div>
                  <span className="text-[10px] font-medium text-white/80 group-hover:text-white line-clamp-1 break-all">
                    {badge.name}
                  </span>
                  {badge.xp && (
                    <span className="text-[9px] font-mono text-white/40">
                      {badge.xp}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Steam Games Showcase ─── */}
        {(settings.profileShowSteamStats !== false) && ((steamGames && steamGames.length > 0) || (steamRecentGames && steamRecentGames.length > 0)) && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-5 md:p-6 shadow-sm space-y-4"
          >
            {/* Header & Sub-Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Gamepad2 size={15} className="text-[#66c0f4]" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Steam Games
                </h3>
                
                {/* Switcher: Recent / All Games */}
                <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
                  <button
                    onClick={() => setActiveSteamTab('recent')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      activeSteamTab === 'recent' 
                        ? 'bg-white/10 text-white font-semibold' 
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {language === 'de' ? 'Kürzlich gespielt' : 'Recent'} ({steamRecentGames.length})
                  </button>
                  {steamGames.length > 0 && (
                    <button
                      onClick={() => setActiveSteamTab('all')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        activeSteamTab === 'all' 
                          ? 'bg-white/10 text-white font-semibold' 
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {language === 'de' ? 'Alle Steam-Spiele' : 'All Steam Games'} ({steamGamesCount || steamGames.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Search if in 'all' view */}
              {activeSteamTab === 'all' && steamGames.length > 0 && (
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    placeholder={language === 'de' ? 'Steam-Spiel suchen...' : 'Search Steam game...'}
                    value={steamGamesSearch}
                    onChange={e => setSteamGamesSearch(e.target.value)}
                    className="bg-[#14161c] border border-white/[0.08] focus:border-white/30 rounded-lg pl-7 pr-3 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none w-48"
                  />
                </div>
              )}
            </div>

            {/* Tab: Recent Games */}
            {activeSteamTab === 'recent' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {steamRecentGames.map((game: any) => (
                  <div 
                    key={game.appId || game.name} 
                    onClick={() => {
                      if (game.appId) openGameDetails(Number(game.appId), game.name)
                    }}
                    className="bg-white/[0.02] hover:bg-white/[0.05] rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/20 transition-all shadow-sm cursor-pointer group"
                  >
                    <div className="relative h-24 overflow-hidden bg-black/50">
                      <img 
                        src={game.iconUrl} 
                        alt={game.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-transparent to-transparent" />
                    </div>
                    <div className="p-3">
                      <h4 className="font-semibold text-white text-xs truncate mb-1 group-hover:text-white transition-colors">
                        {game.name}
                      </h4>
                      <p className="text-[11px] text-[#66c0f4] font-medium font-mono">
                        {game.playtime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: All Steam Games Library */}
            {activeSteamTab === 'all' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {filteredSteamGames.map((game: any) => (
                  <div
                    key={game.appId || game.name}
                    onClick={() => {
                      if (game.appId) openGameDetails(Number(game.appId), game.name)
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/15 transition-all cursor-pointer group"
                  >
                    <img 
                      src={game.iconUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`} 
                      alt={game.name} 
                      className="w-10 h-6 object-cover rounded bg-black/60 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white/90 group-hover:text-white truncate">
                        {game.name}
                      </p>
                      {game.playtime && (
                        <p className="text-[10px] text-white/40 font-mono truncate">
                          {game.playtime}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ─── Most Played Local Games Section ─── */}
        {displayTopGames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-5 md:p-6 shadow-sm"
          >
            <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy size={13} className="text-amber-400/90" />
              {language === 'de' ? 'Meistgespielte Spiele (Eclipse)' : 'Most Played Games (Eclipse)'}
            </h3>
            <div className="divide-y divide-white/[0.04]">
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
                    className="flex items-center justify-between py-2.5 px-2 hover:bg-white/[0.02] rounded-lg transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-white/30 w-4 text-center">#{idx + 1}</span>
                      <p className="text-xs font-medium text-white/90 group-hover:text-white transition-colors truncate">
                        {game.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 pl-3">
                      <Clock size={11} className="text-white/30" />
                      <span className="text-xs font-mono text-white/60">{hrs}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}
