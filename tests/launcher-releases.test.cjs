const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs')
const record={id:132,tag_name:'v1.3.2',name:'Clip engine update',body:'## Changes\n- **Engine:** Replay improvements.',published_at:'2026-09-28T22:00:00Z',html_url:'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.3.2'}
const fixture=fetch=>loadTs({'./httpClient':{desktopFetch:fetch}})('src/services/launcherReleases.ts')
const service=fixture(()=>{throw Error('No unexpected fetch')})
test('GitHub release normalization never fabricates the installed application version',()=>{
  assert.equal(service.normalizeLauncherRelease(record).tag_name,'v1.3.2')
  for(const value of [null,{}, {...record,draft:true},{...record,prerelease:true},{...record,tag_name:''},{...record,published_at:'bad'}])assert.equal(service.normalizeLauncherRelease(value),null)
  assert.equal(service.normalizeLauncherRelease({...record,body:'x'.repeat(200001)}).body.length,200000)
})
test('release source links stay within the actual GitHub repository',()=>{
  assert.equal(service.safeReleaseUrl(record.html_url),record.html_url)
  for(const value of ['javascript:alert(1)','https://example.com/update','https://github.com/Other/Repo/releases/tag/2','http://github.com/PE4CE1/EclipseLauncher/releases/tag/v2'])assert.equal(service.safeReleaseUrl(value),service.RELEASES_URL)
})
test('latest release comes from GitHub latest, with distinct empty/error states and no local fallback',async()=>{
  let requested
  const success=fixture(async(url,options)=>{requested={url,options};return Response.json(record)})
  assert.equal((await success.fetchLatestLauncherRelease()).tag_name,'v1.3.2')
  assert.ok(requested.url.endsWith('/releases/latest'));assert.ok(requested.options.signal)
  assert.equal(await fixture(async()=>new Response('',{status:404})).fetchLatestLauncherRelease(),null)
  await assert.rejects(fixture(async()=>new Response('',{status:403})).fetchLatestLauncherRelease(),/403/)
  await assert.rejects(fixture(async()=>Response.json({})).fetchLatestLauncherRelease(),/Invalid/)
})
test('history filters drafts, prereleases and duplicates instead of filling with fake release notes',async()=>{
  const items=[record,{...record,body:'duplicate'},{...record,id:133,tag_name:'v2.0.0-beta',prerelease:true},{...record,id:134,tag_name:'v2.0.0',draft:true},{...record,id:131,tag_name:'v1.3.1'}]
  assert.deepEqual((await fixture(async()=>Response.json(items)).fetchLauncherReleaseHistory()).map(item=>item.tag_name),['v1.3.2','v1.3.1'])
  assert.deepEqual(await fixture(async()=>new Response('',{status:404})).fetchLauncherReleaseHistory(),[])
})
test('release deadline includes the response body and propagates caller cancellation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let signal
  const api=fixture(async(_url,options)=>{signal=options.signal;return{ok:true,status:200,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}})
  const timed=api.fetchLatestLauncherRelease();await Promise.resolve();t.mock.timers.tick(8000)
  await assert.rejects(timed,{name:'AbortError'});assert.equal(signal.aborted,true)
  const controller=new AbortController(),cancelled=api.fetchLatestLauncherRelease(controller.signal)
  await Promise.resolve();controller.abort();await assert.rejects(cancelled,{name:'AbortError'})
})
test('release notes preserve headings, full titles, continuations, nested lists, paragraphs and code',()=>{
  const text='## Capture\n- **A complete long feature title:** Uses `60 FPS` and **real frames**.\n  Continuation text.\n  - Nested detail\n\n## Editor\n1. **Drafts:** Saved on disk.\n\nA normal paragraph without bullets.\n\n```sh\nnpm run build\n```'
  const sections=service.parseReleaseNotes(text)
  assert.deepEqual(sections.map(item=>item.title),['Capture','Editor'])
  assert.equal(sections[0].blocks[0].title,'A complete long feature title')
  assert.equal(sections[0].blocks[0].text,'Uses `60 FPS` and **real frames**. Continuation text.')
  assert.equal(sections[0].blocks[1].nested,true)
  assert.equal(sections[1].blocks[1].kind,'paragraph')
  assert.equal(sections[1].blocks[2].kind,'code');assert.equal(sections[1].blocks[2].text,'npm run build')
})
test('release parser handles non-bullet notes and strips HTML rather than inserting remote markup',()=>{
  const result=service.parseReleaseNotes('<script>attack()</script>## Notes\nA plain note.<br>Another line.\n\n- [x] **Fixed:** Safe text <img src=x onerror=attack()>')
  assert.ok(!JSON.stringify(result).includes('attack'))
  assert.equal(result[0].blocks[0].text,'A plain note. Another line.')
  assert.equal(result[0].blocks[1].title,'Fixed')
  assert.deepEqual(service.parseReleaseNotes(''),[])
})
