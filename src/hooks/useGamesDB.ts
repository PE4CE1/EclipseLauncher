import { useState, useEffect } from 'react';
import { getTopLiveCCU } from '../services/steamService';

export interface GameDBEntry {
  id: number;
  name: string;
  developer: string;
  publisher: string;
  positive: number;
  negative: number;
  price: string;
  initialprice: string;
  discount: string;
  ccu: number;
  year?: number;
}

function appidToYear(appid: number): number {
  if (appid < 10000) return 2004;
  if (appid < 100000) return 2010;
  if (appid < 300000) return 2014;
  if (appid < 500000) return 2016;
  if (appid < 800000) return 2018;
  if (appid < 1000000) return 2019;
  if (appid < 1300000) return 2020;
  if (appid < 1500000) return 2021;
  if (appid < 1800000) return 2022;
  if (appid < 2200000) return 2023;
  if (appid < 2600000) return 2024;
  if (appid < 3000000) return 2025;
  return 2026;
}

let cachedDB: GameDBEntry[] | null = null;
let cachedDevs: string[] = [];
let cachedPubs: string[] = [];
let dbPromise: Promise<{ db: GameDBEntry[]; devs: string[]; pubs: string[] }> | null = null;

export function useGamesDB() {
  const [db, setDb] = useState<GameDBEntry[]>(cachedDB || []);
  const [devs, setDevs] = useState<string[]>(cachedDevs);
  const [pubs, setPubs] = useState<string[]>(cachedPubs);
  const [isLoading, setIsLoading] = useState(!cachedDB);

  useEffect(() => {
    if (cachedDB) return;
    if (!dbPromise) {
      dbPromise = Promise.all([
        fetch('./games_db.json').then(res => res.json()),
        getTopLiveCCU()
      ])
        .then(([data, liveCCU]) => {
          const seen = new Set<number>();
          const devSet = new Set<string>();
          const pubSet = new Set<string>();

          const uniqueData: GameDBEntry[] = [];
          for (let i = 0; i < data.length; i++) {
            const g = data[i];
            if (seen.has(g.id)) continue;
            seen.add(g.id);

            const entry: GameDBEntry = {
              ...g,
              year: appidToYear(g.id),
              ccu: liveCCU[g.id] !== undefined ? liveCCU[g.id] : g.ccu
            };
            uniqueData.push(entry);

            if (g.developer) {
              const dParts = g.developer.split(',');
              for (let j = 0; j < dParts.length; j++) {
                const trimmed = dParts[j].trim();
                if (trimmed) devSet.add(trimmed);
              }
            }
            if (g.publisher) {
              const pParts = g.publisher.split(',');
              for (let j = 0; j < pParts.length; j++) {
                const trimmed = pParts[j].trim();
                if (trimmed) pubSet.add(trimmed);
              }
            }
          }

          if (!seen.has(999001)) {
            uniqueData.unshift({
              id: 999001,
              name: 'Roblox',
              developer: 'Roblox Corporation',
              publisher: 'Roblox Corporation',
              positive: 4500000,
              negative: 250000,
              price: '0',
              initialprice: '0',
              discount: '0',
              ccu: 2841920,
              year: 2006,
            })
            devSet.add('Roblox Corporation')
            pubSet.add('Roblox Corporation')
          }

          cachedDB = uniqueData;
          cachedDevs = Array.from(devSet).sort();
          cachedPubs = Array.from(pubSet).sort();

          return { db: cachedDB, devs: cachedDevs, pubs: cachedPubs };
        })
        .catch(err => {
          console.error("Failed to load games DB:", err);
          return { db: [], devs: [], pubs: [] };
        });
    }
    
    if (dbPromise) {
      dbPromise.then(res => {
        if (res.db) setDb(res.db);
        if (res.devs) setDevs(res.devs);
        if (res.pubs) setPubs(res.pubs);
        setIsLoading(false);
      });
    }
  }, []);

  return { db, devs, pubs, isLoading };
}
