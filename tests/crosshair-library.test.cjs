const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {inspectCrosshairWebp}=load()('src/services/crosshairWebp.ts')
const {isCrosshairAssetUrl,fetchCrosshairImage}=load()('electron/crosshairLibraryService.ts')
const {libraryPageUrl}=load()('src/services/crosshairLibrary.ts')
const {validCrosshairImage,normalizeCrosshair}=load()('src/services/crosshairConfig.ts')
function webp(width=32,height=32,frames=0,frameSize=width){
  const chunk=(name,bytes)=>{const b=Buffer.alloc(8+bytes.length+(bytes.length&1));b.write(name);b.writeUInt32LE(bytes.length,4);bytes.copy(b,8);return b}
  const header=Buffer.alloc(10);header[0]=16|(frames?2:0);header.writeUIntLE(width-1,4,3);header.writeUIntLE(height-1,7,3)
  const frame=Buffer.alloc(16);frame.writeUIntLE(frameSize-1,6,3);frame.writeUIntLE(Math.min(frameSize,height)-1,9,3)
  const payload=Buffer.concat([Buffer.from('WEBP'),chunk('VP8X',header),...Array.from({length:frames},()=>chunk('ANMF',frame))])
  const riff=Buffer.alloc(8);riff.write('RIFF');riff.writeUInt32LE(payload.length,4);return Buffer.concat([riff,payload])
}
test('library URLs stay on the provider including paginated collections',()=>{
  for(const path of ['/crosshairs/','/crosshairs/animated/page/2/','/crosshairs/collection/dot-crosshairs/page/3/'])assert.ok(libraryPageUrl(path).startsWith('https://centerpointgaming.com/'))
  for(const path of ['https://evil.example/crosshairs/all/','https://user@centerpointgaming.com/crosshairs/all/','/crosshairs/all/?redirect=evil','/assets/image.webp','javascript:alert(1)'])assert.throws(()=>libraryPageUrl(path))
  assert.equal(isCrosshairAssetUrl('https://centerpointgaming.com/assets/crosshairs/example-123.webp'),true)
  for(const url of ['https://centerpointgaming.com.evil/assets/crosshairs/a.webp','http://centerpointgaming.com/assets/crosshairs/a.webp','https://centerpointgaming.com/assets/crosshairs/a.svg','https://centerpointgaming.com/assets/crosshairs/a.webp?x=1'])assert.equal(isCrosshairAssetUrl(url),false)
})
test('static and animated WebP remain inline images with bounded decode cost',()=>{
  for(const frames of [0,5]){const bytes=webp(32,32,frames),data='data:image/webp;base64,'+bytes.toString('base64');assert.deepEqual(inspectCrosshairWebp(bytes),{width:32,height:32,animated:!!frames,frames});assert.equal(validCrosshairImage(data),true);assert.equal(normalizeCrosshair({mode:'image',imageData:data}).mode,'image')}
  assert.equal(inspectCrosshairWebp(webp(640,640)).width,640)
  assert.equal(inspectCrosshairWebp(webp(498,498,13)).frames,13)
  assert.equal(inspectCrosshairWebp(webp(800,800,40,1)).frames,40,'Sparse updates must not be charged as full canvases')
  assert.throws(()=>inspectCrosshairWebp(webp(800,800,1200,1)),'Worst-case composited frame caching must remain bounded')
  assert.throws(()=>inspectCrosshairWebp(webp(2049,32)))
  assert.throws(()=>inspectCrosshairWebp(webp(512,512,65)))
  assert.throws(()=>inspectCrosshairWebp(webp(2,2,1501)))
  assert.throws(()=>inspectCrosshairWebp(webp(16,16,2,32)))
  assert.throws(()=>inspectCrosshairWebp(webp().subarray(0,29)))
  assert.equal(validCrosshairImage('data:image/webp;base64,'+webp(2049,2049).toString('base64')),false)
})
test('native downloads reject HTML, redirects, oversized streams and truncated images',async()=>{
  const previous=global.fetch,url='https://centerpointgaming.com/assets/crosshairs/a.webp'
  try{
    let options;const bytes=webp(32,32,2)
    global.fetch=async(_url,init)=>{options=init;return new Response(bytes,{headers:{'content-type':'image/webp'}})}
    const result=await fetchCrosshairImage(url);assert.equal(result.imageData,'data:image/webp;base64,'+bytes.toString('base64'));assert.equal(result.animated,true);assert.equal(options.redirect,'error');assert.ok(options.signal)
    global.fetch=async()=>new Response(webp(640,480),{headers:{'content-type':'image/webp'}})
    const source=await fetchCrosshairImage(url);assert.equal(source.width,640);assert.equal(source.height,480);assert.equal(source.animated,false)
    for(const response of [new Response('<html/>',{headers:{'content-type':'text/html'}}),new Response(bytes,{headers:{'content-type':'image/webp','content-length':3*1024*1024}}),new Response(Buffer.alloc(2*1024*1024+1),{headers:{'content-type':'image/webp'}}),new Response(bytes.subarray(0,25),{headers:{'content-type':'image/webp'}})]){global.fetch=async()=>response;await assert.rejects(fetchCrosshairImage(url))}
    global.fetch=()=>assert.fail('Invalid addresses must not be requested');await assert.rejects(fetchCrosshairImage('http://127.0.0.1/image.webp'))
  }finally{global.fetch=previous}
})
