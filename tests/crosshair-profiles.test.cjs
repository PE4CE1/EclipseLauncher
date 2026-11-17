const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {normalizeCrosshair,DEFAULT_CROSSHAIR,CROSSHAIR_PRESETS}=load()('src/services/crosshairConfig.ts')
const {crosshairProfileKey,normalizeCrosshairProfiles,rememberCrosshair,restoreCrosshair}=load()('src/services/crosshairProfiles.ts')
const preset=id=>normalizeCrosshair({...DEFAULT_CROSSHAIR,...CROSSHAIR_PRESETS[id],preset:id,profileId:`preset:${id}`})
test('different crosshairs restore their own position, size, rotation and appearance after a JSON round-trip',()=>{
  const a={...preset('x'),offsetX:17,offsetY:-8,imageSize:76,rotation:45,opacity:.5},b={...preset('circle'),offsetX:-5,offsetY:12,imageSize:122,rotation:0,opacity:.8}
  const saved=normalizeCrosshairProfiles(JSON.parse(JSON.stringify(rememberCrosshair(rememberCrosshair({},a),b))))
  for(const original of [a,b]){const restored=restoreCrosshair(saved,preset(original.preset));for(const key of ['offsetX','offsetY','imageSize','rotation','opacity'])assert.equal(restored[key],original[key])}
  assert.equal(restoreCrosshair(saved,preset('square')).offsetX,0,'New designs must start centered')
  assert.equal(crosshairProfileKey(normalizeCrosshair({...a,preset:'custom',style:'diamond'})),'preset:x','Editing geometry must retain the selected design identity')
})
test('local images use content identity while library designs use their stable page address',()=>{
  const a={...preset('x'),mode:'image',imageData:'local-png-one',imageName:'same-name.png'},b={...a,imageData:'local-png-two'}
  assert.notEqual(crosshairProfileKey(a),crosshairProfileKey(b))
  assert.equal(crosshairProfileKey(a),crosshairProfileKey({...a,imageName:'renamed.png'}))
  assert.equal(crosshairProfileKey({...a,imageSource:'https://centerpointgaming.com/crosshairs/one/'}),'library:one')
})
test('saved profiles are bounded, sanitized, and never contain duplicate image bytes or prototype keys',()=>{
  const saved=rememberCrosshair({}, {...preset('x'),imageData:'not duplicated',imageName:'not duplicated',offsetX:12345,color:'invalid'})
  assert.equal(saved['preset:x'].offsetX,200);assert.equal(saved['preset:x'].color,'#00ff88');assert.equal(saved['preset:x'].imageData,undefined)
  const normalized=normalizeCrosshairProfiles(JSON.parse('{"__proto__":{"offsetX":100},"library:valid":{"offsetX":-9999,"imageSize":999,"imageData":"ignored"},"bad:key":{}}'))
  assert.deepEqual(Object.keys(normalized),['library:valid']);assert.equal(normalized['library:valid'].offsetX,-200);assert.equal(normalized['library:valid'].imageSize,256)
  assert.equal(Object.keys(normalizeCrosshairProfiles(Object.fromEntries(Array.from({length:300},(_,i)=>[`library:item-${i}`,{}])))).length,256)
})
