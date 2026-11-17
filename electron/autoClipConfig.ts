import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { GsiGameId, AutoClipSetupResult } from '../src/types/autoClips'

export async function steamLibraries(): Promise<string[]> {
  const candidates = new Set<string>(['C:\\Program Files (x86)\\Steam','C:\\Program Files\\Steam','D:\\Steam','E:\\Steam'])
  if (process.platform === 'win32') {
    const output = await new Promise<string>(resolve => execFile('reg.exe',['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath'],{windowsHide:true,timeout:3000,maxBuffer:65536},(_error,stdout)=>resolve(String(stdout||''))))
    const installed = /SteamPath\s+REG_SZ\s+([^\r\n]+)/i.exec(output)?.[1]
    if (installed) candidates.add(installed.trim())
  }
  const libraries = new Set<string>()
  for (const root of candidates) {
    if (!fs.existsSync(root)) continue
    libraries.add(root)
    const file = path.join(root,'steamapps','libraryfolders.vdf')
    try {
      if (fs.statSync(file).size > 1024*1024) continue
      for (const match of fs.readFileSync(file,'utf8').matchAll(/"path"\s+"([^"]+)"/g)) {
        const folder = match[1].replace(/\\\\/g,'\\')
        if (path.isAbsolute(folder) && fs.existsSync(folder)) libraries.add(folder)
      }
    } catch {}
  }
  return [...libraries]
}

export function gsiConfiguration(game: GsiGameId, token: string): string {
  if (!/^[a-f\d]{64}$/.test(token)) throw new Error('Invalid GSI token')
  const data = game === 'cs2' ? ['provider','map','round','player_id','player_state','player_match_stats'] : ['provider','map','player']
  return `"Eclipse GSI Integration"\n{\n    "uri" "http://127.0.0.1:${game === 'cs2' ? 13371 : 13372}"\n    "timeout" "5.0"\n    "buffer" "0.1"\n    "throttle" "0.2"\n    "heartbeat" "15.0"\n    "auth" { "token" "${token}" }\n    "data"\n    {\n${data.map(key=>`        "${key}" "1"`).join('\n')}\n    }\n}\n`
}

export async function installGsiConfiguration(game: GsiGameId, token: string, libraries?: string[], active = () => true): Promise<AutoClipSetupResult> {
  let installed = false, changed = false
  try {
    for (const root of libraries || await steamLibraries()) {
      if (!active()) return {success:false,error:'configuration'}
      const manifest = path.join(root,'steamapps',`appmanifest_${game === 'cs2' ? 730 : 570}.acf`)
      let directory = game === 'cs2' ? 'Counter-Strike Global Offensive' : 'dota 2 beta'
      try {
        if (fs.statSync(manifest).size < 131072) directory = /"installdir"\s+"([^"\\/]+)"/.exec(fs.readFileSync(manifest,'utf8'))?.[1] || directory
      } catch {}
      if (directory === '.' || directory === '..') continue
      const gameRoot = path.join(root,'steamapps','common',directory)
      const cfg = path.join(gameRoot,'game',game === 'cs2' ? 'csgo' : 'dota','cfg')
      if (!fs.existsSync(cfg)) continue
      const realRoot = fs.realpathSync(gameRoot), realCfg = fs.realpathSync(cfg)
      if (path.relative(realRoot,realCfg).split(path.sep).includes('..') || path.isAbsolute(path.relative(realRoot,realCfg))) return {success:false,error:'configuration'}
      const parent = game === 'dota2' ? path.join(cfg,'gamestate_integration') : cfg
      fs.mkdirSync(parent,{recursive:true})
      if (fs.realpathSync(parent) !== path.join(realCfg,game === 'dota2' ? 'gamestate_integration' : '')) return {success:false,error:'configuration'}
      const target = path.join(parent,'gamestate_integration_eclipse.cfg'), content = gsiConfiguration(game,token)
      if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isSymbolicLink() || fs.statSync(target).size > 16384) return {success:false,error:'configuration'}
        const previous = fs.readFileSync(target,'utf8')
        if (!previous.startsWith('"Eclipse GSI Integration"')) return {success:false,error:'configuration'}
        if (previous === content) { installed = true; continue }
      }
      // Only this application's dedicated config is changed; game binaries and launch options are untouched.
      if (!active()) return {success:false,error:'configuration'}
      const temporary = path.join(parent,`.eclipse-gsi-${randomUUID()}.tmp`)
      try {
        await fs.promises.writeFile(temporary,content,{encoding:'utf8',flag:'wx'})
        if (!active()) return {success:false,error:'configuration'}
        await fs.promises.rename(temporary,target)
      } finally { await fs.promises.unlink(temporary).catch(()=>{}) }
      installed = true; changed = true
    }
    return installed ? {success:true,changed} : {success:false,error:'not-installed'}
  } catch { return {success:false,error:'configuration'} }
}
