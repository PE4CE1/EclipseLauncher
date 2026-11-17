import { pauseTorrentTransfer, resumeTorrentTransfer } from './torrentTransferControl'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { extractArchive, findMainGameExecutable } from './extractService'
import { containedDownloadPath, safeDownloadName } from './downloadPaths'

let client: any = null;
let clientPromise: Promise<any> | null = null;
let stopping = false;

const TOP_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.moeking.me:6969/announce',
  'https://tracker.tamersunion.org:443/announce',
  'https://tracker.foreverpirates.co:443/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev'
]

async function getClient() {
  if (stopping) throw new Error('Torrent service is shutting down');
  if (client) return client;
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    try {
      // Use dynamic Function import to prevent CommonJS bundling collisions
      const importDynamic = new Function('modulePath', 'return import(modulePath)');
      const webtorrentModule = await importDynamic('webtorrent');
      if (stopping) throw new Error('Torrent service is shutting down');
      const WebTorrent = webtorrentModule.default || webtorrentModule;
      
      client = new WebTorrent({
        dht: true,
        tracker: {
          announce: TOP_TRACKERS
        }
      });

      client.on('error', (err: any) => {
        console.error('[WebTorrent] Global Client Error:', err);
      });
    } catch (e) {
      console.error('[WebTorrent] Failed to instantiate WebTorrent client:', e);
      throw e;
    }
    return client;
  })().finally(() => { clientPromise = null; });
  return clientPromise;
}

// Default to standard Windows Downloads folder
function getDefaultDownloadPath(): string {
  try {
    return app.getPath('downloads') || path.join(app.getPath('home'), 'Downloads')
  } catch {
    return path.join(app.getPath('userData'), 'Downloads')
  }
}

export type TorrentPayload = {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  timeRemaining: number
  downloaded: number
  length: number
  status: 'downloading' | 'paused' | 'done' | 'extracting' | 'error'
  peers?: number
  mainExe?: string | null
  installPath?: string
  errorMessage?: string
}

const activeIntervals = new Map<string, NodeJS.Timeout>();
export const hasTorrentDownloadWork = () => activeIntervals.size > 0
const trackedTorrents = new WeakSet<object>();
const activeExtractions = new WeakMap<object, AbortController>();

export function stopTorrentDownloads() {
  stopping = true;
  for (const interval of activeIntervals.values()) clearInterval(interval);
  activeIntervals.clear();
  if (client) {
    for (const torrent of client.torrents || []) activeExtractions.get(torrent)?.abort();
    client.destroy((error?: Error) => { if (error) console.warn('[WebTorrent] Shutdown error:', error); });
    client = null;
  }
}

export function magnetInfoHash(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== 'magnet:') throw new Error('A valid magnet link is required');
  const value = url.searchParams.getAll('xt').find(xt => /^urn:btih:/i.test(xt))?.slice(9) || '';
  if (/^[a-f0-9]{40}$/i.test(value)) return value.toLowerCase();
  if (!/^[a-z2-7]{32}$/i.test(value)) throw new Error('Magnet link contains an invalid info hash');
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase()) {
    accumulator = (accumulator << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); }
  }
  return Buffer.from(bytes).toString('hex');
}

function findExistingTorrent(c: any, hash: string | null): any {
  if (!hash || !c || !Array.isArray(c.torrents)) return null;
  const cleanHash = hash.toLowerCase();
  return c.torrents.find((t: any) => 
    t && typeof t.on === 'function' && !t.destroyed && (
      (t.infoHash && typeof t.infoHash === 'string' && t.infoHash.toLowerCase() === cleanHash) ||
      (t._infoHash && typeof t._infoHash === 'string' && t._infoHash.toLowerCase() === cleanHash) ||
      (t.magnetURI && typeof t.magnetURI === 'string' && t.magnetURI.toLowerCase().includes(cleanHash))
    )
  ) || null;
}

