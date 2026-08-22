import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User, Library, Clock, Save, Edit3, Settings, Trophy, Gamepad2, Award, UserPlus, Check, ArrowLeft, Loader2 } from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { syncMyProfile, fetchUserProfile, sendFriendRequest } from '../../services/socialService'
import { fetchSteamUserProfile } from '../../services/steamService'
import { formatLastSeen } from '../../services/assetHelper'
import { sendAppNotification } from '../../services/notificationService'
import type { EclipseFriend } from '../../types/game'

export function ProfileView() {
  const { library, installedGames, settings, updateSettings, activeGame } = useGameStore()
  const { setActiveView, openGameDetails, setActiveSettingsTab, selectedFriendId, setSelectedFriendId } = useUIStore()
  const { t, language } = useTranslation()
  
  const [fetchedProfile, setFetchedProfile] = useState<any | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [isSendingRequest, setIsSendingRequest] = useState(false)
  const [requestSent, setRequestSent] = useState(false)

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

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(settings.username || 'User')
  const [editAvatar, setEditAvatar] = useState(settings.avatarUrl || '')

  // Combined stats resolution
  const profileData = fetchedProfile || friend

  const displayName = isViewingFriend 
    ? (profileData?.username || friend?.username || 'Eclipse Player') 
    : (settings.username || 'User')
  
  const displayAvatar = isViewingFriend 
    ? (profileData?.avatarUrl || friend?.avatarUrl || '') 
    : settings.avatarUrl

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
    if (window.electronAPI?.setSettings) {
      window.electronAPI.setSettings({ username: editName, avatarUrl: editAvatar }).then(res => {
        if (res.success) {
          updateSettings({ username: editName, avatarUrl: editAvatar })
          syncMyProfile()
          setIsEditing(false)
        }
      })
    } else {
      updateSettings({ username: editName, avatarUrl: editAvatar })
      syncMyProfile()
      setIsEditing(false)
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

  return (
    <div className="h-full overflow-y-auto bg-[#0b0c0e]">
      <div className="max-w-5xl mx-auto p-12">
        
        {/* Header Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111317] border border-white/10 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden mb-12"
        >
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3" />
          
          <div className="relative z-10 group">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-black ring-4 ring-white/10 flex items-center justify-center relative">
              {displayAvatar ? (
                <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={64} className="text-white/30" />
              )}
            </div>
            {!isViewingFriend && isEditing && (
              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit3 className="text-white" />
              </div>
            )}
          </div>
          
          <div className="flex-1 text-center md:text-left z-10">
            {!isViewingFriend && isEditing ? (
              <div className="space-y-4 max-w-sm mx-auto md:mx-0">
                <div>
                  <label className="block text-xs font-medium text-hub-muted uppercase tracking-wider mb-1.5 text-left">{t('username')}</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-[#16181c] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-hub-muted uppercase tracking-wider mb-1.5 text-left">{t('avatarUrl')}</label>
                  <input 
                    type="text" 
                    placeholder="https://..."
                    value={editAvatar}
                    onChange={e => setEditAvatar(e.target.value)}
                    className="w-full bg-[#16181c] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="flex justify-center md:justify-start gap-3 pt-2">
                  <button 
                    onClick={handleSave}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Save size={16} /> {t('save')}
                  </button>
                  <button 
                    onClick={() => {
                      setEditName(settings.username || 'User')
                      setEditAvatar(settings.avatarUrl || '')
                      setIsEditing(false)
                    }}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start mb-2">
                  <h1 className="text-4xl font-black text-white uppercase tracking-tight">{displayName}</h1>
                  {profileData?.friendCode && (
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/70">
                      {profileData.friendCode}
                    </span>
                  )}
                </div>
                
                <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  
                  {/* Status & Member Type */}
                  <div className="flex items-center gap-3">
                    <p className="text-hub-muted text-sm flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full inline-block ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
                      {isViewingFriend ? friendStatusText : t('online')}
                    </p>
                    <div className="w-[1px] h-4 bg-white/10"></div>
                    {(isViewingFriend ? (profileData?.steamProfileUrl || friend?.steamProfileUrl) : settings.steamProfileUrl) ? (
                      <span className="text-sm font-bold text-[#66c0f4] flex items-center gap-1.5">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-3.5 h-3.5" alt="Steam" />
                        Steam Player
                      </span>
                    ) : (
                      <motion.span 
                        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                        className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-orange-400 to-red-500 bg-[length:200%_auto]"
                      >
                        ECLIPSE MEMBER
                      </motion.span>
                    )}
                  </div>

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
                  <div className="flex flex-wrap items-center gap-3 border-l border-white/10 pl-4 ml-1">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" className="w-5 h-5 opacity-50" alt="Steam Stats" title="Steam Profile Stats" />
                    {steamLevel !== undefined && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1b2838] border border-[#2a475e] text-[#66c0f4] shadow-sm">
                        <Trophy size={13} />
                        <span className="text-xs font-bold tracking-wide">Level {steamLevel}</span>
                      </div>
                    )}
                    {steamGamesCount !== undefined && steamGamesCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1b2838] border border-[#2a475e] text-[#66c0f4] shadow-sm">
                        <Gamepad2 size={13} />
                        <span className="text-xs font-bold tracking-wide">{steamGamesCount} Games</span>
                      </div>
                    )}
                    {steamBadgesCount !== undefined && steamBadgesCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1b2838] border border-[#2a475e] text-[#66c0f4] shadow-sm">
                        <Award size={13} />
                        <span className="text-xs font-bold tracking-wide">{steamBadgesCount} Badges</span>
                      </div>
                    )}
                    {steamFavoriteBadge && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1b2838]/60 border border-[#2a475e]/50 hover:bg-[#1b2838] transition-colors cursor-pointer group" title={steamFavoriteBadge.name}>
                        <img src={steamFavoriteBadge.iconUrl} alt="Badge" className="w-6 h-6 drop-shadow-md group-hover:scale-110 transition-transform" />
                        <div className="flex flex-col justify-center h-full">
                          <span className="text-[9px] text-[#66c0f4] uppercase font-bold tracking-wider leading-none mb-0.5 opacity-80 mt-1">Featured</span>
                          <span className="text-[11px] text-white font-medium leading-none truncate max-w-[200px]">{steamFavoriteBadge.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile Action Buttons */}
                <div className="mt-6 flex flex-wrap gap-3 justify-center md:justify-start">
                  {!isViewingFriend ? (
                    <>
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Edit3 size={16} /> {t('editProfile')}
                      </button>
                      <button 
                        onClick={() => {
                          setActiveSettingsTab('profile')
                          setActiveView('settings')
                        }}
                        className="bg-transparent hover:bg-white/5 text-hub-muted hover:text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Settings size={16} /> {t('settings')}
                      </button>
                    </>
                  ) : (
                    <>
                      {!isAlreadyFriend && (
                        <button 
                          onClick={handleSendFriendReq}
                          disabled={isSendingRequest || requestSent}
                          className="bg-white text-black font-bold hover:bg-white/90 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
                        >
                          {isSendingRequest ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : requestSent ? (
                            <Check size={16} className="text-green-600" />
                          ) : (
                            <UserPlus size={16} />
                          )}
                          {requestSent 
                            ? (language === 'de' ? 'Anfrage gesendet' : 'Request Sent') 
                            : (language === 'de' ? 'Freund hinzufügen' : 'Add Friend')}
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          setSelectedFriendId(null)
                        }}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <ArrowLeft size={16} /> {language === 'de' ? 'Mein Profil' : 'My Profile'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {(!isViewingFriend ? settings.profileShowPlaytime !== false : true) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#111317] border border-white/10 rounded-2xl p-6 relative overflow-hidden group"
            >
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Clock className="text-indigo-400" size={24} />
              </div>
              <h3 className="text-3xl font-bold text-white mb-1">
                {displayTotalPlaytime}
              </h3>
              <p className="text-sm font-medium text-hub-muted uppercase tracking-wider">{t('totalPlaytime')}</p>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#111317] border border-white/10 rounded-2xl p-6 relative overflow-hidden group"
          >
            <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Library className="text-pink-400" size={24} />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              {displayLibraryCount}
            </h3>
            <p className="text-sm font-medium text-hub-muted uppercase tracking-wider">
              {t('gamesInLibrary')}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#111317] border border-white/10 rounded-2xl p-6 relative overflow-hidden group"
          >
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Save className="text-green-400" size={24} />
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              {displayInstalledCount}
            </h3>
            <p className="text-sm font-medium text-hub-muted uppercase tracking-wider">
              {isViewingFriend ? 'Activity / Installed' : t('installedGames')}
            </p>
          </motion.div>
        </div>

        {/* Most Played Games Section */}
        {displayTopGames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#111317] border border-white/10 rounded-2xl p-6 mb-12"
          >
            <h3 className="text-lg font-bold text-white mb-4">
              {language === 'de' ? 'Meistgespielte Spiele' : 'Most Played Games'}
            </h3>
            <div className="space-y-3">
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
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-white w-5 text-center">#{idx + 1}</span>
                      <p className="text-sm font-bold text-white group-hover:text-gray-300 transition-colors">{game.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-white/60" />
                      <span className="text-xs font-semibold text-white/90">{hrs}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Steam Recent Activity Showcase */}
        {steamRecentGames && steamRecentGames.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12"
          >
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-xl font-bold text-white tracking-wide">Steam Recent Activity</h3>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {steamRecentGames.slice(0, 3).map((game: any) => (
                <div key={game.appId || game.name} className="bg-black/20 rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-default">
                  <div className="relative h-24 overflow-hidden">
                    <img src={game.iconUrl} alt={game.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111317] to-transparent"></div>
                  </div>
                  <div className="p-4 relative -mt-6">
                    <h4 className="font-semibold text-white text-sm truncate drop-shadow-md mb-1">{game.name}</h4>
                    <p className="text-xs text-[#66c0f4] font-medium">{game.playtime}</p>
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

