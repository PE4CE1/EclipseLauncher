const peersToResume = new WeakMap<object, string[]>()

export function pauseTorrentTransfer(torrent: any) {
  const peers: string[] = []
  torrent.pause()
  // WebTorrent.pause only stops new connections. Existing wires otherwise
  // keep transferring, so close them and retain TCP endpoints for resume.
  for (const wire of [...(torrent.wires || [])]) {
    if (wire.remoteAddress && Number.isInteger(wire.remotePort) && wire.remotePort > 0 && wire.remotePort <= 65535) {
      const host = wire.remoteAddress.includes(':') ? `[${wire.remoteAddress}]` : wire.remoteAddress
      peers.push(`${host}:${wire.remotePort}`)
    }
    wire.destroy()
  }
  if (peers.length) peersToResume.set(torrent, peers)
}

export function resumeTorrentTransfer(torrent: any) {
  torrent.resume()
  for (const peer of peersToResume.get(torrent) || []) torrent.addPeer(peer)
  peersToResume.delete(torrent)
  for (const seed of torrent.urlList || []) torrent.addWebSeed(seed)
  torrent.discovery?.tracker?.update?.()
}
