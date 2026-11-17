import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { freeGameClaimKey } from '../services/freeGameOffers'
import type { FreeGameItem } from '../types/freeGames'

interface FreeGamesState {
  claimed: Record<string, true>
  markClaimed: (game: FreeGameItem) => void
}

export const useFreeGamesStore = create<FreeGamesState>()(persist((set, get) => ({
  claimed: {},
  markClaimed: game => {
    const key = freeGameClaimKey(game)
    if (get().claimed[key] === true) return
    set(state => ({ claimed: { ...state.claimed, [key]: true } }))
  },
}), {
  name: 'eclipse-free-game-claims',
  version: 1,
  partialize: state => ({ claimed: state.claimed }),
  storage: createJSONStorage(() => ({
    // Link opening must still work if storage is unavailable or full.
    getItem: name => { try { return localStorage.getItem(name) } catch { return null } },
    setItem: (name, value) => { try { localStorage.setItem(name, value) } catch {} },
    removeItem: name => { try { localStorage.removeItem(name) } catch {} },
  })),
  merge: (persisted, current) => {
    const claimed = (persisted as Partial<FreeGamesState> | null)?.claimed
    return {
      ...current,
      claimed: claimed && typeof claimed === 'object' && !Array.isArray(claimed)
        ? Object.fromEntries(Object.entries(claimed).filter(([key, value]) => key.length <= 1024 && value === true))
        : {},
    }
  },
}))
