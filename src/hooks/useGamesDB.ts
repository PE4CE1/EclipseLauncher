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
let dbPromise: Promise<GameDBEntry[]> | null = null;

export function useGamesDB() {
  const [db, setDb] = useState<GameDBEntry[]>(cachedDB || []);
  const [isLoading, setIsLoading] = useState(!cachedDB);

  useEffect(() => {
    if (cachedDB) return;
    if (!dbPromise) {
      dbPromise = Promise.all([
        fetch('./games_db.json').then(res => res.json()),
        getTopLiveCCU()
      ])
        .then(([data, liveCCU]) => {
          // Remove exact duplicates by ID which cause React key collisions and sorting bugs
          const seen = new Set<number>();
          const uniqueData = data.filter((g: any) => {
            if (seen.has(g.id)) return false;
            seen.add(g.id);
            return true;
          });
          // Add synthetic year and LIVE CCU overrides for top 100
          cachedDB = uniqueData.map((g: any) => ({ 
            ...g, 
            year: appidToYear(g.id),
            ccu: liveCCU[g.id] !== undefined ? liveCCU[g.id] : g.ccu
          }));
          return cachedDB as GameDBEntry[];
        })
        .catch(err => {
          console.error("Failed to load games DB:", err);
          return [];
        });
    }
    
    if (dbPromise) {
      dbPromise.then(data => {
        if (data) setDb(data);
        setIsLoading(false);
      });
    }
  }, []);

  return { db, isLoading };
}
