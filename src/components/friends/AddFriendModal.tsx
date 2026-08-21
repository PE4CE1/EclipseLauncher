import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, Check, Loader2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { fetchSteamUserProfile } from '../../services/steamService';
import { addFriendByCode, sendFriendRequest, getOrCreateFriendCode, syncMyProfile, fetchUserProfile } from '../../services/socialService';
import { sendAppNotification } from '../../services/notificationService';
import type { EclipseFriend } from '../../types/game';

export const AddFriendModal: React.FC = () => {
  const { t } = useTranslation();
  const { isAddFriendOpen, setIsAddFriendOpen, openFriendProfile } = useUIStore();
  const { settings, updateSettings } = useGameStore();
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const myFriendCode = settings.friendCode || getOrCreateFriendCode();

  // Ensure friend code is in store and sync profile to Cloudflare D1
  useEffect(() => {
    if (isAddFriendOpen) {
      const code = getOrCreateFriendCode();
      if (settings.friendCode !== code) {
        updateSettings({ friendCode: code });
      }
      syncMyProfile();
    }
  }, [isAddFriendOpen]);

  if (!isAddFriendOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(myFriendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const translateError = (rawErr?: string) => {
    if (!rawErr) return t('playerNotFound');
    const lower = rawErr.toLowerCase();
    if (lower.includes('kein spieler') || lower.includes('not found') || lower.includes('ungültig') || lower.includes('invalid') || lower.includes('nicht gefunden')) {
      return t('playerNotFound');
    }
    if (lower.includes('selbst') || lower.includes('yourself') || lower.includes('self')) {
      return t('cannotAddSelf');
    }
    if (lower.includes('bereits befreundet') || lower.includes('already friends')) {
      return t('alreadyFriends');
    }
    if (lower.includes('bereits') || lower.includes('already') || lower.includes('ausstehend') || lower.includes('pending')) {
      return t('requestAlreadySent');
    }
    return rawErr;
  };

  const handleViewProfile = async () => {
    const input = friendCodeInput.trim();
    if (!input) return;
    setError('');
    setLoading(true);

    try {
      // 1. Look up in Cloudflare D1
      const profile = await fetchUserProfile(input);
      if (profile && profile.uid) {
        setIsAddFriendOpen(false);
        openFriendProfile(profile.uid);
        return;
      }

      // 2. Steam Profile fallback
      const steamProfile = await fetchSteamUserProfile(input);
      if (steamProfile && steamProfile.steamId64) {
        setIsAddFriendOpen(false);
        openFriendProfile(steamProfile.steamId64);
        return;
      }

      setError(t('playerNotFound'));
    } catch (err: any) {
      setError(err?.message ? translateError(err.message) : t('profileLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    const input = friendCodeInput.trim();
    if (!input) return;
    setError('');
    setLoading(true);

    const cleanInput = input.toUpperCase().replace(/\s+/g, '');
    const myCode = settings.friendCode?.toUpperCase().replace(/\s+/g, '') || '';
    const myUid = settings.userUid || '';

    // Guard: Prevent adding self
    if (cleanInput === myCode || cleanInput === myUid || (cleanInput.replace(/^ECL-/, '') === myCode.replace(/^ECL-/, '') && myCode)) {
      setError(t('cannotAddSelf'));
      setLoading(false);
      return;
    }

    const currentFriends = settings.eclipseFriends || [];
    if (currentFriends.some(f => f.id.toLowerCase() === input.toLowerCase() || (f.friendCode && f.friendCode.toUpperCase() === cleanInput))) {
      setError(t('alreadyFriends'));
      setLoading(false);
      return;
    }

    try {
      // 1. Instant bilateral add via Cloudflare D1 Social Network
      const addRes = await addFriendByCode(input);
      if (addRes.success) {
        setFriendCodeInput('');
        setIsAddFriendOpen(false);
        setLoading(false);
        sendAppNotification({
          title: settings.language === 'de' ? 'Freund hinzugefügt! 👥' : 'Friend Added! 👥',
          body: addRes.message || (settings.language === 'de' ? 'Freund erfolgreich hinzugefügt.' : 'Friend added successfully.'),
          type: 'success',
          duration: 5000,
        });
        return;
      }

      // 2. Fallback to Steam Web Profile lookup if valid SteamID or Custom URL
      const profile = await fetchSteamUserProfile(input);
      if (profile && profile.steamId64) {
        if (currentFriends.some(f => f.id === profile.steamId64)) {
          setError(t('alreadyFriends'));
          setLoading(false);
          return;
        }

        let status: 'online' | 'offline' | 'ingame' = 'offline';
        if (profile.onlineState === 'in-game') status = 'ingame';
        else if (profile.onlineState === 'online') status = 'online';

        const newFriend: EclipseFriend = {
          id: profile.steamId64,
          username: profile.username,
          avatarUrl: profile.avatarFull,
          status: status,
          steamProfileUrl: `https://steamcommunity.com/profiles/${profile.steamId64}`,
          level: profile.steamLevel,
          steamRecentGames: profile.steamRecentGames,
          steamFavoriteBadge: profile.steamFavoriteBadge,
        };

        updateSettings({
          eclipseFriends: [...currentFriends, newFriend],
        });

        setFriendCodeInput('');
        setIsAddFriendOpen(false);
        return;
      }

      // No valid player found — show error
      setError(translateError(addRes.error));
    } catch (err: any) {
      setError(translateError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-[#181a1f] border border-white/5 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#1b1d24]">
          <h2 className="text-base font-bold text-white">{t('addFriendTitle')}</h2>
          <button 
            onClick={() => setIsAddFriendOpen(false)}
            className="text-white/50 hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-[#111317] border border-white/5 rounded-lg p-4 flex items-center justify-between mb-8 group hover:border-white/20 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white/70">{t('yourFriendCode')}:</span>
              <span className="text-sm font-mono text-white tracking-wider font-bold">{myFriendCode}</span>
            </div>
            <button 
              onClick={handleCopy}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Copy code"
            >
              {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
            </button>
          </div>

          <div className="mb-2">
            <label className="block text-sm font-semibold text-white/70 mb-2">{t('friendCodeLabel')}</label>
            <div className="flex items-center gap-3 w-full">
              <input
                type="text"
                value={friendCodeInput}
                onChange={(e) => setFriendCodeInput(e.target.value)}
                placeholder={t('friendCodePlaceholder')}
                className="flex-[2] bg-[#111317] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-white/40 transition-colors font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
              />
              <button 
                onClick={handleAddFriend}
                disabled={loading || !friendCodeInput.trim()}
                className="flex-1 bg-white text-black font-bold px-4 py-2.5 rounded-lg text-sm hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[100px] cursor-pointer shadow-sm"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : t('add')}
              </button>
              <button 
                onClick={handleViewProfile}
                disabled={loading || !friendCodeInput.trim()}
                className="flex-1 bg-transparent border border-white/20 text-white font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-white/10 transition-colors min-w-[110px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('viewProfile')}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
            <p className="text-white/30 text-[11px] mt-6 leading-tight">
              {t('friendCodeHint')}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
