import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { writeJsonAtomicSync } from './jsonStorage'
import { cs2Session } from './cs2Stats'
import { installGsiConfiguration } from './autoClipConfig'
import { createLeagueLiveClient } from './leagueLiveClient'
import { subscribeRocketLeagueStats } from './rocketLeagueClient'
import { createRocketLeagueDetector } from './rocketLeagueEvents'
import { autoClipGame, createCS2Detector, createDota2Detector, createLoLDetector } from './autoClipEvents'
import type { AutoClipGameId, AutoClipOptions, AutoClipEvent, AutoClipStatus, AutoClipConnection, GsiGameId } from '../src/types/autoClips'

let getWindow: () => BrowserWindow | null = () => null
let getRules: () => AutoClipOptions = () => ({ enabled:false })
let wantsCS2Stats=()=>false
let publishCS2Stats:()=>void=()=>{}
const transportEnabled=(id:AutoClipGameId,rules:AutoClipOptions)=>enabled(id,rules)||(id==='cs2'&&wantsCS2Stats())
let currentGame = '', signature = '', generation = 0, lastClip = -Infinity
let server: http.Server | null = null, timer: ReturnType<typeof setTimeout> | undefined
let league: ReturnType<typeof createLeagueLiveClient> | null = null
let cachedToken: string | undefined
let rocket: ReturnType<typeof subscribeRocketLeagueStats> | null = null
let rocketLeaguePlayers: {id:string;name:string}[] = []
const needsRestart = new Set<GsiGameId>()
const ids: AutoClipGameId[] = ['cs2','dota2','lol','rocket-league','overwatch']
const connections = Object.fromEntries(ids.map(id=>[id,{state:'disabled'}])) as Record<AutoClipGameId,AutoClipConnection>
connections.overwatch = {state:'manual',detail:'no-api'}

function enabled(id: AutoClipGameId, rules: AutoClipOptions) {
  return rules.enabled !== false && rules.autoClipEnabled === true &&
    (id === 'cs2' ? rules.autoClipCS2Enabled !== false : id === 'dota2' ? rules.autoClipDota2Enabled === true : id === 'rocket-league' ? rules.autoClipRocketLeagueEnabled === true : id === 'lol' && rules.autoClipLoLEnabled === true)
}
function token() {
  if (cachedToken) return cachedToken
  const file = path.join(app.getPath('userData'),'autoclip-auth.json')
  try { const value=JSON.parse(fs.readFileSync(file,'utf8'));if(typeof value.token==='string'&&/^[a-f\d]{64}$/.test(value.token))return cachedToken=value.token } catch {}
  cachedToken = crypto.randomBytes(32).toString('hex')
  writeJsonAtomicSync(file,{token:cachedToken})
  return cachedToken
}
function emit(id: AutoClipGameId, events: AutoClipEvent[], rules: AutoClipOptions) {
  const cooldown = Math.max(5,Math.min(120,Number(rules.autoClipCooldownSeconds)||15))*1000
  if (Date.now()-lastClip < cooldown) return
  const priority = {ace:5,win:4,kill:3,goal:3,save:3,demo:2,death:1}
  const event = [...events].sort((a,b)=>priority[b.eventType]-priority[a.eventType])[0]
  const window = getWindow()
  if (!event || !window || window.isDestroyed()) return
  try {
    window.webContents.send('clip:auto-triggered',{...event,timestamp:Date.now()})
    lastClip = Date.now(); connections[id] = {...connections[id],lastEventAt:lastClip}
  } catch {}
}
function requestHandler(id: GsiGameId, rules: AutoClipOptions | (()=>AutoClipOptions), expectedToken: string, active = () => true): http.RequestListener {
  const detect = id === 'cs2' ? createCS2Detector() : createDota2Detector()
  return (req,res) => {
    if (req.method !== 'POST' || req.url !== '/') {res.writeHead(405);res.end();return}
    if (req.headers.origin) {res.writeHead(403);res.end();return}
    const chunks:Buffer[]=[];let size=0,oversized=false
    req.on('error',()=>{if(!res.writableEnded){res.writeHead(400);res.end()}})
    req.on('data',(chunk:Buffer)=>{
      if(oversized)return
      size+=chunk.length
      if(size>256*1024){oversized=true;chunks.length=0;res.writeHead(413);res.end();return}
      chunks.push(chunk)
    })
    req.on('end',()=>{
      if(oversized||res.writableEnded)return
      try {
        const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),received=data?.auth?.token
        if(typeof received!=='string'||Buffer.byteLength(received)!==Buffer.byteLength(expectedToken)||!crypto.timingSafeEqual(Buffer.from(received),Buffer.from(expectedToken))){res.writeHead(403);res.end();return}
        const settings=typeof rules==='function'?rules():rules
        if(active()&&transportEnabled(id,settings)){
          if(id==='cs2'&&wantsCS2Stats()&&cs2Session.ingest(data))publishCS2Stats()
          const result=detect(data,settings)
          if(result.valid){needsRestart.delete(id);connections[id]={...connections[id],state:'connected',detail:undefined,lastSeenAt:Date.now()};if(enabled(id,settings))emit(id,result.events,settings)}
        }
        res.writeHead(200);res.end('OK')
      }catch{res.writeHead(400);res.end()}
    })
  }
}
export const createCS2RequestHandler = (rules: AutoClipOptions, expectedToken: string) => requestHandler('cs2',rules,expectedToken)
export const createDota2RequestHandler = (rules: AutoClipOptions, expectedToken: string) => requestHandler('dota2',rules,expectedToken)

