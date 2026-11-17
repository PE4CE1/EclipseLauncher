const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const loadTs = require('./download-loader.cjs')

test('CS2 GSI bounds requests, authenticates events and ignores spectated players', async t => {
  const events = []
  const { createCS2RequestHandler, initAutoClipService } = loadTs({
    electron: {},
    fs: { existsSync: () => false },
    child_process: { exec: (_cmd, callback) => callback(new Error('No Steam fixture')) },
  })('electron/autoClipService.ts')
  initAutoClipService(() => ({ isDestroyed: () => false, webContents: { send: (_name, payload) => events.push(payload) } }))
  const rules = { autoClipEnabled:true, autoClipCS2Kills:true, autoClipCS2Wins:true }
  const server = http.createServer(createCS2RequestHandler(rules, 'test-token'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const url = `http://127.0.0.1:${server.address().port}`
  const payload = kills => ({ auth: { token: 'test-token' }, provider: { appid:730,steamid:'76561198000000001' }, player: { steamid:'76561198000000001',activity:'playing',match_stats:{kills},team:'CT' }, map: {name:'test-map',phase:'live',round:0} })
  assert.equal((await fetch(url)).status, 405)
  assert.equal((await fetch(url, { method: 'POST', body: 'invalid' })).status, 400)
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ auth: { token: 'wrong' } }) })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(300 * 1024) })).status, 413)
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(payload(0)) })).status, 200)
  assert.equal((await fetch(url, {method:'POST',headers:{Origin:'https://example.com'},body:JSON.stringify(payload(0))})).status,403)
  const spectator = payload(20); spectator.player.steamid = '76561198000000002'
  await fetch(url, { method: 'POST', body: JSON.stringify(spectator) })
  assert.equal(events.length, 0)
  await fetch(url, { method: 'POST', body: JSON.stringify(payload(1)) })
  assert.equal(events.length,0,'Returning from spectating must establish a fresh baseline')
  await fetch(url, { method: 'POST', body: JSON.stringify(payload(2)) })
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'kill')
  const won=payload(2);won.round={phase:'over',win_team:'CT'}
  await fetch(url,{method:'POST',body:JSON.stringify(won)})
  assert.equal(events.length,1,'Kills and wins share the cooldown')
  rules.autoClipEnabled=false
  await fetch(url,{method:'POST',body:JSON.stringify(payload(3))})
  assert.equal(events.length,1,'Current settings apply without restarting the handler')
})
