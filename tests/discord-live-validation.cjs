// Explicit opt-in: briefly validate the user's currently running Fortnite game.
// No account token, user data, other people's activity or game memory is read.
if (process.env.ECLIPSE_DISCORD_LIVE !== '1') throw new Error('Set ECLIPSE_DISCORD_LIVE=1 to run the live Discord check')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const loadTs = require('./download-loader.cjs')

async function run() {
  const game = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-Process -Name 'FortniteClient-Win64-Shipping' -ErrorAction Stop | Select-Object -First 1 Id,@{Name='Started';Expression={if ($_.StartTime) {$_.StartTime.ToUniversalTime().ToString('o')}}} | ConvertTo-Json -Compress"], { windowsHide: true, encoding: 'utf8', timeout: 5000 }))
  if (!Number.isSafeInteger(game.Id) || game.Id <= 0) throw new Error('No actual Fortnite process is running')
  const load = loadTs()
  const { DiscordIpcClient } = load('electron/discordIpcClient.ts')
  const { discordActivityPayload } = load('electron/discordActivity.ts')
  const client = new DiscordIpcClient()
  const report = { currentGame: 'Fortnite', gameProcessAssociated: true, published: false, cleared: false }
  const deadline = setTimeout(() => { void client.destroy() }, 12_000)
  try {
    await client.login({ clientId: '1534714200813863136' })
    const activity = discordActivityPayload({
      name: 'Fortnite with Eclipse', statusDisplayType: 0, details: 'Playing Fortnite', state: 'with Eclipse',
      startTimestamp: Number.isFinite(Date.parse(game.Started)) ? new Date(game.Started) : new Date(),
      largeImageKey: 'https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/eclipse-logo.gif',
      largeImageText: 'Eclipse',
    })
    const accepted = await client.request('SET_ACTIVITY', { pid: game.Id, activity })
    report.published = true
    report.acceptedName = accepted?.name
    report.acceptedStatusDisplayType = accepted?.status_display_type
    report.acceptedDetails = accepted?.details
    report.imageAccepted = !!accepted?.assets?.large_image
    await new Promise(resolve => setTimeout(resolve, 1500))
    await client.request('SET_ACTIVITY', { pid: game.Id })
    report.cleared = true
  } catch (error) {
    report.error = error.message
    if (report.published && !report.cleared) { try { await client.request('SET_ACTIVITY', { pid: game.Id }); report.cleared = true } catch {} }
    process.exitCode = 1
  } finally {
    clearTimeout(deadline); await client.destroy()
    fs.mkdirSync(path.join(__dirname, '../.cache'), { recursive: true })
    fs.writeFileSync(path.join(__dirname, '../.cache/discord-live-validation.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
