const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{X509Certificate}=require('node:crypto')
const loadTs=require('./download-loader.cjs')
const {RIOT_GAME_CLIENT_CA}=loadTs()('electron/riotCertificate.ts')
function fixture(respond){
  const requests=[],agents=[]
  const https={Agent:class{constructor(options){this.options=options;agents.push(this)}destroy(){this.destroyed=true}},get(url,options,callback){
    const request=new EventEmitter();request.url=url;request.options=options;request.destroy=error=>{request.destroyed=true;queueMicrotask(()=>{if(error)request.emit('error',error);request.emit('close')})};requests.push(request)
    queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;response.resume=()=>{};callback(response);respond?.(response,request)})
    return request
  }}
  return{client:loadTs({'node:https':https})('electron/leagueLiveClient.ts').createLeagueLiveClient(),agents,requests}
}
test('the local client trusts the published Riot certificate, never globally disables TLS',async()=>{
  const certificate=new X509Certificate(RIOT_GAME_CLIENT_CA)
  assert.equal(certificate.fingerprint256,'CA:8C:9D:32:5B:4C:DC:46:4C:6C:94:A5:85:C8:5E:91:EC:23:D4:0B:A5:BF:3A:E2:82:2B:95:1A:4A:50:4E:A3')
  assert.ok(certificate.verify(certificate.publicKey));assert.match(certificate.subject,/Riot Games/)
  const f=fixture(response=>{const bytes=Buffer.from('"Eclípse#EUW"');response.emit('data',bytes.subarray(0,5));response.emit('data',bytes.subarray(5));response.emit('end')})
  assert.equal(await f.client.read('activeplayername'),'Eclípse#EUW')
  assert.equal(f.requests[0].url,'https://127.0.0.1:2999/liveclientdata/activeplayername')
  assert.equal(f.agents[0].options.ca,RIOT_GAME_CLIENT_CA);assert.notEqual(f.agents[0].options.rejectUnauthorized,false)
  assert.equal(f.requests[0].options.timeout,1500)
  await assert.rejects(f.client.read('../../remote'))
  assert.equal(f.requests.length,1)
  f.client.close();assert.equal(f.agents[0].destroyed,true)
})
test('the local client rejects malformed and oversized responses, timeout and closes pending requests',async()=>{
  for(const [response,pattern]of [[r=>{r.emit('data',Buffer.from('bad'));r.emit('end')},/Invalid/],[(r,q)=>q.emit('timeout'),/timed out/],[r=>{r.emit('data',Buffer.from('{}'));r.emit('data',Buffer.alloc(2*1024*1024+1));r.emit('end')},/too large/]]){
    const f=fixture(response);await assert.rejects(f.client.read('eventdata'),pattern);f.client.close()
  }
  const f=fixture();const pending=f.client.read('gamestats');f.client.close();await assert.rejects(pending,/stopped/)
  assert.equal(f.requests[0].destroyed,true);await assert.rejects(f.client.read('gamestats'),/Invalid/)
})
