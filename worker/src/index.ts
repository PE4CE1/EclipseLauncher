/**
 * Cloudflare Worker API for Eclipse Launcher Social Network
 * Powered by Cloudflare D1 (Serverless SQLite at the Edge)
 */

export interface Env {
  DB: D1Database;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-UID',
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function error(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 1. Health check
      if (pathname === '/' || pathname === '/api/health') {
        return json({ success: true, message: 'Eclipse Social API is running on Cloudflare D1' });
      }

      // 2. Profile Sync: POST /api/user/sync
      if (pathname === '/api/user/sync' && request.method === 'POST') {
        const body: any = await request.json();
        const {
          uid,
          friendCode,
          username,
          avatarUrl = '',
          status = 'online',
          currentGame = null,
          level = 1,
          steamLevel = 1,
          steamProfileUrl = '',
          steamGamesCount = 0,
          steamBadgesCount = 0,
          steamFavoriteBadge = null,
          steamRecentGames = [],
          totalPlaytimeMins = 0,
          totalPlaytimeHours = '0m',
          totalLibraryCount = 0,
          totalInstalledCount = 0,
          topPlayedGames = [],
        } = body;

        if (!uid || !friendCode || !username) {
          return error('Missing required user fields (uid, friendCode, username)');
        }

        const now = Date.now();
        const cleanCode = friendCode.toUpperCase().trim();

        // Clear any collision on friend_code from other uids to avoid UNIQUE constraint errors
        await env.DB.prepare(
          'DELETE FROM users WHERE friend_code = ? AND uid != ?'
        ).bind(cleanCode, uid).run();

        await env.DB.prepare(`
          INSERT INTO users (
            uid, friend_code, username, avatar_url, status, current_game,
            level, steam_level, steam_profile_url, steam_games_count,
            steam_badges_count, steam_favorite_badge, steam_recent_games,
            total_playtime_mins, total_playtime_hours, total_library_count,
            total_installed_count, top_played_games, last_seen, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(uid) DO UPDATE SET
            friend_code = excluded.friend_code,
            username = excluded.username,
            avatar_url = excluded.avatar_url,
            status = excluded.status,
            current_game = excluded.current_game,
            level = excluded.level,
            steam_level = excluded.steam_level,
            steam_profile_url = excluded.steam_profile_url,
            steam_games_count = excluded.steam_games_count,
            steam_badges_count = excluded.steam_badges_count,
            steam_favorite_badge = excluded.steam_favorite_badge,
            steam_recent_games = excluded.steam_recent_games,
            total_playtime_mins = excluded.total_playtime_mins,
            total_playtime_hours = excluded.total_playtime_hours,
            total_library_count = excluded.total_library_count,
            total_installed_count = excluded.total_installed_count,
            top_played_games = excluded.top_played_games,
            last_seen = excluded.last_seen
        `).bind(
          uid,
          cleanCode,
          username,
          avatarUrl,
          status,
          currentGame,
          level,
          steamLevel,
          steamProfileUrl,
          steamGamesCount,
          steamBadgesCount,
          steamFavoriteBadge,
          JSON.stringify(steamRecentGames),
          totalPlaytimeMins,
          totalPlaytimeHours,
          totalLibraryCount,
          totalInstalledCount,
          JSON.stringify(topPlayedGames),
          now,
          now
        ).run();

        return json({ success: true, timestamp: now });
      }

      // 3. User Lookup by UID or Friend Code: GET /api/user/:uidOrCode
      if (pathname.startsWith('/api/user/') && request.method === 'GET') {
        const rawParam = pathname.replace('/api/user/', '').trim();
        if (!rawParam) return error('Missing parameter');

        const cleanParam = decodeURIComponent(rawParam).trim();
        const upper = cleanParam.toUpperCase();
        const withPrefix = upper.startsWith('ECL-') ? upper : `ECL-${upper}`;
        const withoutPrefix = upper.replace(/^ECL-/, '');

        const userRow = await env.DB.prepare(
          'SELECT * FROM users WHERE uid = ? OR friend_code = ? OR friend_code = ? OR friend_code = ?'
        ).bind(cleanParam, upper, withPrefix, withoutPrefix).first();

        if (!userRow) {
          return json({ success: false, user: null }, 404);
        }

        return json({
          success: true,
          user: formatUserRow(userRow),
        });
      }

      // 4. Live Presence Heartbeat: POST /api/user/heartbeat
      if (pathname === '/api/user/heartbeat' && request.method === 'POST') {
        const body: any = await request.json();
        const { uid, status = 'online', currentGame = null } = body;
        if (!uid) return error('Missing uid');

        const now = Date.now();
        await env.DB.prepare(
          'UPDATE users SET status = ?, current_game = ?, last_seen = ? WHERE uid = ?'
        ).bind(status, currentGame, now, uid).run();

        return json({ success: true, lastSeen: now });
      }

      // 5. Send Friend Request: POST /api/friends/request
      if (pathname === '/api/friends/request' && request.method === 'POST') {
        const body: any = await request.json();
        const { fromUid, toCodeOrUid } = body;
        if (!fromUid || !toCodeOrUid) return error('Missing fromUid or toCodeOrUid');

        const cleanTarget = toCodeOrUid.trim();
        const upperTarget = cleanTarget.toUpperCase();
        const withPrefix = upperTarget.startsWith('ECL-') ? upperTarget : `ECL-${upperTarget}`;
        const withoutPrefix = upperTarget.replace(/^ECL-/, '');

        // Find target user
        let targetUser = await env.DB.prepare(
          'SELECT * FROM users WHERE uid = ? OR friend_code = ? OR friend_code = ? OR friend_code = ?'
        ).bind(cleanTarget, upperTarget, withPrefix, withoutPrefix).first();

        if (!targetUser) {
          return error('Kein Spieler mit diesem Code gefunden.');
        }

        const toUid = targetUser.uid as string;
        if (toUid === fromUid) {
          return error('Du kannst dir nicht selbst eine Freundschaftsanfrage senden.');
        }

        // Check if already confirmed friends
        const existingFriendship = await env.DB.prepare(
          'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?'
        ).bind(fromUid, toUid).first();

        if (existingFriendship) {
          return error(`${targetUser.username || 'Dieser Spieler'} ist bereits in deiner Freundesliste!`);
        }

        // Check if target already sent a request to me -> auto-accept bilateral friendship!
        const existingIncoming = await env.DB.prepare(
          "SELECT * FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'"
        ).bind(toUid, fromUid).first();

        if (existingIncoming) {
          const now = Date.now();
          // Create bilateral friendship
          await env.DB.batch([
            env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(fromUid, toUid, now),
            env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(toUid, fromUid, now),
            env.DB.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").bind(existingIncoming.id),
          ]);
          return json({ success: true, autoAccepted: true, message: `Ihr seid jetzt befreundet!` });
        }

        // Check if already requested
        const alreadyRequested = await env.DB.prepare(
          "SELECT 1 FROM friend_requests WHERE from_uid = ? AND to_uid = ? AND status = 'pending'"
        ).bind(fromUid, toUid).first();

        if (alreadyRequested) {
          return error('Freundschaftsanfrage wurde bereits gesendet. Bitte warten.');
        }

        // Fetch requester profile for request payload
        const requester = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(fromUid).first();
        const fromUsername = (requester?.username as string) || 'Eclipse Player';
        const fromAvatarUrl = (requester?.avatar_url as string) || '';
        const fromFriendCode = (requester?.friend_code as string) || '';

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();

        await env.DB.prepare(`
          INSERT INTO friend_requests (id, from_uid, to_uid, from_username, from_avatar_url, from_friend_code, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(requestId, fromUid, toUid, fromUsername, fromAvatarUrl, fromFriendCode, now).run();

        return json({
          success: true,
          message: `Freundschaftsanfrage an ${targetUser.username || 'Spieler'} gesendet!`,
        });
      }

      // 6. Accept Friend Request: POST /api/friends/accept
      if (pathname === '/api/friends/accept' && request.method === 'POST') {
        const body: any = await request.json();
        const { myUid, fromUid } = body;
        if (!myUid || !fromUid) return error('Missing myUid or fromUid');

        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(myUid, fromUid, now),
          env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(fromUid, myUid, now),
          env.DB.prepare("UPDATE friend_requests SET status = 'accepted' WHERE from_uid = ? AND to_uid = ?").bind(fromUid, myUid),
        ]);

        return json({ success: true });
      }

      // 7. Decline Friend Request: POST /api/friends/decline
      if (pathname === '/api/friends/decline' && request.method === 'POST') {
        const body: any = await request.json();
        const { myUid, fromUid } = body;
        if (!myUid || !fromUid) return error('Missing myUid or fromUid');

        await env.DB.prepare(
          "UPDATE friend_requests SET status = 'declined' WHERE from_uid = ? AND to_uid = ?"
        ).bind(fromUid, myUid).run();

        return json({ success: true });
      }

      // 8. Remove Friend (Bilateral): DELETE /api/friends/:friendId?uid=...
      if (pathname.startsWith('/api/friends/') && request.method === 'DELETE') {
        const friendId = pathname.replace('/api/friends/', '').trim();
        const myUid = url.searchParams.get('uid');
        if (!myUid || !friendId) return error('Missing myUid or friendId');

        await env.DB.batch([
          env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(myUid, friendId),
          env.DB.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').bind(friendId, myUid),
        ]);

        return json({ success: true });
      }

      // 9. Poll Friends & Requests: GET /api/friends/poll?uid=...
      if (pathname === '/api/friends/poll' && request.method === 'GET') {
        const uid = url.searchParams.get('uid');
        if (!uid) return error('Missing uid parameter');

        const now = Date.now();

        // Query confirmed friends
        const friendsResult = await env.DB.prepare(`
          SELECT u.*
          FROM friends f
          JOIN users u ON f.friend_id = u.uid
          WHERE f.user_id = ?
        `).bind(uid).all();

        const formattedFriends = (friendsResult.results || []).map((row: any) => {
          const lastSeen = Number(row.last_seen) || 0;
          const isTimedOut = !lastSeen || (now - lastSeen > 60 * 1000);
          let status = isTimedOut ? 'offline' : (row.status || 'offline');
          const currentGame = (status === 'ingame' && row.current_game) ? row.current_game : undefined;

          return {
            id: row.uid,
            username: row.username || 'Eclipse Player',
            avatarUrl: row.avatar_url || '',
            status,
            currentGame,
            level: row.steam_level || row.level || 1,
            steamLevel: row.steam_level || row.level || 1,
            steamProfileUrl: row.steam_profile_url || undefined,
            steamGamesCount: row.steam_games_count || 0,
            steamBadgesCount: row.steam_badges_count || 0,
            steamFavoriteBadge: row.steam_favorite_badge || undefined,
            steamRecentGames: safeJsonParse(row.steam_recent_games, []),
            totalPlaytimeMins: row.total_playtime_mins || 0,
            totalPlaytimeHours: row.total_playtime_hours || '0m',
            totalLibraryCount: row.total_library_count || 0,
            totalInstalledCount: row.total_installed_count || 0,
            topPlayedGames: safeJsonParse(row.top_played_games, []),
            lastSeen,
          };
        });

        // Query incoming pending requests
        const incomingResult = await env.DB.prepare(`
          SELECT * FROM friend_requests
          WHERE to_uid = ? AND status = 'pending'
          ORDER BY created_at DESC
        `).bind(uid).all();

        const incomingRequests = (incomingResult.results || []).map((row: any) => ({
          fromUid: row.from_uid,
          fromUsername: row.from_username,
          fromAvatarUrl: row.from_avatar_url,
          fromFriendCode: row.from_friend_code,
          timestamp: Number(row.created_at) || Date.now(),
        }));

        // Query outgoing pending requests
        const outgoingResult = await env.DB.prepare(`
          SELECT r.*, u.username as to_username, u.avatar_url as to_avatar_url, u.friend_code as to_friend_code
          FROM friend_requests r
          LEFT JOIN users u ON r.to_uid = u.uid
          WHERE r.from_uid = ? AND r.status = 'pending'
          ORDER BY r.created_at DESC
        `).bind(uid).all();

        const outgoingRequests = (outgoingResult.results || []).map((row: any) => ({
          toUid: row.to_uid,
          toUsername: row.to_username || 'Eclipse Player',
          toAvatarUrl: row.to_avatar_url || '',
          toFriendCode: row.to_friend_code || '',
          timestamp: Number(row.created_at) || Date.now(),
        }));

        return json({
          success: true,
          friends: formattedFriends,
          incomingRequests,
          outgoingRequests,
        });
      }

      return error('Endpoint not found', 404);
    } catch (err: any) {
      console.error('[Worker Error]', err);
      return error(err.message || 'Internal Server Error', 500);
    }
  },
};

function formatUserRow(row: any) {
  return {
    uid: row.uid,
    friendCode: row.friend_code,
    username: row.username,
    avatarUrl: row.avatar_url,
    status: row.status,
    currentGame: row.current_game,
    level: row.level,
    steamLevel: row.steam_level,
    steamProfileUrl: row.steam_profile_url,
    steamGamesCount: row.steam_games_count,
    steamBadgesCount: row.steam_badges_count,
    steamFavoriteBadge: row.steam_favorite_badge,
    steamRecentGames: safeJsonParse(row.steam_recent_games, []),
    totalPlaytimeMins: row.total_playtime_mins,
    totalPlaytimeHours: row.total_playtime_hours,
    totalLibraryCount: row.total_library_count,
    totalInstalledCount: row.total_installed_count,
    topPlayedGames: safeJsonParse(row.top_played_games, []),
    lastSeen: Number(row.last_seen),
    createdAt: Number(row.created_at),
  };
}

function safeJsonParse(val: any, fallback: any) {
  if (!val || typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}
