import { useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { type Language } from '../i18n/translations'
import { translate, type TranslationKey } from '../i18n/translate'

export function useTranslation() {
  const language = useGameStore(state => state.settings.language)
  // Default to German unless explicitly set to 'en'
  const lang = (language === 'en' ? 'en' : 'de') as Language

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>) => translate(lang, key, params), [lang])

  return { t, language: lang, locale: lang === 'de' ? 'de-DE' : 'en-US' }
}
