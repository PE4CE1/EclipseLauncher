import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, ChevronRight, ChevronDown, User, MoreVertical, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';

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
      const timer = setTimeout(() => setIsLoading(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isFriendsOpen]);
  
  const [removedFriend, setRemovedFriend] = useState<any>(null);
  const undoTimeoutRef = useRef<any>(null);

  const handleRemoveFriend = (friendId: string) => {
    const friend = settings.eclipseFriends?.find(f => f.id === friendId);
    if (!friend) return;
    
    setRemovedFriend(friend);
    updateSettings({
      eclipseFriends: settings.eclipseFriends?.filter(f => f.id !== friendId)
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setRemovedFriend(null);
    }, 5000);
  };

  const handleUndoRemove = () => {
    if (!removedFriend) return;
    const currentFriends = settings.eclipseFriends || [];
    updateSettings({
      eclipseFriends: [...currentFriends, removedFriend]
    });
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
  const onlineFriends = friends.filter(f => f.status !== 'offline');
  const offlineFriends = friends.filter(f => f.status === 'offline');

  const filteredOnline = onlineFriends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredOffline = offlineFriends.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleClose = () => {
    setIsFriendsOpen(false);
    if (isStandalone && (window as any).electronAPI) {
      (window as any).electronAPI.closeFriendsWindow();
    }
  };

  const containerProps = isStandalone ? {
    className: "w-full h-full bg-[#0a0a0c] flex flex-col overflow-hidden rounded-xl border border-white/5",
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
          {/* Header (Drag Handle) */}
          <div className="drag-handle flex items-center justify-between px-4 py-3 bg-[#0a0a0c] cursor-move border-b border-white/5" style={{ WebkitAppRegion: 'drag' } as any}>
            <h3 className="text-sm font-bold text-white tracking-wide">{t('friends')}</h3>
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button className="text-white/50 hover:text-white transition-colors p-1" onClick={handleClose}>
                <X size={16} />
              </button>
            </div>
          </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-[#0a0a0c]">
        
        {/* Current User Info */}
        <div className="flex items-center gap-4 mb-6 bg-[#1f2025] p-3 rounded-xl border border-white/5 shadow-inner">
          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-[#2a2c33]">
            {settings.avatarUrl ? (
              <img src={settings.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50"><User size={20} /></div>
            )}
            <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1f2025]"></div>
          </div>
          <div>
            <h4 className="font-bold text-white text-[15px] uppercase tracking-wide">{settings.username || 'GUEST'}</h4>
            <p className="text-xs text-white/50">{t('online')}</p>
          </div>
        </div>

        {/* Search & Add */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input 
              type="text" 
              placeholder={t('searchFriends')} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1b1c20] text-white text-sm pl-9 pr-3 py-2 rounded-lg outline-none border border-white/5 focus:border-white/20 transition-colors placeholder:text-white/30"
            />
          </div>
          <button 
            onClick={() => {
              if (isStandalone && (window as any).electronAPI) {
                (window as any).electronAPI.openAddFriendModal()
              } else {
                setIsAddFriendOpen(true)
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold hover:bg-white/90 transition-colors shadow-md"
          >
            <Plus size={16} /> {t('add')}
          </button>
        </div>

        {/* Online Section */}
        {isLoading ? (
          <div className="flex flex-col gap-2 mt-4">
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
            <div className="mb-4">
          <button 
            onClick={() => setIsOnlineExpanded(!isOnlineExpanded)}
            className="flex items-center gap-1.5 w-full text-left text-[11px] font-bold text-white/50 uppercase tracking-wider hover:text-white/80 transition-colors mb-2"
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
                  <p className="text-xs text-white/30 italic pl-5">No friends online</p>
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
                            if (isStandalone && (window as any).electronAPI) {
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
          <div>
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
                        if (isStandalone && (window as any).electronAPI) {
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
        
        {/* Undo Toast */}
        <AnimatePresence>
          {removedFriend && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="absolute bottom-4 left-4 right-4 bg-[#1f2025] border border-white/10 rounded-xl p-3 flex items-center justify-between shadow-2xl z-50"
            >
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-white/50" />
                <span className="text-sm text-white/80">Removed <b>{removedFriend.username}</b></span>
              </div>
              <button 
                onClick={handleUndoRemove}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wide px-3 py-1.5 bg-indigo-500/10 rounded-lg transition-colors"
              >
                Undo
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
    if (friend.status === 'ingame') return 'In-Game';
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
