import { create } from 'zustand'

interface CatalogueState {
  sortBy: string
  setSortBy: (sort: string) => void
  isModern: boolean
  setIsModern: (val: boolean) => void
  yearRange: [number, number]
  setYearRange: (range: [number, number]) => void
  selectedSources: string[]
  toggleSource: (source: string) => void
  selectedDevs: string[]
  toggleDev: (dev: string) => void
  selectedPubs: string[]
  togglePub: (pub: string) => void
  currentPage: number
  setCurrentPage: (page: number) => void
}

export const useCatalogueStore = create<CatalogueState>((set) => ({
  sortBy: 'popularity',
  setSortBy: (sort) => set({ sortBy: sort, currentPage: 1 }),
  isModern: false,
  setIsModern: (val) => set({ isModern: val, currentPage: 1 }),
  yearRange: [2000, 2026],
  setYearRange: (range) => set({ yearRange: range, currentPage: 1 }),
  selectedSources: [],
  toggleSource: (source) => set((state) => ({
    selectedSources: state.selectedSources.includes(source)
      ? state.selectedSources.filter(s => s !== source)
      : [...state.selectedSources, source],
    currentPage: 1
  })),
  selectedDevs: [],
  toggleDev: (dev) => set((state) => ({
    selectedDevs: state.selectedDevs.includes(dev)
      ? state.selectedDevs.filter(d => d !== dev)
      : [...state.selectedDevs, dev],
    currentPage: 1
  })),
  selectedPubs: [],
  togglePub: (pub) => set((state) => ({
    selectedPubs: state.selectedPubs.includes(pub)
      ? state.selectedPubs.filter(p => p !== pub)
      : [...state.selectedPubs, pub],
    currentPage: 1
  })),
  currentPage: 1,
  setCurrentPage: (page) => set({ currentPage: page })
}))
