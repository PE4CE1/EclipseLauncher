import { normalizeGameName } from './gameDeduplication'
import { useSourceStore } from '../store/sourceStore'
import type { HydraDownload } from '../types/source'
import { LruCache } from './lruCache'
import { registerMemoryResource } from './memoryResources'

export interface MatchedDownload extends HydraDownload {
  sourceName: string;
  sourceUrl: string;
}

/**
 * Strips special characters and spaces for robust substring matching.
 */
function normalizeString(str: string): string {
  return normalizeGameName(str);
}

// Caching structure
let lastSourcesRef: any = null;
const sourceTitlesByName = new Map<string, string[]>();
let indexedDownloads: { title: string; download: HydraDownload; sourceName: string; sourceUrl: string }[] = [];
const gameSourceCache = new LruCache<string, Record<string, boolean>>(4096);
const downloadResultsCache = new LruCache<string, MatchedDownload[]>(64);

export function releaseDownloadLookupCache(includeIndex = true): void {
  gameSourceCache.clear(); downloadResultsCache.clear();
  if (!includeIndex) return;
  indexedDownloads = []; sourceTitlesByName.clear(); lastSourcesRef = null;
}
registerMemoryResource('download-lookups', context => releaseDownloadLookupCache(!context.catalogueActive))

function ensureIndex() {
  const sources = useSourceStore.getState().sources;
  if (lastSourcesRef === sources) return;
  
  sourceTitlesByName.clear();
  indexedDownloads = [];
  gameSourceCache.clear();
  downloadResultsCache.clear();
  
  for (const source of sources) {
    if (!source.data || source.data.length === 0) continue;
    const titles = sourceTitlesByName.get(source.name) || [];
    for (const download of source.data) {
      if (!download || typeof download.title !== 'string') continue;
      const title = normalizeString(download.title);
      if (!title) continue;
      titles.push(title);
      indexedDownloads.push({ title, download, sourceName: source.name, sourceUrl: source.url });
    }
    sourceTitlesByName.set(source.name, titles);
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
  if (!normalizedGameName) return false;
  
  let gameCache = gameSourceCache.get(normalizedGameName);
  if (!gameCache) {
    gameCache = Object.create(null) as Record<string, boolean>;
    gameSourceCache.set(normalizedGameName, gameCache);
  }
  
  if (gameCache[sourceName] !== undefined) {
    return gameCache[sourceName];
  }
  
  const titles = sourceTitlesByName.get(sourceName);
  if (!titles || titles.length === 0) {
    gameCache[sourceName] = false;
    return false;
  }
  
  const isMatch = titles.some(t => t.includes(normalizedGameName));
  gameCache[sourceName] = isMatch;
  return isMatch;
}

/**
 * Searches across all currently loaded sources in the Zustand store
 * to find any downloads whose title contains the requested game name.
 */
export function getDownloadsForGame(gameName: string): MatchedDownload[] {
  if (!gameName) return [];
  ensureIndex();
  
  const normalizedGameName = normalizeString(gameName);
  if (!normalizedGameName) return [];
  const cached = downloadResultsCache.get(normalizedGameName);
  if (cached) return cached;

  const matches = indexedDownloads
    .filter(entry => entry.title.includes(normalizedGameName))
    .map(entry => ({ ...entry.download, sourceName: entry.sourceName, sourceUrl: entry.sourceUrl }));

  downloadResultsCache.set(normalizedGameName, matches);
  return matches;
}
