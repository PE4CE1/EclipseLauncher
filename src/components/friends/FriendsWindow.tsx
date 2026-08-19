import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, ChevronRight, ChevronDown, User, MoreVertical, Trash2, Check } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { 
  removeFirebaseFriend, 
  restoreFirebaseFriend, 
  acceptFriendRequest, 
  declineFriendRequest 
} from '../../services/firebaseService';

interface FriendsWindowProps {
  isStandalone?: boolean;
}

export const FriendsWindow: React.FC<FriendsWindowProps> = ({ isStandalone = false }) => {
  const { t } = useTranslation();
  const { isFriendsOpen, setIsFriendsOpen, setIsAddFriendOpen, openFriendProfile } = useUIStore();
  const { settings, updateSettings } = useGameStore();
  const [isOnlineExpanded, setIsOnlineExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isFriendsOpen) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [isFriendsOpen]);
  
  const [removedFriend, setRemovedFriend] = useState<any>(null);
  const undoTimeoutRef = useRef<any>(null);

  const handleRemoveFriend = (friendId: string) => {
    const friend = settings.eclipseFriends?.find(f => f.id === friendId);
    if (!friend) return;
    
    setRemovedFriend(friend);
    removeFirebaseFriend(friendId);

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setRemovedFriend(null);
    }, 5000);
  };

  const handleUndoRemove = () => {
    if (!removedFriend) return;
    restoreFirebaseFriend(removedFriend);
    setRemovedFriend(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    }
  }, []);

  if (!isFriendsOpen) return null;

  const friends = settings.eclipseFriends || [];
  const incomingRequests = settings.incomingFriendRequests || [];
  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const offlineFriends = friends.filter(f => f.status === 'offline');

  const filteredOnline = onlineFriends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredOffline = offlineFriends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleClose = () => {
    setIsFriendsOpen(false);
    if ((window as any).electronAPI?.closeFriendsWindow) {
      (window as any).electronAPI.closeFriendsWindow();
    }
  };

  const containerProps = isStandalone ? {
    className: "w-full h-full bg-[#0a0a0c] flex flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl",
  } : {
    drag: true,
    dragConstraints: { left: 0, right: window.innerWidth - 320, top: 0, bottom: window.innerHeight - 500 },
    dragMomentum: false,
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { type: 'spring', damping: 25, stiffness: 300 } as any,
    className: "fixed z-[100] w-[320px] h-[520px] bg-[#0a0a0c] border border-white/5 rounded-lg shadow-2xl flex flex-col overflow-hidden",
    style: { left: window.innerWidth - 360, top: 80 }
  };

  return (
    <AnimatePresence>
      {isFriendsOpen && (
        <motion.div {...(containerProps as any)}>
          {/* Header (Drag Handle across desktop screens) */}
          <div className="drag-handle flex items-center justify-between px-4 py-3 bg-[#0a0a0c] cursor-move border-b border-white/5 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
            <h3 className="text-sm font-bold text-white tracking-wide">{t('friends')}</h3>
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button className="text-white/50 hover:text-white transition-colors p-1 cursor-pointer" onClick={handleClose}>
                <X size={16} />
              </button>
            </div>
          </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-[#0a0a0c]">
        
        {/* Current User Info */}
        <div className="flex items-center gap-4 mb-5 bg-[#141518] p-3 rounded-xl border border-white/5 shadow-inner">
          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-[#2a2c33] flex-shrink-0">
            {settings.avatarUrl ? (
              <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50"><User size={20} /></div>
            )}
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#141518]"></div>
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-white text-sm uppercase tracking-wide truncate">{settings.username || 'GUEST'}</h4>
            <p className="text-[11px] text-white/50">{t('online')}</p>
          </div>
        </div>

        {/* Incoming Friend Requests Section */}
        {incomingRequests.length > 0 && (
          <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-xl p-3 shadow-sm" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>{settings.language === 'de' ? 'Freundschaftsanfragen' : 'Friend Requests'}</span>
                <span className="w-4 h-4 rounded-full bg-white text-black text-[10px] font-extrabold flex items-center justify-center">
                  {incomingRequests.length}
                </span>
              </span>
            </div>
            <div className="space-y-1.5">
              {incomingRequests.map((req) => (
                <div key={req.fromUid} className="flex items-center justify-between bg-[#111215] border border-white/5 p-2 rounded-lg gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg overflow-hidden bg-[#2a2c33] flex-shrink-0 flex items-center justify-center border border-white/10">
                      {req.fromAvatarUrl ? (
                        <img src={req.fromAvatarUrl} alt={req.fromUsername} className="w-full h-full object-cover" />
                      ) : (
                        <User size={13} className="text-white/50" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-white truncate">{req.fromUsername}</h5>
                      <p className="text-[10px] text-white/40 font-mono truncate">{req.fromFriendCode || 'Eclipse'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => acceptFriendRequest(req.fromUid)}
                      className="p-1.5 bg-white text-black hover:bg-white/90 rounded-md font-bold text-xs transition-all shadow-sm cursor-pointer"
                      title={settings.language === 'de' ? 'Annehmen' : 'Accept'}
                    >
                      <Check size={13} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => declineFriendRequest(req.fromUid)}
                      className="p-1.5 bg-white/10 text-white/60 hover:text-white hover:bg-white/20 rounded-md transition-all cursor-pointer"
                      title={settings.language === 'de' ? 'Ablehnen' : 'Decline'}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search & Add */}
        <div className="flex gap-2 mb-5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input 
              type="text" 
              placeholder={t('searchFriends')} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141518] text-white text-xs pl-9 pr-3 py-2 rounded-lg outline-none border border-white/5 focus:border-white/20 transition-colors placeholder:text-white/30"
            />
          </div>
          <button 
            onClick={() => {
              if ((window as any).electronAPI?.openAddFriendModal) {
                (window as any).electronAPI.openAddFriendModal()
              } else {
                setIsAddFriendOpen(true)
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-white/90 transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={14} /> {t('add')}
          </button>
        </div>

        {/* Online Section */}
        {isLoading ? (
          <div className="flex flex-col gap-2 mt-2">
            <div className="h-4 w-24 bg-white/5 rounded skeleton mb-2"></div>
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-10 h-10 rounded-lg bg-white/5 skeleton"></div>
                <div className="flex-1">
                  <div className="h-4 w-24 bg-white/5 rounded skeleton mb-2"></div>
                  <div className="h-3 w-16 bg-white/5 rounded skeleton"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button 
            onClick={() => setIsOnlineExpanded(!isOnlineExpanded)}
            className="flex items-center gap-1.5 w-full text-left text-[11px] font-bold text-white/50 uppercase tracking-wider hover:text-white/80 transition-colors mb-2 cursor-pointer"
          >
            {isOnlineExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('online').toUpperCase()} ({onlineFriends.length})
          </button>
          <AnimatePresence>
            {isOnlineExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-col gap-1"
              >
                {filteredOnline.length === 0 ? (
                  <p className="text-xs text-white/30 italic pl-5">
                    {settings.language === 'de' ? 'Keine Freunde online' : 'No friends online'}
                  </p>
                ) : (
                  <AnimatePresence initial={false}>
                    {filteredOnline.map(friend => (
                      <motion.div
                        key={friend.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <FriendCard 
                          friend={friend} 
                          onClick={() => {
                            if ((window as any).electronAPI?.openFriendProfileModal) {
                              (window as any).electronAPI.openFriendProfileModal(friend.id)
                            } else {
                              openFriendProfile(friend.id)
                            }
                          }} 
                          onRemove={() => handleRemoveFriend(friend.id)}
                          t={t} 
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Offline Section */}
        {filteredOffline.length > 0 && (
          <div style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="flex items-center gap-1.5 w-full text-left text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2 pl-1 mt-4">
              {t('offline').toUpperCase()} ({offlineFriends.length})
            </div>
            <div className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {filteredOffline.map(friend => (
                  <motion.div
                    key={friend.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <FriendCard 
                      friend={friend} 
                      onClick={() => {
                        if ((window as any).electronAPI?.openFriendProfileModal) {
                          (window as any).electronAPI.openFriendProfileModal(friend.id)
                        } else {
                          openFriendProfile(friend.id)
                        }
                      }} 
                      onRemove={() => handleRemoveFriend(friend.id)}
                      t={t} 
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
        </>
        )}
        </div>
        
        {/* Minimalist White Undo Toast */}
        <AnimatePresence>
          {removedFriend && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute bottom-3 left-3 right-3 bg-[#111215]/95 backdrop-blur-xl border border-white/15 rounded-xl px-3.5 py-2.5 flex items-center justify-between shadow-2xl z-50 select-none"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Trash2 size={14} className="text-white/40 flex-shrink-0" />
                <span className="text-xs text-white/80 truncate">
                  {settings.language === 'de' ? 'Entfernt:' : 'Removed:'} <b className="text-white font-semibold">{removedFriend.username}</b>
                </span>
              </div>
              <button 
                onClick={handleUndoRemove}
                className="text-[11px] font-bold text-black bg-white hover:bg-white/90 uppercase tracking-wider px-2.5 py-1 rounded-md transition-all shadow-sm flex-shrink-0 cursor-pointer"
              >
                {settings.language === 'de' ? 'Rückgängig' : 'Undo'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const FriendCard = ({ friend, onClick, onRemove, t }: { friend: any, onClick: () => void, onRemove: () => void, t: any }) => {
  const isOnline = friend.status !== 'offline';
  const color = friend.status === 'ingame' ? 'bg-purple-500' : isOnline ? 'bg-green-500' : 'bg-gray-500';
  
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const getStatusText = () => {
    if (friend.status === 'ingame') {
      return friend.currentGame ? `Playing ${friend.currentGame}` : 'In-Game';
    }
    if (friend.status === 'online') return t('online');
    return t('offline');
  };

  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
    >
      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-[#2a2c33]">
        {friend.avatarUrl ? (
           <img src={friend.avatarUrl} alt={friend.username} className="w-full h-full object-cover" />
        ) : (
           <div className="w-full h-full flex items-center justify-center text-white/50"><User size={16}/></div>
        )}
        <div className={`absolute bottom-0.5 right-0.5 w-2.5 h-2.5 ${color} rounded-full border-2 border-[#141518]`}></div>
      </div>
      <div className="flex-1 overflow-hidden">
        <h5 className={`text-[15px] font-bold truncate tracking-wide ${isOnline ? 'text-white' : 'text-white/50'}`}>{friend.username}</h5>
        <p className={`text-xs truncate ${friend.status === 'ingame' ? 'text-purple-400 font-medium' : isOnline ? 'text-green-400' : 'text-white/30'}`}>
          {getStatusText()}
        </p>
      </div>
      
      <div className="relative" ref={menuRef}>
        <button 
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className={`p-1.5 rounded-md hover:bg-white/10 transition-colors ${showMenu ? 'bg-white/10 text-white' : 'text-white/30 opacity-0 group-hover:opacity-100 group-hover:text-white/50 hover:!text-white'}`}
        >
          <MoreVertical size={16} />
        </button>
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, transformOrigin: 'top right' }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-full mt-1 w-36 bg-[#1b1c20] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50"
            >
              <button 
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRemove(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors text-left font-medium"
              >
                <Trash2 size={14} /> Remove
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
