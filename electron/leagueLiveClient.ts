import https from 'node:https'
import { RIOT_GAME_CLIENT_CA } from './riotCertificate'

type Endpoint = 'activeplayername' | 'eventdata' | 'gamestats'
export function createLeagueLiveClient() {
  // Riot's legacy local certificate has no IP SAN. Keep chain validation against
  // Riot's explicit trust anchor; hostname verification is scoped to this fixed loopback client.
  const agent = new https.Agent({ca:RIOT_GAME_CLIENT_CA,checkServerIdentity:()=>undefined,keepAlive:true,maxSockets:3,maxFreeSockets:3})
  const pending = new Set<ReturnType<typeof https.get>>()
  let closed = false
  return {
    read(endpoint: Endpoint): Promise<any> {
      if (closed || !['activeplayername','eventdata','gamestats'].includes(endpoint)) return Promise.reject(new Error('Invalid live client request'))
      return new Promise((resolve,reject) => {
        // Fixed loopback destination, Riot CA verification, no redirects, keys or remote account requests.
        const request = https.get(`https://127.0.0.1:2999/liveclientdata/${endpoint}`,{agent,timeout:1500},response => {
          if (response.statusCode !== 200) { response.resume(); reject(new Error('Live client unavailable')); return }
          const chunks: Buffer[] = []; let size = 0, rejected = false
          response.on('data',(chunk:Buffer) => {
            if (rejected) return
            size += chunk.length
            if (size > 2*1024*1024) {
              rejected = true; chunks.length = 0
              const error = new Error('Live client response too large'); reject(error); request.destroy(error); return
            }
            chunks.push(chunk)
          })
          response.on('error',reject)
          response.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(new Error('Invalid live client response'))}})
        })
        pending.add(request)
        request.on('timeout',()=>request.destroy(new Error('Live client timed out')))
        request.on('error',reject)
        request.on('close',()=>pending.delete(request))
      })
    },
    close() { closed = true; for (const request of pending) request.destroy(new Error('Live client stopped')); pending.clear(); agent.destroy() },
  }
}
