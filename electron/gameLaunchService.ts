import { spawnExternalApplication, type LaunchedProcess } from './externalLaunch'
import fs from 'node:fs'
import path from 'node:path'
import { riotClientExecutable } from './nonSteamDiscovery'

export async function launchRiotGame(target: string): Promise<void> {
  const match = /^eclipse-game:\/\/riot\/(valorant|league_of_legends)$/.exec(target)
  if (!match) throw new Error('Unsupported Riot game launch target')
  const client = await riotClientExecutable()
  if (!client) throw new Error('Riot Client is not installed. Open Riot Client and repair the installation.')
  // Riot Client owns authentication and Vanguard startup. The outside broker
  // also prevents Vanguard and the game from inheriting Eclipse's memory cap.
  const child = await spawnExternalApplication(client, [`--launch-product=${match[1]}`, '--launch-patchline=live'], path.dirname(client))
  child.unref()
}

export async function launchExecutable(executable: string, onExit: (child: LaunchedProcess) => void): Promise<LaunchedProcess> {
  if (typeof executable !== 'string' || !path.isAbsolute(executable) || !/\.exe$/i.test(executable)) {
    throw new Error('Select an absolute path to a game executable')
  }
  if (!(await fs.promises.stat(executable)).isFile()) throw new Error('Game executable is not a file')
  const child = await spawnExternalApplication(executable, [], path.dirname(executable))
  child.once('exit', () => onExit(child))
  return child
}
