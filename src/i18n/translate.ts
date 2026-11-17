import { translations } from './translations'

export type TranslationKey = keyof typeof translations.en

export function translate(language: string | undefined, key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = language === 'en' ? 'en' : 'de'
  const message = translations[lang][key] ?? translations.en[key] ?? key
  return params ? message.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder) : message
}
