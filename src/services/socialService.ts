import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'
import type { EclipseFriend, FriendRequest } from '../types/game'

// Default fallback API URL (can be customized in settings)
export const DEFAULT_SOCIAL_API_URL = 'https://eclipse-social-api.eclipse-launcher.workers.dev'

let pollingInterval: any = null
let presenceHeartbeatInterval: any = null
const knownRequestUids = new Set<string>()
let isInitialized = false

function getApiUrl(): string {
  const custom = useGameStore.getState().settings.socialApiUrl
  if (custom && custom.trim().startsWith('http')) {
    return custom.trim().replace(/\/+$/, '')
  }
  return DEFAULT_SOCIAL_API_URL
}

/**
 * Generates or retrieves a persistent local user UID
 */
export function getOrCreateUserUid(): string {
  const current = useGameStore.getState().settings.userUid
  if (current && current.trim()) {
    return current.trim()
  }

  // Create a clean unique UID: uid_xxxxxxxxxxxx
  const newUid = `uid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
  useGameStore.getState().updateSettings({ userUid: newUid })
  return newUid
}

/**
 * Generates a clean unique Eclipse friend code (e.g. ECL-7X9K2)
 */
export function generateEclipseFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'ECL-'
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Initialize Cloudflare D1 Social Network:
 * 1. Ensure user UID & friend code exist
 * 2. Sync local user profile to Cloudflare D1
 * 3. Start presence heartbeat & polling for live friend updates
 */
export async function initSocialNetwork() {
  if (isInitialized) return
  isInitialized = true

  try {
    const uid = getOrCreateUserUid()
    let friendCode = useGameStore.getState().settings.friendCode
    if (!friendCode) {
      friendCode = generateEclipseFriendCode()
      useGameStore.getState().updateSettings({ friendCode })
    }

    // 1. Initial sync
    await syncMyProfile()

    // 2. Initial poll
    await pollFriendsAndRequests()

    // 3. Start Heartbeat (every 25 seconds)
    startPresenceHeartbeat()

    // 4. Start Live Polling for friend updates & incoming requests (every 10 seconds)
    startPolling()
  } catch (err) {
    console.warn('[SocialService] Init error:', err)
  }
}

// Backward compatibility alias for existing imports
export const initFirebaseSocial = initSocialNetwork

/**
 * Starts active heartbeat keeping user presence alive in Cloudflare D1 every 25 seconds
 */
export function startPresenceHeartbeat() {
  if (presenceHeartbeatInterval) clearInterval(presenceHeartbeatInterval)

  presenceHeartbeatInterval = setInterval(async () => {
    const uid = getOrCreateUserUid()
    const activeGame = useGameStore.getState().activeGame
    const status = activeGame ? 'ingame' : 'online'
    const currentGame = activeGame?.name || null

    try {
      await fetch(`${getApiUrl()}/api/user/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, status, currentGame }),
      })
    } catch {}
  }, 25000)
}

export function stopPresenceHeartbeat() {
  if (presenceHeartbeatInterval) {
    clearInterval(presenceHeartbeatInterval)
    presenceHeartbeatInterval = null
  }
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

/**
 * Starts polling for incoming friend requests and live friend presence
 */
function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval)

  pollingInterval = setInterval(async () => {
    await pollFriendsAndRequests()
  }, 10000)
}

/**
 * Polls the Cloudflare Worker API for confirmed friends and pending requests
 */
