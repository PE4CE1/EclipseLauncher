import path from 'path'
import fs from 'fs'
import { app } from 'electron'

let client: any = null;

async function getClient() {
  if (!client) {
    const webtorrentModule = await import('webtorrent');
    const WebTorrent = webtorrentModule.default || webtorrentModule;
    client = new (WebTorrent as any)();
    client.on('error', (err: any) => {
      console.error('WebTorrent Error:', err);
    });
  }
  return client;
}

// Default fallback download path
const defaultDownloadPath = path.join(app.getPath('userData'), 'Downloads')
if (!fs.existsSync(defaultDownloadPath)) {
  fs.mkdirSync(defaultDownloadPath, { recursive: true })
}

export type TorrentPayload = {
  infoHash: string
  name: string
  progress: number
  downloadSpeed: number
  timeRemaining: number
  downloaded: number
  length: number
  status: 'downloading' | 'paused' | 'done' | 'extracting'
  peers?: number
}

export function initTorrentIPC(ipcMain: Electron.IpcMain, mainWindow: Electron.BrowserWindow) {
  
  // Start Download
  ipcMain.handle('torrent:start', async (_event, magnetURI: string, downloadPath?: string, autoExtract?: boolean) => {
    const targetPath = downloadPath || defaultDownloadPath;
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

    const torrent = c.add(magnetURI, { path: targetPath }) as any;
    const infoHash = torrent.infoHash || extractedHash || 'unknown';

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
          name: torrent.name || 'Fetching Metadata...',
          progress: 0,
          downloadSpeed: 0,
          timeRemaining: Infinity,
          downloaded: 0,
          length: 0,
          status: torrent.paused ? 'paused' : 'downloading'
        });
        return;
      }

      const payload: TorrentPayload = {
        infoHash: torrent.infoHash || infoHash,
        name: torrent.name || 'Unknown Game',
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed,
        timeRemaining: torrent.timeRemaining,
        downloaded: torrent.downloaded,
        length: torrent.length,
        status: torrent.done ? 'done' : (torrent.paused ? 'paused' : 'downloading'),
        peers: torrent.numPeers || 0
      };
      mainWindow.webContents.send('torrent:progress', payload);
      
      if (torrent.done) {
        clearInterval(interval);
      }
    }, 1000);

    torrent.on('done', async () => {
      let isExtracting = false;

      if (autoExtract && torrent.files) {
        const archiveFile = torrent.files.find((f: any) => f.name.endsWith('.zip') || f.name.endsWith('.rar') || f.name.endsWith('.7z'));
        if (archiveFile) {
          isExtracting = true;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('torrent:progress', {
              infoHash: torrent.infoHash || infoHash,
              name: torrent.name || 'Unknown Game',
              progress: 1,
              downloadSpeed: 0,
              timeRemaining: 0,
              downloaded: torrent.length || 0,
              length: torrent.length || 0,
              status: 'extracting',
              peers: torrent.numPeers || 0
            });
          }

          const archivePath = path.join(targetPath, archiveFile.path);
          const extractTarget = path.join(targetPath, archiveFile.name.substring(0, archiveFile.name.lastIndexOf('.')));
          
          try {
            const { extractArchive } = require('./extractService');
            await extractArchive(archivePath, extractTarget);
          } catch (e) {
            console.error('Torrent auto-extract error:', e);
          }
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent:progress', {
          infoHash: torrent.infoHash || infoHash,
          name: torrent.name || 'Unknown Game',
          progress: 1,
          downloadSpeed: 0,
          timeRemaining: 0,
          downloaded: torrent.length || 0,
          length: torrent.length || 0,
          status: 'done',
          peers: torrent.numPeers || 0
        });
      }
    });

    return { success: true, infoHash: infoHash };
  });

  // Pause Download
  ipcMain.handle('torrent:pause', async (_event, infoHash: string) => {
    const c = await getClient();
    const torrent = c.get(infoHash) as any;
    if (torrent && !torrent.paused) {
      torrent.pause();
    }
  });

  // Resume Download
  ipcMain.handle('torrent:resume', async (_event, infoHash: string) => {
    const c = await getClient();
    const torrent = c.get(infoHash) as any;
    if (torrent && torrent.paused) {
      torrent.resume();
    }
  });

  // Cancel/Remove Download
  ipcMain.handle('torrent:cancel', async (_event, infoHash: string) => {
    const c = await getClient();
    const torrent = c.get(infoHash) as any;
    if (torrent && typeof torrent.destroy === 'function') {
      torrent.destroy(); // Stops downloading and removes from client
    }
  });
}
