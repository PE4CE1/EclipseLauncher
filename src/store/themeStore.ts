import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomTheme } from '../types/theme'

interface ThemeState {
  installedThemes: CustomTheme[]
  activeThemeId: string | null
  installTheme: (theme: CustomTheme) => void
  deleteTheme: (themeId: string) => void
  setActiveTheme: (themeId: string | null) => void
  toggleTheme: (themeId: string) => void
  getActiveTheme: () => CustomTheme | undefined
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      installedThemes: [],
      activeThemeId: null,

      installTheme: (theme: CustomTheme) => {
        set((state) => {
          // Replace theme if already installed with same ID or name
          const existingIndex = state.installedThemes.findIndex(
            (t) => t.id === theme.id || t.name.toLowerCase() === theme.name.toLowerCase()
          )

          let updated: CustomTheme[]
          if (existingIndex >= 0) {
            updated = [...state.installedThemes]
            updated[existingIndex] = { ...theme, installedAt: Date.now() }
          } else {
            updated = [...state.installedThemes, { ...theme, installedAt: Date.now() }]
          }

          return {
            installedThemes: updated,
            activeThemeId: theme.id, // Auto-activate on import!
          }
        })
      },

      deleteTheme: (themeId: string) => {
        set((state) => ({
          installedThemes: state.installedThemes.filter((t) => t.id !== themeId),
          activeThemeId: state.activeThemeId === themeId ? null : state.activeThemeId,
        }))
      },

      setActiveTheme: (themeId: string | null) => {
        set({ activeThemeId: themeId })
      },

      toggleTheme: (themeId: string) => {
        set((state) => ({
          activeThemeId: state.activeThemeId === themeId ? null : themeId,
        }))
      },

      getActiveTheme: () => {
        const { installedThemes, activeThemeId } = get()
        return installedThemes.find((t) => t.id === activeThemeId)
      },
    }),
    {
      name: 'eclipse_themes_storage',
    }
  )
)