export async function pollFriendsAndRequests() {
  const uid = getOrCreateUserUid()
  if (!uid) return

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/poll?uid=${encodeURIComponent(uid)}`)
    if (!res.ok) return

    const data = await res.json()
    if (!data.success) return

    const friends: EclipseFriend[] = data.friends || []
    const incomingRequests: FriendRequest[] = data.incomingRequests || []
    const outgoingRequests = data.outgoingRequests || []

    // Detect newly received incoming friend requests and trigger notification
    incomingRequests.forEach((req) => {
      if (!knownRequestUids.has(req.fromUid)) {
        knownRequestUids.add(req.fromUid)
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        sendAppNotification({
          title: lang === 'de' ? 'Freundschaftsanfrage erhalten! 👥' : 'Friend Request Received! 👥',
          body: lang === 'de'
            ? `${req.fromUsername} (${req.fromFriendCode || 'Eclipse'}) möchte dein Freund sein!`
            : `${req.fromUsername} (${req.fromFriendCode || 'Eclipse'}) wants to be your friend!`,
          type: 'info',
          playSound: true,
          duration: 7000,
        })
      }
    })

    // Merge live cloud friends with existing local friends without wiping local/offline friends
    const currentLocalFriends = useGameStore.getState().settings.eclipseFriends || []
    const mergedMap = new Map<string, EclipseFriend>()

    // 1. Keep existing local friends first
    currentLocalFriends.forEach((f) => {
      if (f && f.id) mergedMap.set(f.id, f)
    })

    // 2. Overlay live cloud friends (updates online/ingame status, live game, avatar, levels)
    friends.forEach((f) => {
      if (f && f.id) {
        const existing = mergedMap.get(f.id) || {}
        mergedMap.set(f.id, {
          ...existing,
          ...f,
          status: f.status || (existing as any).status || 'offline',
        })
      }
    })

    // Update Zustand store
    useGameStore.getState().updateSettings({
      eclipseFriends: Array.from(mergedMap.values()),
      incomingFriendRequests: incomingRequests,
      outgoingFriendRequests: outgoingRequests,
    })
  } catch (err) {
    // Silently ignore network/offline errors during background polling
  }
}

/**
 * Syncs the local user's full profile (stats, playtime, steam level, badges, top games) to Cloudflare D1
 */
export async function syncMyProfile() {
  const uid = getOrCreateUserUid()
  if (!uid) return

  try {
    const { settings, library, installedGames, activeGame } = useGameStore.getState()
    let friendCode = settings.friendCode
    if (!friendCode) {
      friendCode = generateEclipseFriendCode()
      useGameStore.getState().updateSettings({ friendCode })
    }

    const isIngame = !!activeGame
    const activeGameName = activeGame?.name || null

    // Combine unique games for playtime calculations
    const allUserGamesMap = new Map<string, any>()
    const lib = library || []
    const inst = installedGames || []

    lib.forEach(g => allUserGamesMap.set(g.id || g.name, { ...g }))
    inst.forEach(g => {
      const key = g.id || g.name
      let base = allUserGamesMap.get(key)
      if (!base) {
        const found = Array.from(allUserGamesMap.entries()).find(([_, lg]) => lg.name.toLowerCase() === g.name.toLowerCase())
        if (found) {
          base = found[1]
          allUserGamesMap.delete(found[0])
        }
      }
      const existing = base || {}
      allUserGamesMap.set(key, {
        ...existing,
        ...g,
        playTimeMinutes: Math.max(existing.playTimeMinutes || 0, g.playTimeMinutes || 0),
        lastPlayed: Math.max(existing.lastPlayed || 0, g.lastPlayed || 0),
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
      .map(g => ({
        id: g.id || g.name,
        name: g.name,
        steamId: g.steamId || null,
        playTimeMinutes: g.playTimeMinutes || 0,
        lastPlayed: g.lastPlayed || 0,
      }))

    const totalLibraryCount = inst.length + lib.filter(g => !inst.some(ig => ig.name === g.name)).length
    const totalInstalledCount = inst.filter(g => g.installed !== false).length

    const payload = {
      uid,
      friendCode: friendCode.toUpperCase().trim(),
      username: settings.username || 'Eclipse Player',
      avatarUrl: settings.avatarUrl || '',
      status: isIngame ? 'ingame' : 'online',
      currentGame: isIngame ? activeGameName : null,
      level: settings.steamLevel || 1,
      steamLevel: settings.steamLevel || 1,
      steamProfileUrl: settings.steamProfileUrl || '',
      steamGamesCount: settings.steamGamesCount || 0,
      steamBadgesCount: settings.steamBadgesCount || 0,
      steamFavoriteBadge: settings.steamFavoriteBadge || null,
      steamRecentGames: settings.steamRecentGames || [],
      totalPlaytimeMins,
      totalPlaytimeHours,
      totalLibraryCount,
      totalInstalledCount,
      topPlayedGames,
    }

    await fetch(`${getApiUrl()}/api/user/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.warn('[SocialService] syncMyProfile error:', err)
  }
}

/**
 * Fetches a user's full public profile from Cloudflare D1 by UID or Eclipse Friend Code
 */
