const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto')
let runtime,build
try{runtime=require('../worker/node_modules/miniflare');build=require('../worker/node_modules/esbuild')}catch{}
test('private clip links authenticate, stream ranges, enforce ownership, expire and reserve quotas atomically',{skip:!runtime},async t=>{
  const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),jwk=keys.publicKey.export({format:'jwk'});jwk.kid='test-key';jwk.alg='RS256'
  const token=(uid='owner',extra={})=>{const now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),body=Buffer.from(JSON.stringify({sub:uid,aud:'eclipse-launcher-d4cd3',iss:'https://securetoken.google.com/eclipse-launcher-d4cd3',iat:now,auth_time:now,exp:now+600,...extra})).toString('base64url'),input=head+'.'+body;return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),keys.privateKey).toString('base64url')}
  const source=build.buildSync({entryPoints:[path.resolve('worker/clips/src/index.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}).outputFiles[0].text
  // The bundled local runtime currently supports dates through October 30.
  const options=runtime.convertV4MiniflareOptions({modules:true,script:source,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['CLIPS'],bindings:{FIREBASE_PROJECT_ID:'eclipse-launcher-d4cd3',MAX_CLIP_BYTES:'100000000',MAX_OWNER_BYTES:'500000000',MAX_TOTAL_BYTES:'5000000000'},outboundService:async request=>{assert.match(request.url,/^https:\/\/www.googleapis.com\/service_accounts\/v1\/jwk\//);return new Response(JSON.stringify({keys:[jwk]}),{headers:{'content-type':'application/json'}})}})
  options.telemetry={enabled:false};const mf=new runtime.Miniflare(options);t.after(()=>mf.dispose());await mf.ready
  const db=await mf.getD1Database('DB');await db.exec(fs.readFileSync('worker/clips/migrations/0001_shares.sql','utf8').replace(/\n/g,' '))
  const bucket=await mf.getR2Bucket('CLIPS');await bucket.put('probe',new Uint8Array([1,2,3]));await bucket.delete('probe')
  const send=(route,method='GET',body,auth=token(),headers={})=>mf.dispatchFetch('http://localhost'+route,{method,headers:{...(auth?{Authorization:'Bearer '+auth}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})})
  assert.equal((await send('/v1/shares','POST',{title:'clip',bytes:20},'')).status,401)
  assert.equal((await send('/v1/shares','POST',{title:'clip',bytes:20},token('owner',{exp:1}))).status,401)
  assert.equal((await send('/v1/shares','POST',{title:'clip',bytes:20},token('owner',{aud:'evil'}))).status,401)
  const bytes=Buffer.from('fake-mp4-payload-1234'),response=await send('/v1/shares','POST',{title:'<script>bad</script>',bytes:bytes.length,days:7});assert.equal(response.status,201)
  const share=await response.json(),url=new URL(share.url),id=share.id,media='/m/'+url.pathname.split('/').pop()
  assert.equal((await send(url.pathname)).status,404,'An unuploaded reservation is never public')
  assert.equal((await send('/v1/shares/'+id,'DELETE',undefined,token('other'))).status,404)
  assert.equal((await send('/v1/shares/'+id,'PUT',bytes,token(),{'Content-Type':'video/mp4','Content-Length':String(bytes.length)})).status,200)
  const page=await send(url.pathname);assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('<video controls'))
  const range=await send(media,'GET',undefined,'',{'Range':'bytes=2-6'});assert.equal(range.status,206);assert.equal(await range.text(),bytes.subarray(2,7).toString());assert.equal(range.headers.get('Content-Range'),'bytes 2-6/'+bytes.length)
  const suffix=await send(media,'GET',undefined,'',{'Range':'bytes=-4'});assert.equal(await suffix.text(),bytes.subarray(-4).toString())
  assert.equal((await send(media,'GET',undefined,'',{'Range':'bytes=10000-'})).status,416)
  const head=await send(media,'HEAD');assert.equal(head.headers.get('Content-Length'),String(bytes.length));assert.equal(await head.text(),'')
  assert.equal((await send('/v1/shares/'+id,'PUT',bytes,token(),{'Content-Type':'video/mp4','Content-Length':String(bytes.length)})).status,409)
  await db.prepare('UPDATE shares SET expires=? WHERE id=?').bind(Date.now()-1,id).run();assert.equal((await send(media)).status,404)
  assert.equal((await send('/v1/shares/'+id,'DELETE')).status,200);assert.equal((await send(url.pathname)).status,404)
  const reservations=await Promise.all(Array.from({length:12},()=>send('/v1/shares','POST',{title:'quota',bytes:10},token('quota-owner'))))
  assert.equal(reservations.filter(value=>value.status===201).length,10);assert.equal(reservations.filter(value=>value.status===429).length,2)
  const ticket=await reservations.find(value=>value.status===201).json();assert.equal((await send('/v1/shares/'+ticket.id,'DELETE',undefined,token('quota-owner'))).status,200)
  assert.equal((await send('/v1/shares','POST',{title:'delete must not reset daily quota',bytes:10},token('quota-owner'))).status,429)
})
