import { useSourceStore } from '../store/sourceStore'
import type { HydraDownload } from '../types/source'

export interface MatchedDownload extends HydraDownload {
  sourceName: string;
  sourceUrl: string;
}

/**
 * Strips special characters and spaces for robust substring matching.
 */
function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Caching structure
let lastSourcesRef: any = null;
let downloadGiantStringBySource: Record<string, string> = {};
let gameSourceCache = new Map<string, Record<string, boolean>>();

function ensureIndex() {
  const sources = useSourceStore.getState().sources;
  if (lastSourcesRef === sources) return;
  
  downloadGiantStringBySource = {};
  gameSourceCache.clear();
  
  for (const source of sources) {
    if (!source.data || source.data.length === 0) continue;
    downloadGiantStringBySource[source.name] = source.data
      .map(dl => dl.title ? normalizeString(dl.title) : '')
      .filter(Boolean)
      .join('|||');
  }
  lastSourcesRef = sources;
}

/**
 * Super fast cached lookup to check if a game is available in a specific source.
 */
export function hasGameInSource(gameName: string, sourceName: string): boolean {
  if (!gameName) return false;
  ensureIndex();
  
  const normalizedGameName = normalizeString(gameName);
  
  let gameCache = gameSourceCache.get(normalizedGameName);
  if (!gameCache) {
    gameCache = {};
    gameSourceCache.set(normalizedGameName, gameCache);
  }
  
  if (gameCache[sourceName] !== undefined) {
    return gameCache[sourceName];
  }
  
  const giantString = downloadGiantStringBySource[sourceName];
  if (!giantString) {
    gameCache[sourceName] = false;
    return false;
  }
  
  const isMatch = giantString.includes(normalizedGameName);
  gameCache[sourceName] = isMatch;
  return isMatch;
}

/**
 * Searches across all currently loaded sources in the Zustand store
 * to find any downloads whose title contains the requested game name.
 */
export function getDownloadsForGame(gameName: string): MatchedDownload[] {
  if (!gameName) return [];
  
  const sources = useSourceStore.getState().sources;
  const normalizedGameName = normalizeString(gameName);
  
  const matches: MatchedDownload[] = [];

  for (const source of sources) {
    if (!source.data || source.data.length === 0) continue;

    for (const dl of source.data) {
      if (!dl.title) continue;
      
      const normalizedTitle = normalizeString(dl.title);
      
      // Simple inclusion match. 
      // e.g. "cyberpunk2077" is inside "cyberpunk2077v16alldlcs"
      if (normalizedTitle.includes(normalizedGameName)) {
        matches.push({
          ...dl,
          sourceName: source.name,
          sourceUrl: source.url
        });
      }
    }
  }

  // Sort matches so that exact prefixes might appear first, or sort by file size, etc.
  // We'll leave it in the order they were found (grouped by source)
  return matches;
}
