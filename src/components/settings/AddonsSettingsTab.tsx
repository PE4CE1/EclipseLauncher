import { useState } from 'react'
import { motion } from 'framer-motion'
import { Boxes, Key, ExternalLink } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useGameStore } from '../../store/gameStore'
import { openKeyforsteamHome } from '../../services/keyforsteamService'

export function AddonsSettingsTab() {
  const { language } = useTranslation()
  const isDe = language === 'de'

  const { settings, updateSettings } = useGameStore()
  const isKeyforsteamActive = settings.keyforsteamEnabled !== false

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text })
    setTimeout(() => {
      setActionMessage(null)
    }, 3000)
  }

  const handleToggleKeyforsteam = () => {
    const nextVal = !isKeyforsteamActive
    updateSettings({ keyforsteamEnabled: nextVal })
    if (window.electronAPI?.setSettings) {
      window.electronAPI.setSettings({ keyforsteamEnabled: nextVal })
    }
    showMessage(
      nextVal
        ? (isDe ? 'Keyforsteam Preisvergleich aktiviert' : 'Keyforsteam price comparison enabled')
        : (isDe ? 'Keyforsteam Preisvergleich deaktiviert' : 'Keyforsteam price comparison disabled')
    )
  }

  return (
    <div className="space-y-5">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="settings-extension-heading flex items-center justify-between">
        <div className="settings-extension-title">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Boxes size={18} className="text-white" />
            <span>{isDe ? 'Add-ons' : 'Add-ons'}</span>
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {isDe 
              ? 'Optionale Erweiterungen & Integrationen für deine Spielebibliothek' 
              : 'Optional extensions & integrations for your game library'}
          </p>
        </div>

        {actionMessage && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`text-xs px-3 py-1 rounded-lg border font-medium ${
              actionMessage.type === 'success'
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-red-500/10 text-red-300 border-red-500/20'
            }`}
          >
            {actionMessage.text}
          </motion.div>
        )}
      </div>

      {/* ─── Keyforsteam Card (Ultra-Clean & Minimalist) ──────────────────── */}
      <div className="settings-glass-card bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-5 relative overflow-hidden transition-colors">
        {/* Top row: Icon + Info + Native Toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-white/90 shadow-sm">
              <Key size={18} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">Keyforsteam</span>
                <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                  Allkeyshop Network
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-medium text-white/70 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                  {isDe ? 'Preisvergleich' : 'Price Comparison'}
                </span>
              </div>
              <p className="text-xs text-white/50 mt-1 max-w-xl leading-relaxed">
                {isDe 
                  ? 'Vergleicht über 30 Key-Shops & Marktplätze (Instant Gaming, CDKeys, MMOGA, Kinguin, Eneba, G2A, Steam & mehr) mit Live-Preisen, Gutscheincodes und Direkt-Links.' 
                  : 'Compares over 30 key stores & marketplaces (Instant Gaming, CDKeys, MMOGA, Kinguin, Eneba, G2A, Steam & more) with live prices, vouchers, and direct links.'}
              </p>
            </div>
          </div>

          {/* Minimalist Switch */}
          <div className="flex items-center gap-2.5 flex-shrink-0 pt-0.5">
            <span className={`text-xs font-semibold tracking-tight ${isKeyforsteamActive ? 'text-white' : 'text-white/30'}`}>
              {isKeyforsteamActive ? (isDe ? 'Aktiv' : 'Enabled') : (isDe ? 'Inaktiv' : 'Disabled')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isKeyforsteamActive}
              onClick={handleToggleKeyforsteam}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isKeyforsteamActive ? 'bg-white' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full transition duration-200 ease-in-out shadow-md ${
                  isKeyforsteamActive ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Bottom row: Direct Keyforsteam Link */}
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <span className="text-xs text-white/40">
            {isDe ? 'Offizielles Keyforsteam-Netzwerk' : 'Official Keyforsteam Network'}
          </span>

          <button
            type="button"
            onClick={() => openKeyforsteamHome()}
            className="text-xs text-white/60 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer py-1.5 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06]"
          >
            <span>Keyforsteam.de</span>
            <ExternalLink size={11} className="opacity-60" />
          </button>
        </div>
      </div>
    </div>
  )
}
