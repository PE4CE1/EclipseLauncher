export function connectRocketLeagueStats(onData:(message:unknown)=>void,onConnection:(connected:boolean)=>void) {
  let socket: WebSocket | undefined, stopped = false, retry: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined
  let delay = 3000
  const connect = () => {
    if (stopped) return
    // The official game's default WebPort, fixed to loopback. No commands,
    // hooks, mods, login credentials or remote connections are used.
    const connection = new WebSocket('ws://127.0.0.1:49124'); socket = connection
    const close = () => { try {connection.close()} catch {} }
    timeout = setTimeout(close,3000);timeout.unref()
    connection.addEventListener('open',() => {clearTimeout(timeout);delay=3000})
    connection.addEventListener('message',event => {
      if (stopped || socket !== connection) return
      if (typeof event.data !== 'string' || event.data.length > 256*1024) {close();return}
      try {onData(JSON.parse(event.data))} catch {}
    })
    connection.addEventListener('error',close)
    connection.addEventListener('close',() => {
      clearTimeout(timeout)
      if (stopped || socket !== connection) return
      onConnection(false);socket=undefined
      retry=setTimeout(connect,delay);retry.unref();delay=Math.min(30000,delay*2)
    })
  }
  connect()
  return {close(){stopped=true;clearTimeout(timeout);clearTimeout(retry);try{socket?.close()}catch{}socket=undefined}}
}

// The clip detector and HUD share one read-only socket, not two high-rate feeds.
const subscribers = new Set<{ data: (message: unknown) => void; connection: (connected: boolean) => void }>()
let shared: ReturnType<typeof connectRocketLeagueStats> | undefined
let latest: unknown, connected = false
export function subscribeRocketLeagueStats(onData: (message: unknown) => void, onConnection: (connected: boolean) => void) {
  const subscriber = { data: onData, connection: onConnection }
  subscribers.add(subscriber)
  if (!shared) shared = connectRocketLeagueStats(message => {
    const first = !connected; connected = true
    if ((message as any)?.Event === 'UpdateState') latest = message
    else if (['MatchCreated', 'MatchDestroyed', 'MatchEnded', 'ReplayCreated'].includes((message as any)?.Event)) latest = undefined
    for (const listener of [...subscribers]) { if (!subscribers.has(listener)) continue; if (first) listener.connection(true); listener.data(message) }
  }, () => { connected = false; latest = undefined; for (const listener of [...subscribers]) listener.connection(false) })
  else queueMicrotask(() => { if (subscribers.has(subscriber)) { onConnection(connected); if (latest) onData(latest) } })
  return { close() {
    subscribers.delete(subscriber)
    if (!subscribers.size) { shared?.close(); shared = undefined; latest = undefined; connected = false }
  } }
}
