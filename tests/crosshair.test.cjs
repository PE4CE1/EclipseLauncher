const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {CROSSHAIR_PRESETS,normalizeCrosshair,crosshairExtent,crosshairSegments,validCrosshairImage}=load()('src/services/crosshairConfig.ts')
const {crosshairPngDimensions,importCrosshairPng}=load()('src/services/crosshairImage.ts')
function header(width,height){const bytes=Buffer.alloc(33);bytes.writeUInt32BE(0x89504e47,0);bytes.writeUInt32BE(0x0d0a1a0a,4);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes}
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)
test('crosshair presets have distinct bounded geometry and fit their actual SVG viewport',()=>{
  assert.ok(Object.keys(CROSSHAIR_PRESETS).length>=16)
  for(const [preset,values]of Object.entries(CROSSHAIR_PRESETS)){
    const cfg=normalizeCrosshair({...values,preset}),extent=crosshairExtent(cfg)
    assert.equal(cfg.preset,preset);assert.ok(Number.isFinite(extent)&&extent>=80)
    for(const arm of crosshairSegments(cfg))for(const coordinate of Object.values(arm))assert.ok(Math.abs(coordinate)+cfg.thickness/2<extent/2)
  }
})
test('diagonal crosshairs use four symmetric arms rather than the old asymmetric chevrons',()=>{
  const cfg=normalizeCrosshair({preset:'x'}),arms=crosshairSegments(cfg)
  assert.equal(arms.length,4)
  for(const arm of arms){assert.ok(Math.abs(Math.abs(arm.x1)-Math.abs(arm.y1))<1e-8);assert.ok(Math.abs(Math.abs(arm.x2)-Math.abs(arm.y2))<1e-8);assert.ok(Math.abs(Math.hypot(arm.x2-arm.x1,arm.y2-arm.y1)-cfg.size)<1e-8)}
  assert.equal(crosshairSegments(normalizeCrosshair({preset:'tStyle'})).length,3)
})
test('crosshair normalization preserves legacy settings and clamps malformed geometry and colors',()=>{
  const cfg=normalizeCrosshair({preset:'__proto__',color:'url(https://invalid)',size:Infinity,gap:-20,rotation:999,offsetX:999,thickness:999,opacity:NaN,style:'invalid'})
  assert.equal(cfg.preset,'custom');assert.equal(cfg.color,'#00ff88');assert.equal(cfg.gap,0);assert.equal(cfg.rotation,360);assert.equal(cfg.offsetX,200);assert.equal(cfg.thickness,8);assert.equal(cfg.opacity,.95);assert.equal(cfg.style,'cross')
  assert.equal(normalizeCrosshair({preset:'classic',size:9,outline:true}).size,9)
})
test('PNG headers are validated before any image decoder is allowed to allocate pixels',async()=>{
  assert.deepEqual(crosshairPngDimensions(arrayBuffer(header(32,48))),{width:32,height:48})
  assert.throws(()=>crosshairPngDimensions(arrayBuffer(header(100000,100000))),error=>error.code==='dimensions')
  assert.throws(()=>crosshairPngDimensions(new ArrayBuffer(0)),error=>error.code==='format')
  assert.throws(()=>crosshairPngDimensions(new ArrayBuffer(2*1024*1024+1)),error=>error.code==='size')
  await assert.rejects(importCrosshairPng({size:3*1024*1024,arrayBuffer:()=>assert.fail('Oversized files must not be read')}),error=>error.code==='size')
})
test('only bounded inline PNG data is accepted by the overlay image renderer',()=>{
  assert.equal(validCrosshairImage('https://example.com/image.png'),false)
  assert.equal(validCrosshairImage('data:image/svg+xml;base64,PHN2Zy8+'),false)
  const png='data:image/png;base64,'+header(64,64).toString('base64')
  assert.equal(validCrosshairImage(png),true)
  assert.equal(validCrosshairImage('data:image/png;base64,'+header(4096,4096).toString('base64')),false)
  assert.equal(normalizeCrosshair({mode:'image',imageData:'javascript:alert(1)'}).mode,'shape')
  assert.equal(normalizeCrosshair({mode:'image',imageData:png,imageSize:64}).mode,'image')
})