function stopTransport() {
  if(timer)clearTimeout(timer);timer=undefined
  league?.close();league=null
  rocket?.close();rocket=null;rocketLeaguePlayers=[]
  if(server){server.closeAllConnections();try{server.close()}catch{}server=null}
}
function startRocketLeague(version:number) {
  let detect=createRocketLeagueDetector()
  rocket=subscribeRocketLeagueStats(message=>{
    if(version!==generation)return
    const rules=getRules()
    if(!enabled('rocket-league',rules))return
    const result=detect(message,rules)
    if(!result.valid)return
    rocketLeaguePlayers=result.players || []
    connections['rocket-league']={...connections['rocket-league'],state:'connected',lastSeenAt:Date.now(),detail:rocketLeaguePlayers.some(player=>player.id===rules.autoClipRocketLeaguePlayerId)?undefined:'select-player'}
    emit('rocket-league',result.events,rules)
  },connected=>{
    if(connected)return
    if(version!==generation)return
    detect=createRocketLeagueDetector();rocketLeaguePlayers=[]
    connections['rocket-league']={state:'waiting',detail:'connection'}
  })
}
async function startGsi(id: GsiGameId, version: number) {
  try {
    const auth=token()
    const result=await installGsiConfiguration(id,auth,undefined,()=>version===generation)
    if(version!==generation)return
    if(!result.success){connections[id]={state:'error',detail:result.error==='not-installed'?'not-installed':'connection'};return}
    if(result.changed)needsRestart.add(id)
    const active=http.createServer(requestHandler(id,getRules,auth,()=>version===generation));server=active
    active.requestTimeout=10000;active.headersTimeout=10000;active.maxConnections=4
    active.on('error',error=>{if(server===active){server=null;connections[id]={state:'error',detail:(error as NodeJS.ErrnoException).code==='EADDRINUSE'?'port-busy':'connection'}}})
    active.listen(id==='cs2'?13371:13372,'127.0.0.1',()=>{if(version===generation)connections[id]={state:'listening',detail:needsRestart.has(id)?'restart':undefined}})
  }catch{if(version===generation)connections[id]={state:'error',detail:'connection'}}
}
function startLeague(version: number) {
  const client=createLeagueLiveClient(),detect=createLoLDetector();league=client
  const poll=async()=>{
    try {
      const [name,game,events]=await Promise.all([client.read('activeplayername'),client.read('gamestats'),client.read('eventdata')])
      if(version!==generation)return
      const rules=getRules(),result=detect({name,gameTime:game?.gameTime,events:events?.Events},rules)
      if(result.valid){connections.lol={...connections.lol,state:'connected',detail:undefined,lastSeenAt:Date.now()};emit('lol',result.events,rules)}
    }catch(error){if(version!==generation)return;const code=String((error as NodeJS.ErrnoException).code||'');connections.lol={state:'waiting',detail:/CERT|TLS|SSL|VERIFY/.test(code)?'certificate':'connection'}}
    if(version===generation){timer=setTimeout(poll,1500);timer.unref()}
  }
  void poll()
}
export function refreshAutoClipSettings(force=false) {
  const rules=getRules(),id=autoClipGame(currentGame),next=JSON.stringify([currentGame,id?transportEnabled(id,rules):false])
  // Event switches and cooldowns are read live; keep the established baseline and
  // transport when only those rules change during a match.
  if(!force&&signature===next)return
  signature=next;const version=++generation;stopTransport()
  for(const id of ['cs2','dota2','lol','rocket-league'] as const)connections[id]={state:transportEnabled(id,rules)?'waiting':'disabled'}
  if(!id||!transportEnabled(id,rules))return
  if(id==='cs2'||id==='dota2')void startGsi(id,version)
  else if(id==='lol')startLeague(version)
  else if(id==='rocket-league')startRocketLeague(version)
}
export function getAutoClipStatus(): AutoClipStatus {
  const games={...connections}
  for(const id of ['cs2','dota2','lol','rocket-league'] as const)if(id!==autoClipGame(currentGame))games[id]={state:transportEnabled(id,getRules())?'waiting':'disabled'}
  for(const id of ids)if(games[id].state==='connected'&&Date.now()-(games[id].lastSeenAt||0)>35000)games[id]={...games[id],state:'listening'}
  return {activeGame:autoClipGame(currentGame),games,rocketLeaguePlayers:[...rocketLeaguePlayers]}
}
export async function setupAutoClipGame(id: unknown) {
  if(id!=='cs2'&&id!=='dota2')return {success:false,error:'configuration' as const}
  try {
    const result=await installGsiConfiguration(id,token())
    if(result.changed)needsRestart.add(id)
    refreshAutoClipSettings(true)
    return result
  }catch{return {success:false,error:'configuration' as const}}
}
export function initAutoClipService(window:()=>BrowserWindow|null, settings?:()=>AutoClipOptions, stats?:()=>boolean, publish?:()=>void) {
  getWindow=window;if(settings)getRules=settings
  if(stats)wantsCS2Stats=stats
  if(publish)publishCS2Stats=publish
  app?.once?.('before-quit',onGameStoppedAutoClip)
  refreshAutoClipSettings()
}
export function onGameStartedAutoClip(name:string) {
  if(name!==currentGame){const id=autoClipGame(name);if(id==='cs2'||id==='dota2')needsRestart.delete(id);lastClip=-Infinity}
  currentGame=name;refreshAutoClipSettings(true)
}
export function onGameStoppedAutoClip() {cs2Session.disconnect();publishCS2Stats();currentGame='';refreshAutoClipSettings(true)}