export async function fetchUserProfile(uidOrCode: string): Promise<any | null> {
  if (!uidOrCode || typeof uidOrCode !== 'string') return null
  const raw = uidOrCode.trim()
  const cleanUpper = raw.toUpperCase().replace(/\s+/g, '')

  // Generate lookup candidates (direct, without ECL-, with ECL-)
  const candidates = Array.from(new Set([
    raw,
    cleanUpper,
    cleanUpper.replace(/^ECL-/, ''),
    cleanUpper.startsWith('ECL-') ? cleanUpper : `ECL-${cleanUpper}`,
  ]))

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${getApiUrl()}/api/user/${encodeURIComponent(candidate)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.user) {
          return data.user
        }
      }
    } catch {}
  }

  return null
}

/**
 * Sends a friend request to another user by their Eclipse Friend Code (or raw UID)
 */
export async function sendFriendRequest(codeOrUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) {
    return { success: false, error: 'Keine Benutzer-ID gefunden.' }
  }

  // Ensure current user profile is synced so recipient gets our username & avatar
  syncMyProfile().catch(() => {})

  const raw = codeOrUid.trim()
  const cleanCode = raw.toUpperCase().replace(/\s+/g, '')
  if (!cleanCode) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  const candidates = Array.from(new Set([
    cleanCode,
    cleanCode.replace(/^ECL-/, ''),
    cleanCode.startsWith('ECL-') ? cleanCode : `ECL-${cleanCode}`,
  ]))

  let lastError = 'Kein Spieler mit diesem Code gefunden.'

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${getApiUrl()}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUid: myUid, toCodeOrUid: candidate }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        // Refresh poll immediately
        pollFriendsAndRequests()
        return {
          success: true,
          message: data.message || 'Freundschaftsanfrage gesendet!',
        }
      }

      if (data?.error) {
        lastError = data.error
        if (data.error.includes('selbst') || data.error.includes('befreundet') || data.error.includes('ausstehend')) {
          break
        }
      }
    } catch (err: any) {
      lastError = err?.message || 'Server nicht erreichbar.'
    }
  }

  return { success: false, error: lastError }
}

/**
 * Adds a friend instantly using their Eclipse Friend Code or UID (Firebase-like instant bilateral connection)
 */
