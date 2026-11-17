const { app, session, net } = require('electron')
const fs = require('node:fs'), path = require('node:path')
const loadTs = require('./download-loader.cjs')
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const { requestHosterPage } = loadTs({ electron:{net} })('electron/hosterRequest.ts')
  const ses = session.fromPartition('hoster-transport-audit')
  const agent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
  const urls = ['https://buzzheavier.com/f/GUfT7SopAAA', 'https://vikingfile.com/f/aYDEJnTQm6', 'https://akirabox.com/qPez4rAMmOYn/file', 'https://filekeeper.net/nf0kf1h2nnru/Potato_Please_-_SteamGG.NET.zip', 'https://datanodes.to/jqejx3e15fd5']
  const results = []
  for (const original of urls) {
    let url = original
    const result = { host:new URL(url).hostname, path:new URL(url).pathname }
    try {
      const response = await fetch(url,{method:'GET',redirect:'manual',headers:{'User-Agent':agent},signal:AbortSignal.timeout(7000)})
      result.nodeStatus = response.status; await response.body?.cancel()
    } catch(error) { result.nodeError = error.cause?.code || error.message }
    try {
      for (let hop=0;hop<6;hop++) {
        const response = await requestHosterPage(ses,url,{method:'GET',headers:{'User-Agent':agent},signal:AbortSignal.timeout(8000)})
        if ([301,302,303,307,308].includes(response.status)) { url = new URL(response.headers.get('location'),url).href; continue }
        result.nativeStatus = response.status; result.type = response.headers.get('content-type'); result.challenge = response.headers.get('cf-mitigated')
        if(response.ok&&/html/i.test(result.type||'')) {
          const html=await response.text()
          if(original.includes('buzzheavier.com/f/')) {
            fs.writeFileSync(path.join(__dirname,'../.cache/buzz-live.html'),html)
            result.downloadElements = [...html.matchAll(/<(?:a|button)[^>]*(?:download|hx-get)[^>]*>/gi)].map(match=>match[0]).slice(0,10)
            result.scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(match=>match[1]).slice(0,10)
          }
        }
        break
      }
    } catch(error) { result.nativeError=error.message }
    results.push(result)
  }
  fs.mkdirSync(path.join(__dirname, '../.cache'), { recursive: true })
  fs.writeFileSync(path.join(__dirname,'../.cache/hoster-transport-audit.json'),JSON.stringify({checkedAt:new Date().toISOString(),metadataOnly:true,results},null,2))
  console.log(JSON.stringify(results)); app.exit(0)
}).catch(error=>{console.error(error.message);app.exit(1)})
