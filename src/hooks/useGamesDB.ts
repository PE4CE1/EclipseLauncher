import { desktopFetch as fetch } from '../services/httpClient'
import { useState, useEffect } from 'react';
import { getTopLiveCCU } from '../services/steamService';
import { loadGameDatabase, peekGameDatabase, retainGameDatabase, type GameDBEntry } from '../services/gameDatabaseCache';
export type { GameDBEntry } from '../services/gameDatabaseCache';

export function useGamesDB() {
  const cached = peekGameDatabase();
  const [db, setDb] = useState<GameDBEntry[]>(cached?.db || []);
  const [devs, setDevs] = useState<string[]>(cached?.devs || []);
  const [pubs, setPubs] = useState<string[]>(cached?.pubs || []);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    const release = retainGameDatabase();
    void loadGameDatabase(() => Promise.all([
        fetch('./games_db.json').then(res => {
          if (!res.ok) throw new Error(`Game database HTTP ${res.status}`);
          return res.json();
        }),
        getTopLiveCCU().catch(() => ({} as Record<number, number>))
      ])
        .then(([data, liveCCU]) => {
          if (!Array.isArray(data)) throw new Error('Invalid game database');
          const seen = new Set<number>();
          const devSet = new Set<string>();
          const pubSet = new Set<string>();

          const uniqueData: GameDBEntry[] = [];
          for (let i = 0; i < data.length; i++) {
            const g = data[i];
            if (!g || !Number.isSafeInteger(g.id) || typeof g.name !== 'string' || seen.has(g.id)) continue;
            if (g.id === 999001 || g.name?.toLowerCase().includes('roblox')) continue;
            seen.add(g.id);

            if (!Number.isInteger(g.year)) delete g.year;
            if (liveCCU[g.id] !== undefined) {
              g.ccu = liveCCU[g.id];
            }
            uniqueData.push(g);

            if (typeof g.developer === 'string' && g.developer) {
              const dParts = g.developer.split(',');
              for (let j = 0; j < dParts.length; j++) {
                const trimmed = dParts[j].trim();
                if (trimmed) devSet.add(trimmed);
              }
            }
            if (typeof g.publisher === 'string' && g.publisher) {
              const pParts = g.publisher.split(',');
              for (let j = 0; j < pParts.length; j++) {
                const trimmed = pParts[j].trim();
                if (trimmed) pubSet.add(trimmed);
              }
            }
          }

          return { db: uniqueData, devs: Array.from(devSet).sort(), pubs: Array.from(pubSet).sort() };
        })).then(res => {
        if (cancelled) return;
        if (res.db) setDb(res.db);
        if (res.devs) setDevs(res.devs);
        if (res.pubs) setPubs(res.pubs);
        setIsLoading(false);
      }).catch(err => {
        if (!cancelled) { console.error('Failed to load games DB:', err); setIsLoading(false); }
      });
    return () => { cancelled = true; release(); };
  }, []);

  return { db, devs, pubs, isLoading };
}