export async function addFriendByCode(codeOrUid: string): Promise<{ success: boolean; friend?: EclipseFriend; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) {
    return { success: false, error: 'Keine Benutzer-ID gefunden.' }
  }

  const raw = codeOrUid.trim()
  const cleanCode = raw.toUpperCase().replace(/\s+/g, '')
  if (!cleanCode) {
    return { success: false, error: 'Bitte gib einen gültigen Freundes-Code ein.' }
  }

  // Ensure current user profile is synced
  syncMyProfile().catch(() => {})

  // 1. Look up user profile in Cloudflare D1
  const cloudUser = await fetchUserProfile(raw)
  if (cloudUser && cloudUser.uid) {
    const friendObj: EclipseFriend = {
      id: cloudUser.uid,
      username: cloudUser.username || 'Eclipse Player',
      avatarUrl: cloudUser.avatarUrl || '',
      status: (cloudUser.status as any) || 'online',
      currentGame: cloudUser.currentGame || undefined,
      level: cloudUser.level || 1,
      steamLevel: cloudUser.steamLevel || 1,
      steamProfileUrl: cloudUser.steamProfileUrl || undefined,
      friendCode: cloudUser.friendCode || cleanCode,
      steamRecentGames: cloudUser.steamRecentGames || [],
      steamFavoriteBadge: cloudUser.steamFavoriteBadge || null,
    }

    // Instantly add to local store (just like Firebase)
    const currentFriends = useGameStore.getState().settings.eclipseFriends || []
    if (!currentFriends.some(f => f.id === friendObj.id)) {
      useGameStore.getState().updateSettings({
        eclipseFriends: [...currentFriends, friendObj]
      })
    }

    // Send bilateral request / link on Cloudflare D1 in background
    fetch(`${getApiUrl()}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUid: myUid, toCodeOrUid: cloudUser.uid }),
    }).then(() => pollFriendsAndRequests()).catch(() => {})

    return {
      success: true,
      friend: friendObj,
      message: `Freund ${friendObj.username} hinzugefügt!`,
    }
  }

  // 2. Try sendFriendRequest endpoint directly
  const reqRes = await sendFriendRequest(raw)
  if (reqRes.success) {
    return { success: true, message: reqRes.message }
  }

  return { success: false, error: reqRes.error }
}

/**
 * Accepts an incoming friend request
 */
export async function acceptFriendRequest(fromUid: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) return { success: false, error: 'Nicht angemeldet.' }

  // Optimistically update local Zustand store immediately for 0ms latency
  const curSettings = useGameStore.getState().settings
  const curIncoming = curSettings.incomingFriendRequests || []
  const matchingLocalReq = curIncoming.find(r => r.fromUid === fromUid)
  const updatedIncoming = curIncoming.filter(r => r.fromUid !== fromUid)
  const curFriends = curSettings.eclipseFriends || []
  const newFriendObj: EclipseFriend = {
    id: fromUid,
    username: matchingLocalReq?.fromUsername || 'Eclipse Player',
    avatarUrl: matchingLocalReq?.fromAvatarUrl || '',
    status: 'online',
  }
  const updatedFriends = curFriends.some(f => f.id === fromUid) ? curFriends : [...curFriends, newFriendObj]
  useGameStore.getState().updateSettings({
    incomingFriendRequests: updatedIncoming,
    eclipseFriends: updatedFriends,
  })

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myUid, fromUid }),
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Annehmen der Anfrage.' }
    }

    const lang = curSettings.language === 'de' ? 'de' : 'en'
    sendAppNotification({
      title: lang === 'de' ? 'Freundschaftsanfrage angenommen! 🎉' : 'Friend Request Accepted! 🎉',
      body: lang === 'de'
        ? `Du bist jetzt mit ${matchingLocalReq?.fromUsername || 'dem Spieler'} befreundet!`
        : `You are now friends with ${matchingLocalReq?.fromUsername || 'the player'}!`,
      type: 'success',
      playSound: true,
    })

    // Poll to sync full metadata
    pollFriendsAndRequests()

    return { success: true }
  } catch (err: any) {
    console.error('[SocialService] acceptFriendRequest error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Declines an incoming friend request
 */
export async function declineFriendRequest(fromUid: string): Promise<{ success: boolean; error?: string }> {
  const myUid = getOrCreateUserUid()
  if (!myUid) return { success: false, error: 'Nicht angemeldet.' }

  // Optimistic local removal
  const curSettings = useGameStore.getState().settings
  const curIncoming = curSettings.incomingFriendRequests || []
  useGameStore.getState().updateSettings({
    incomingFriendRequests: curIncoming.filter(r => r.fromUid !== fromUid),
  })

  try {
    const res = await fetch(`${getApiUrl()}/api/friends/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myUid, fromUid }),
    })

    const data = await res.json()
    return { success: data.success }
  } catch (err: any) {
    console.error('[SocialService] declineFriendRequest error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Truly removes a friend bilaterally on BOTH sides and local Zustand store
 */
export async function removeFirebaseFriend(friendId: string) {
  const myUid = getOrCreateUserUid()

  // 1. Update local Zustand store immediately
  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  useGameStore.getState().updateSettings({
    eclipseFriends: currentFriends.filter(f => f.id !== friendId),
  })

  if (myUid && friendId) {
    try {
      await fetch(`${getApiUrl()}/api/friends/${encodeURIComponent(friendId)}?uid=${encodeURIComponent(myUid)}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.warn('[SocialService] removeFriend error:', err)
    }
  }
}

export const removeSocialFriend = removeFirebaseFriend

/**
 * Restores a removed friend bilaterally (used by the minimalist Undo action)
 */
export async function restoreFirebaseFriend(friend: EclipseFriend) {
  const myUid = getOrCreateUserUid()

  const currentFriends = useGameStore.getState().settings.eclipseFriends || []
  if (!currentFriends.some(f => f.id === friend.id)) {
    useGameStore.getState().updateSettings({
      eclipseFriends: [...currentFriends, friend],
    })
  }

  if (myUid && friend?.id) {
    try {
      await fetch(`${getApiUrl()}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myUid, fromUid: friend.id }),
      })
    } catch (err) {
      console.warn('[SocialService] restoreFriend error:', err)
    }
  }
}

export const restoreSocialFriend = restoreFirebaseFriend

/**
 * Updates current user's live presence (online, ingame, or offline)
 */
export async function updateFirebasePresence(status: 'online' | 'ingame' | 'offline', gameName?: string | null) {
  const myUid = getOrCreateUserUid()
  if (!myUid) return

  try {
    const activeGameName = status === 'ingame' && gameName ? gameName : null
    await fetch(`${getApiUrl()}/api/user/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: myUid, status, currentGame: activeGameName }),
    })
  } catch (err) {
    console.warn('[SocialService] updatePresence error:', err)
  }
}

export const updateSocialPresence = updateFirebasePresence
