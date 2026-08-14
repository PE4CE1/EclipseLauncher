import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let client: any = null;

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
  'https://tracker.tamersunion.org:443/announce'
]

async function getClient() {
  if (!client) {
    try {
      // Use dynamic Function import to prevent CommonJS bundling collisions
      const importDynamic = new Function('modulePath', 'return import(modulePath)');
      const webtorrentModule = await importDynamic('webtorrent');
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
  }
  return client;
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
}

export function initTorrentIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  
  // Start Download
  ipcMain.handle('torrent:start', async (_event, magnetURI: string, gameTitle?: string, downloadPath?: string, autoExtract = true, autoDelete = false) => {
    try {
      const targetPath = (downloadPath && path.isAbsolute(downloadPath)) ? downloadPath : getDefaultDownloadPath();
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const c = await getClient();
      
      // Check if it already exists
      const match = magnetURI.match(/xt=urn:btih:([^&]+)/i);
      const extractedHash = match ? match[1].toLowerCase() : null;
      if (extractedHash) {
        const existing = c.get(extractedHash) as any;
        if (existing) {
          return { success: true, infoHash: existing.infoHash };
        }
      }

      // Inject top announce trackers into magnet URI if missing
      let enhancedMagnet = magnetURI.trim()
      if (enhancedMagnet.startsWith('magnet:')) {
        TOP_TRACKERS.forEach(tr => {
          if (!enhancedMagnet.includes(encodeURIComponent(tr)) && !enhancedMagnet.includes(tr)) {
            enhancedMagnet += `&tr=${encodeURIComponent(tr)}`
          }
        })
      }

      console.log(`[WebTorrent] Starting torrent download for "${gameTitle || 'Game'}" in: ${targetPath}`);
      const torrent = c.add(enhancedMagnet, { path: targetPath }) as any;
      const infoHash = torrent.infoHash || extractedHash || `torrent-${Date.now()}`;
      const effectiveName = gameTitle || torrent.name || 'Game Torrent';

      // Send initial progress immediately so the UI displays the downloading card right away
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent:progress', {
          infoHash: infoHash,
          name: effectiveName,
          progress: 0,
          downloadSpeed: 0,
          timeRemaining: Infinity,
          downloaded: 0,
          length: 0,
          status: 'downloading',
          peers: 0,
          installPath: targetPath
        });
      }

      // Interval to send progress updates to the renderer
      const interval = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          clearInterval(interval);
          return;
        }
        
        // Wait for metadata
        if (!torrent.ready && !torrent.metadata) {
          mainWindow.webContents.send('torrent:progress', {
            infoHash: infoHash,
            name: torrent.name || effectiveName,
            progress: 0,
            downloadSpeed: 0,
            timeRemaining: Infinity,
            downloaded: 0,
            length: 0,
            status: torrent.paused ? 'paused' : 'downloading',
            peers: torrent.numPeers || 0,
            installPath: targetPath
          });
          return;
        }

        const payload: TorrentPayload = {
          infoHash: torrent.infoHash || infoHash,
          name: torrent.name || effectiveName,
          progress: torrent.progress,
          downloadSpeed: torrent.downloadSpeed,
          timeRemaining: torrent.timeRemaining,
          downloaded: torrent.downloaded,
          length: torrent.length,
          status: torrent.done ? 'done' : (torrent.paused ? 'paused' : 'downloading'),
          peers: torrent.numPeers || 0,
          installPath: targetPath
        };
        mainWindow.webContents.send('torrent:progress', payload);
        
        if (torrent.done) {
          clearInterval(interval);
        }
      }, 1000);

      torrent.on('done', async () => {
        let mainExe: string | null = null;
        let gameInstallPath = targetPath;

        if (autoExtract && torrent.files) {
          const archiveFile = torrent.files.find((f: any) => 
            f.name.endsWith('.zip') || f.name.endsWith('.rar') || f.name.endsWith('.7z')
          );

          if (archiveFile) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('torrent:progress', {
                infoHash: torrent.infoHash || infoHash,
                name: torrent.name || effectiveName,
                progress: 1,
                downloadSpeed: 0,
                timeRemaining: 0,
                downloaded: torrent.length || 0,
                length: torrent.length || 0,
                status: 'extracting',
                peers: torrent.numPeers || 0,
                installPath: targetPath
              });
            }

            const archivePath = path.join(targetPath, archiveFile.path);
            const cleanGameDir = path.join(targetPath, (effectiveName).replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim());
            gameInstallPath = cleanGameDir;
            
            try {
              const { extractArchive } = require('./extractService');
              const res = await extractArchive(
                archivePath, 
                cleanGameDir, 
                (extractPercent: number) => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('torrent:progress', {
                      infoHash: torrent.infoHash || infoHash,
                      name: torrent.name || effectiveName,
                      progress: extractPercent / 100,
                      downloadSpeed: 0,
                      timeRemaining: 0,
                      downloaded: torrent.length || 0,
                      length: torrent.length || 0,
                      status: 'extracting',
                      peers: torrent.numPeers || 0,
                      installPath: cleanGameDir
                    });
                  }
                },
                autoDelete
              );
              mainExe = res.mainExe;
            } catch (e) {
              console.error('[WebTorrent] Auto-extract error:', e);
            }
          }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('torrent:progress', {
            infoHash: torrent.infoHash || infoHash,
            name: torrent.name || effectiveName,
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
        }
      });

      torrent.on('error', (err: any) => {
        console.error('[WebTorrent] Torrent download error:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('torrent:progress', {
            infoHash: torrent.infoHash || infoHash,
            name: effectiveName,
            progress: 0,
            downloadSpeed: 0,
            timeRemaining: 0,
            downloaded: 0,
            length: 0,
            status: 'error',
            peers: 0
          });
        }
      });

      return { success: true, infoHash: infoHash };
    } catch (error: any) {
      console.error('[WebTorrent] Start error:', error);
      return { success: false, error: error?.message || 'WebTorrent client start error' };
    }
  });

  // Pause Download
  ipcMain.handle('torrent:pause', async (_event, infoHash: string) => {
    try {
      const c = await getClient();
      const torrent = c.get(infoHash) as any;
      if (torrent && !torrent.paused) {
        torrent.pause();
      }
    } catch (e) {}
  });

  // Resume Download
  ipcMain.handle('torrent:resume', async (_event, infoHash: string) => {
    try {
      const c = await getClient();
      const torrent = c.get(infoHash) as any;
      if (torrent && torrent.paused) {
        torrent.resume();
      }
    } catch (e) {}
  });

  // Cancel/Remove Download
  ipcMain.handle('torrent:cancel', async (_event, infoHash: string) => {
    try {
      const c = await getClient();
      const torrent = c.get(infoHash) as any;
      if (torrent && typeof torrent.destroy === 'function') {
        torrent.destroy();
      }
    } catch (e) {}
  });
}