export function initTorrentIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  
  function sendProgress(payload: TorrentPayload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('torrent:progress', payload);
    }
  }

  function trackTorrent(
    torrent: any, 
    infoHash: string, 
    effectiveName: string, 
    targetPath: string, 
    autoExtract = true, 
    autoDelete = false
  ) {
    if (!torrent || typeof torrent.on !== 'function') {
      console.warn('[WebTorrent] trackTorrent: invalid torrent instance');
      return;
    }

    if (trackedTorrents.has(torrent)) return;
    trackedTorrents.add(torrent);
    let phase: TorrentPayload['status'] = torrent.paused ? 'paused' : 'downloading';
    let finishing = false;

    if (activeIntervals.has(infoHash)) {
      clearInterval(activeIntervals.get(infoHash)!);
      activeIntervals.delete(infoHash);
    }

    const emitCurrentProgress = (overrideStatus?: 'downloading' | 'paused' | 'done' | 'extracting' | 'error') => {
      if (torrent.destroyed) return;
      const currentName = torrent.name || effectiveName;
      const payload: TorrentPayload = {
        infoHash: torrent.infoHash || infoHash,
        name: currentName,
        progress: torrent.progress || 0,
        downloadSpeed: torrent.paused || phase !== 'downloading' ? 0 : torrent.downloadSpeed || 0,
        timeRemaining: torrent.paused ? Infinity : torrent.timeRemaining || 0,
        downloaded: torrent.downloaded || 0,
        length: torrent.length || 0,
        status: overrideStatus || (phase === 'extracting' || phase === 'error' || phase === 'done' ? phase : torrent.paused ? 'paused' : 'downloading'),
        peers: torrent.numPeers || 0,
        installPath: targetPath
      };
      sendProgress(payload);
    };

    // Emit initial status
    emitCurrentProgress();

    torrent.on('metadata', () => {
      console.log(`[WebTorrent] Metadata received for: ${torrent.name} (${torrent.length} bytes)`);
      emitCurrentProgress();
    });

    torrent.on('wire', () => {
      emitCurrentProgress();
    });

    const finishTorrent = async () => {
      if (finishing) return;
      finishing = true;
      console.log(`[WebTorrent] Download finished for: ${torrent.name}`);
      if (activeIntervals.has(infoHash)) {
        clearInterval(activeIntervals.get(infoHash)!);
        activeIntervals.delete(infoHash);
      }

      let mainExe: string | null = null;
      let gameInstallPath = targetPath;
      // Finished downloads should stop transferring/seeding in the background.
      pauseTorrentTransfer(torrent);

      if (autoExtract && torrent.files) {
        const archiveFile = torrent.files.find((f: any) => 
          /\.(zip|rar|7z)$/i.test(f.name)
        );

        if (archiveFile) {
          const abortController = new AbortController();
          activeExtractions.set(torrent, abortController);
          phase = 'extracting';
          emitCurrentProgress('extracting');
          try {
            const archivePath = containedDownloadPath(targetPath, archiveFile.path);
            const cleanGameDir = path.join(targetPath, safeDownloadName(effectiveName));
            gameInstallPath = cleanGameDir;
            const res = await extractArchive(
              archivePath, 
              cleanGameDir, 
              (extractPercent: number) => {
                if (torrent.destroyed) return;
                sendProgress({
                  infoHash: torrent.infoHash || infoHash,
                  name: effectiveName,
                  progress: extractPercent / 100,
                  downloadSpeed: 0,
                  timeRemaining: 0,
                  downloaded: torrent.length || 0,
                  length: torrent.length || 0,
                  status: 'extracting',
                  peers: torrent.numPeers || 0,
                  installPath: cleanGameDir
                });
              },
              autoDelete,
              abortController.signal
            );
            mainExe = res.mainExe;
          } catch (e) {
            if (torrent.destroyed) return;
            console.error('[WebTorrent] Auto-extract error:', e);
            phase = 'error';
            sendProgress({ infoHash, name: effectiveName, progress: 1, downloadSpeed: 0, timeRemaining: 0,
              downloaded: torrent.length || 0, length: torrent.length || 0, status: 'error',
              installPath: targetPath, errorMessage: e instanceof Error ? e.message : String(e) });
            return;
          } finally {
            activeExtractions.delete(torrent);
          }
        }
      }

      if (torrent.destroyed) return;
      if (!mainExe) {
        const firstFile = torrent.files?.[0]?.path;
        if (phase !== 'extracting' && typeof firstFile === 'string') {
          const rootFolder = firstFile.replace(/\\/g, '/').split('/');
          if (rootFolder.length > 1) gameInstallPath = containedDownloadPath(targetPath, rootFolder[0]);
        }
        mainExe = findMainGameExecutable(gameInstallPath, effectiveName);
      }
      phase = 'done';

      sendProgress({
        infoHash: torrent.infoHash || infoHash,
        name: effectiveName,
        progress: 1,
        downloadSpeed: 0,
        timeRemaining: 0,
        downloaded: torrent.length || 0,
        length: torrent.length || 0,
        status: 'done',
        peers: torrent.numPeers || 0,
        mainExe,
        installPath: gameInstallPath
      });
    };
    const finishSafely = () => { void finishTorrent().catch(error => {
      if (torrent.destroyed) return;
      phase = 'error';
      sendProgress({ infoHash, name: effectiveName, progress: 0, downloadSpeed: 0, timeRemaining: 0,
        downloaded: torrent.downloaded || 0, length: torrent.length || 0, status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error) });
    }); };
    torrent.once('done', finishSafely);
    if (torrent.done) queueMicrotask(finishSafely);

    torrent.on('error', (err: any) => {
      if (torrent.destroyed) return;
      console.error('[WebTorrent] Torrent error:', err);
      phase = 'error';
      if (activeIntervals.has(infoHash)) {
        clearInterval(activeIntervals.get(infoHash)!);
        activeIntervals.delete(infoHash);
      }
      sendProgress({
        infoHash: torrent.infoHash || infoHash,
        name: effectiveName,
        progress: 0,
        downloadSpeed: 0,
        timeRemaining: 0,
        downloaded: 0,
        length: 0,
        status: 'error',
        peers: 0,
        errorMessage: err?.message || 'Torrent download failed'
      });
    });

    // Steady interval for smooth speed / ETA calculation
    const interval = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed() || torrent.destroyed) {
        clearInterval(interval);
        activeIntervals.delete(infoHash);
        return;
      }
      emitCurrentProgress();
      if (torrent.done) {
        clearInterval(interval);
        activeIntervals.delete(infoHash);
      }
    }, 500);

    activeIntervals.set(infoHash, interval);
  }

  // Start Download
  ipcMain.handle('torrent:start', async (_event, magnetURI: string, gameTitle?: string, downloadPath?: string, autoExtract = true, autoDelete = false) => {
    try {
      const targetPath = (downloadPath && path.isAbsolute(downloadPath)) ? downloadPath : getDefaultDownloadPath();
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const extractedHash = magnetInfoHash(magnetURI);
      const c = await getClient();
      
      // Inject top announce trackers into magnet URI if missing
      let enhancedMagnet = magnetURI.trim()
      if (enhancedMagnet.startsWith('magnet:')) {
        TOP_TRACKERS.forEach(tr => {
          if (!enhancedMagnet.includes(encodeURIComponent(tr)) && !enhancedMagnet.includes(tr)) {
            enhancedMagnet += `&tr=${encodeURIComponent(tr)}`
          }
        })
      }

      let torrent: any;
      const existing = findExistingTorrent(c, extractedHash);
      if (existing) {
        console.log(`[WebTorrent] Resuming existing torrent for: ${extractedHash}`);
        torrent = existing;
        if (torrent.paused) torrent.resume();
      } else {
        console.log(`[WebTorrent] Starting new torrent download for "${gameTitle || 'Game'}" in: ${targetPath}`);
        try {
          torrent = c.add(enhancedMagnet, { path: targetPath });
        } catch (addErr: any) {
          console.warn('[WebTorrent] Add error, checking existing:', addErr.message);
          const found = findExistingTorrent(c, extractedHash);
          if (found) {
            torrent = found;
            if (torrent.paused) torrent.resume();
          } else {
            throw addErr;
          }
        }
      }

      const infoHash = (torrent && torrent.infoHash) || extractedHash || `torrent-${Date.now()}`;
      const effectiveName = gameTitle || (torrent && torrent.name) || 'Game Torrent';

      if (torrent && typeof torrent.on === 'function') {
        trackTorrent(torrent, infoHash, effectiveName, targetPath, autoExtract, autoDelete);
      }

      return { success: true, infoHash: infoHash };
    } catch (error: any) {
      console.error('[WebTorrent] Start error:', error);
      return { success: false, error: error?.message || 'WebTorrent client start error' };
    }
  });

  ipcMain.handle('torrent:pause', async (_event, infoHash: string) => {
    const torrent = findExistingTorrent(client, infoHash)
    if (!torrent) return { handled: false }
    if (activeExtractions.has(torrent)) return { handled: true, success: false, error: 'Extraction cannot be paused' }
    if (!torrent.paused) pauseTorrentTransfer(torrent)
    sendProgress({ infoHash, name: torrent.name || 'Game Torrent', progress: torrent.progress || 0,
      downloadSpeed: 0, timeRemaining: Infinity, downloaded: torrent.downloaded || 0,
      length: torrent.length || 0, status: 'paused', peers: 0 })
    return { handled: true, success: true }
  })
  ipcMain.handle('torrent:resume', async (_event, infoHash: string) => {
    const torrent = findExistingTorrent(client, infoHash)
    if (!torrent) return { handled: false }
    if (activeExtractions.has(torrent)) return { handled: true, success: false, error: 'Extraction cannot be resumed as a download' }
    if (torrent.paused) resumeTorrentTransfer(torrent)
    sendProgress({ infoHash, name: torrent.name || 'Game Torrent', progress: torrent.progress || 0,
      downloadSpeed: torrent.downloadSpeed || 0, timeRemaining: torrent.timeRemaining || 0,
      downloaded: torrent.downloaded || 0, length: torrent.length || 0, status: 'downloading', peers: torrent.numPeers || 0 })
    return { handled: true, success: true }
  })
  ipcMain.handle('torrent:cancel', async (_event, infoHash: string) => {
    const torrent = findExistingTorrent(client, infoHash)
    if (!torrent) return { handled: false }
    const interval = activeIntervals.get(infoHash)
    if (interval) clearInterval(interval)
    activeIntervals.delete(infoHash)
    activeExtractions.get(torrent)?.abort()
    await new Promise<void>((resolve, reject) => torrent.destroy({ destroyStore: false }, (error?: Error) => error ? reject(error) : resolve()))
    return { handled: true, success: true }
  })

}
