import { useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import type { AppSettings } from '../../types/game'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { enableSecureRecovery, restoreAccountBySecret } from '../../services/firebaseService'
import { recoveryError, validRecoveryKey } from '../../services/accountRecovery'

export function AccountProtection({ settings }: { settings: Partial<AppSettings> }) {
  const { t, language } = useTranslation(), de = language === 'de'
  const notify = useUIStore(state => state.showNotification)
  const [showKey, setShowKey] = useState(false), [input, setInput] = useState('')
  const [busy, setBusy] = useState<'setup' | 'restore' | null>(null)
  const initial = window.electronAPI?.account?.initialIdentity
  const friendCode = settings.friendCode || initial?.friendCode || ''
  const secret = settings.accountSecret || initial?.accountSecret || ''
  const ready = settings.accountRecoveryReady === true && validRecoveryKey(secret)
  const error = settings.accountRecoveryError || settings.accountRecoveryErrorCode
    ? recoveryError(settings.accountRecoveryErrorCode ? { code: settings.accountRecoveryErrorCode } : settings.accountRecoveryError, language) : ''
  const control = 'p-1 hover:bg-white/10 text-white/50 hover:text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

  async function copy(value: string, recovery = false) {
    try {
      await navigator.clipboard.writeText(value)
      notify(recovery ? (de ? 'Recovery Key kopiert.' : 'Recovery key copied.') : (de ? 'Freundescode kopiert.' : 'Friend code copied.'), 'success')
    } catch { notify(de ? 'Kopieren ist gerade nicht möglich. Bitte versuche es erneut.' : 'Copying is currently unavailable. Please try again.', 'error') }
  }

  async function setup() {
    setBusy('setup'); setShowKey(false)
    try {
      const result = await enableSecureRecovery()
      if (result.success) notify(t('uiRecoveryConfigured'), 'success')
      else notify(recoveryError(result.errorCode ? { code: result.errorCode } : result.error, language), 'error')
    } catch (error) { notify(recoveryError(error, language), 'error') }
    finally { setBusy(null) }
  }

  async function restore() {
    const key = input.trim().toUpperCase()
    if (!validRecoveryKey(key)) { notify(t('uiRecoveryInvalidKey'), 'error'); return }
    setBusy('restore'); setShowKey(false)
    try {
      const result = await restoreAccountBySecret(key)
      if (result.success) { setInput(''); notify(t('uiRecoveryRestored'), 'success') }
      else notify(recoveryError(result.errorCode ? { code: result.errorCode } : result.error, language), 'error')
    } catch (error) { notify(recoveryError(error, language), 'error') }
    finally { setBusy(null) }
  }

  return <section className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 sm:p-5 space-y-4" data-account-protection data-recovery-ready={ready}>
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0"><ShieldCheck size={15} className="text-emerald-400" /></div>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-white text-xs sm:text-sm">{de ? 'Account-Schutz' : 'Account Protection'}</h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${ready ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-300'}`} />
            {ready ? (de ? 'Recovery bereit' : 'Recovery ready') : (de ? 'Einrichtung nötig' : 'Setup required')}
          </span>
        </div>
        <p className="text-[11px] text-white/40 mt-0.5">{de ? 'Dein geheimer Recovery Key stellt dein Profil auf einem anderen PC wieder her.' : 'Your secret recovery key restores your profile on another PC.'}</p>
      </div>
    </div>
    {!ready && <div className="text-xs text-white/60 space-y-2" role="status" data-recovery-error>
      <p>{error || (de ? 'Richte die sichere Wiederherstellung für dein bestehendes Konto ein.' : 'Set up secure recovery for your existing account.')}</p>
      <button type="button" className="btn-secondary text-xs" disabled={!!busy} onClick={() => void setup()} data-recovery-setup>
        {busy === 'setup' ? (de ? 'Wird eingerichtet …' : 'Setting up …') : (de ? 'Sicheren Recovery Key einrichten' : 'Set up secure recovery')}
      </button>
    </div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3.5 py-2.5">
        <div className="text-[11px] font-medium text-white/40 mb-1">{de ? 'Freundescode' : 'Friend Code'}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-white tracking-wider" data-friend-code>{friendCode || '—'}</span>
          <button type="button" className={control} disabled={!friendCode} onClick={() => void copy(friendCode)} title={de ? 'Freundescode kopieren' : 'Copy friend code'}><Copy size={13} /></button>
        </div>
        <p className="text-[10px] text-white/35 mt-1">{t('uiRecoveryFriendCodeOnly')}</p>
      </div>
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3.5 py-2.5 min-w-0">
        <div className="text-[11px] font-medium text-white/40 mb-1">{de ? 'Recovery Key (PC-Wechsel)' : 'Recovery Key (PC Switch)'}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-white/80 break-all" data-recovery-key>{!ready ? (de ? 'Noch nicht eingerichtet' : 'Not configured') : showKey ? secret : '••••••••••••••••••••••••'}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" disabled={!ready} onClick={() => setShowKey(value => !value)} className={control} title={showKey ? (de ? 'Schlüssel verbergen' : 'Hide key') : (de ? 'Schlüssel anzeigen' : 'Show key')} data-recovery-reveal>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            <button type="button" disabled={!ready} onClick={() => void copy(secret, true)} className={control} title={de ? 'Recovery Key kopieren' : 'Copy recovery key'} data-recovery-copy><Copy size={13} /></button>
          </div>
        </div>
      </div>
    </div>
    <form className="pt-2 border-t border-white/[0.04]" onSubmit={event => { event.preventDefault(); if (!busy) void restore() }}>
      <div className="flex gap-2 flex-wrap sm:flex-nowrap">
        <input type="password" autoComplete="off" spellCheck={false} aria-label={de ? 'Recovery Key zur Wiederherstellung' : 'Recovery key to restore'} placeholder={de ? 'Recovery Key zur Wiederherstellung (ECL-SEC-...)' : 'Recovery key to restore (ECL-SEC-...)'} value={input} onChange={event => setInput(event.target.value)} className="flex-1 min-w-0 bg-white/[0.02] border border-white/[0.08] focus:border-white/20 rounded-lg py-2 px-3 text-xs text-white placeholder:text-white/30 font-mono focus:outline-none" data-recovery-input />
        <button type="submit" disabled={!!busy || !input.trim()} className="px-3.5 py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-medium text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed" data-recovery-restore>
          {busy === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
          {busy === 'restore' ? (de ? 'Wird wiederhergestellt …' : 'Restoring …') : (de ? 'Wiederherstellen' : 'Restore')}
        </button>
      </div>
      <p className="text-[11px] text-white/35 mt-1.5">{de ? 'Eine Anmeldung ist ausschließlich mit dem geheimen Recovery Key möglich.' : 'Only your secret recovery key can be used to sign in.'}</p>
    </form>
  </section>
}
