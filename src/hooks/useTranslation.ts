import { useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { translations, Language } from '../i18n/translations'

export function useTranslation() {
  const language = useGameStore(state => state.settings.language)
  // Default to English if language is not set or invalid
  const lang = (language === 'de' ? 'de' : 'en') as Language

  const t = useCallback((key: keyof typeof translations.en, params?: Record<string, string | number>) => {
    let str = translations[lang][key] || translations.en[key] || key
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v))
      })
    }
    
    return str
  }, [lang])

  return { t, language: lang }
}
