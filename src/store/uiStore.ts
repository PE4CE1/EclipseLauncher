import { create } from 'zustand'
import type { ActiveView } from '../types/game'
import type { SteamGame, SteamAppDetails } from '../services/steamService'

interface UIStore {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  activeSettingsTab: string
  setActiveSettingsTab: (tab: string) => void

  // Navigation History
  history: ActiveView[]
  historyIndex: number
  goBack: () => void
  goForward: () => void
  canGoBack: boolean
  canGoForward: boolean

  searchQuery: string
  setSearchQuery: (q: string) => void
  isSearchOpen: boolean
  setIsSearchOpen: (v: boolean) => void

  // Auto Updater
  updateStatus: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  updateProgress: number
  updateInfo: any
  setUpdateState: (status: UIStore['updateStatus'], progress?: number, info?: any) => void

  featuredGame: SteamGame | null
  setFeaturedGame: (game: SteamGame | null) => void

  // Selected game for detail modal
  selectedGameId: number | null
  selectedGameName: string | null
  setSelectedGameId: (id: number | null) => void

  isGameModalOpen: boolean
  setIsGameModalOpen: (v: boolean) => void

  isFriendsOpen: boolean
  setIsFriendsOpen: (v: boolean) => void

  isAddFriendOpen: boolean
  setIsAddFriendOpen: (v: boolean) => void

  selectedFriendId: string | null
  setSelectedFriendId: (id: string | null) => void
  isFriendProfileOpen: boolean
  openFriendProfile: (friendId: string) => void
  closeFriendProfile: () => void

  // Unified click handler
  openGameDetails: (appId: number, name?: string) => void

  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void

  currency: 'EUR' | 'USD'
  setCurrency: (c: 'EUR' | 'USD') => void
  toggleCurrency: () => void

  notification: { title?: string; message: string; type: 'success' | 'error' | 'info'; duration?: number } | null
  showNotification: (message: string, type?: 'success' | 'error' | 'info', title?: string, duration?: number) => void
  clearNotification: () => void

  isEclipseCinemaActive: boolean
  triggerEclipseCinema: () => void
  closeEclipseCinema: () => void
}

let notificationTimer: any = null

export const useUIStore = create<UIStore>((set) => ({
  activeView: 'home',
  activeSettingsTab: 'general',
  currency: (localStorage.getItem('eclipse_currency') as 'EUR' | 'USD') || 'EUR',
  setCurrency: (c) => {
    localStorage.setItem('eclipse_currency', c)
    set({ currency: c })
  },
  toggleCurrency: () => set((state) => {
    const next = state.currency === 'EUR' ? 'USD' : 'EUR'
    localStorage.setItem('eclipse_currency', next)
    return { currency: next }
  }),
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),
  history: ['home'],
  historyIndex: 0,
  canGoBack: false,
  canGoForward: false,

  setActiveView: (view) => set((state) => {
    if (state.activeView === view && !state.isGameModalOpen) return state
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), view]
    const newIndex = newHistory.length - 1
    return {
      activeView: view,
      isGameModalOpen: false,
      history: newHistory,
      historyIndex: newIndex,
      canGoBack: newIndex > 0,
      canGoForward: false,
    }
  }),

  goBack: () => set((state) => {
    if (state.isGameModalOpen) {
      return { isGameModalOpen: false }
    }
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1
      const prevView = state.history[newIndex]
      return {
        activeView: prevView,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: newIndex < state.history.length - 1,
      }
    }
    return state
  }),

  goForward: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1
      const nextView = state.history[newIndex]
      return {
        activeView: nextView,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: newIndex < state.history.length - 1,
      }
    }
    return state
  }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  isSearchOpen: false,
  setIsSearchOpen: (v) => set({ isSearchOpen: v }),

  updateStatus: 'idle',
  updateProgress: 0,
  updateInfo: null,
  setUpdateState: (status, progress, info) => set((state) => ({ 
    updateStatus: status,
    updateProgress: progress !== undefined ? progress : state.updateProgress,
    updateInfo: info !== undefined ? info : state.updateInfo
  })),

  featuredGame: null,
  setFeaturedGame: (game) => set({ featuredGame: game }),

  selectedGameId: null,
  selectedGameName: null,
  setSelectedGameId: (id) => set({ selectedGameId: id }),

  isGameModalOpen: false,
  setIsGameModalOpen: (v) => set({ isGameModalOpen: v }),

  isFriendsOpen: false,
  setIsFriendsOpen: (v) => set({ isFriendsOpen: v }),

  isAddFriendOpen: false,
  setIsAddFriendOpen: (v) => set({ isAddFriendOpen: v }),

  selectedFriendId: null,
  setSelectedFriendId: (id) => set({ selectedFriendId: id }),
  isFriendProfileOpen: false,
  openFriendProfile: (id) => set((state) => {
    const newHistory = [...state.history.slice(0, state.historyIndex + 1), 'profile' as ActiveView]
    const newIndex = newHistory.length - 1
    return {
      activeView: 'profile',
      selectedFriendId: id,
      history: newHistory,
      historyIndex: newIndex,
      canGoBack: newIndex > 0,
      canGoForward: false,
      isGameModalOpen: false,
      isFriendProfileOpen: false,
    }
  }),
  closeFriendProfile: () => set({ isFriendProfileOpen: false, selectedFriendId: null }),

  openGameDetails: (appId, name) => set({ selectedGameId: appId, selectedGameName: name || null, isGameModalOpen: true }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  notification: null,
  showNotification: (message, type = 'info', title, duration = 5000) => {
    if (notificationTimer) clearTimeout(notificationTimer)
    set({ notification: { message, type, title, duration } })
    notificationTimer = setTimeout(() => {
      set({ notification: null })
      notificationTimer = null
    }, duration)
  },
  clearNotification: () => {
    if (notificationTimer) {
      clearTimeout(notificationTimer)
      notificationTimer = null
    }
    set({ notification: null })
  },

  isEclipseCinemaActive: false,
  triggerEclipseCinema: () => set({ isEclipseCinemaActive: true }),
  closeEclipseCinema: () => set({ isEclipseCinemaActive: false }),
}))
