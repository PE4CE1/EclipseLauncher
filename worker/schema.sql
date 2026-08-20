-- Cloudflare D1 Database Schema for Eclipse Launcher Social Network

CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    friend_code TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    status TEXT DEFAULT 'online', -- 'online' | 'ingame' | 'offline'
    current_game TEXT DEFAULT NULL,
    level INTEGER DEFAULT 1,
    steam_level INTEGER DEFAULT 1,
    steam_profile_url TEXT DEFAULT '',
    steam_games_count INTEGER DEFAULT 0,
    steam_badges_count INTEGER DEFAULT 0,
    steam_favorite_badge TEXT DEFAULT NULL,
    steam_recent_games TEXT DEFAULT '[]', -- JSON String
    total_playtime_mins INTEGER DEFAULT 0,
    total_playtime_hours TEXT DEFAULT '0m',
    total_library_count INTEGER DEFAULT 0,
    total_installed_count INTEGER DEFAULT 0,
    top_played_games TEXT DEFAULT '[]', -- JSON String
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id),
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);

CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_uid TEXT NOT NULL,
    to_uid TEXT NOT NULL,
    from_username TEXT NOT NULL,
    from_avatar_url TEXT DEFAULT '',
    from_friend_code TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
    created_at INTEGER NOT NULL,
    FOREIGN KEY (from_uid) REFERENCES users(uid) ON DELETE CASCADE,
    FOREIGN KEY (to_uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_requests_to_uid ON friend_requests(to_uid, status);
CREATE INDEX IF NOT EXISTS idx_requests_from_uid ON friend_requests(from_uid, status);
