export interface FreeGameItem {
  id: string
  title: string
  platform: 'Epic Games' | 'Steam' | 'GOG' | 'Other'
  url: string
  clientUrl?: string
  originalPrice?: string
  endDate?: string
  imageUrl?: string
  steamAppId?: number
  slug?: string
}
