const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {normalizeCrosshairFavorites,toggleCrosshairFavorite,MAX_CROSSHAIR_FAVORITES}=load()('src/services/crosshairFavorites.ts')
const {normalizeCrosshair,crosshairExtent}=load()('src/services/crosshairConfig.ts')
const favorite=(id='one')=>({name:`Crosshair ${id}`,page:`https://centerpointgaming.com/crosshairs/${id}/`,thumbnail:`https://centerpointgaming.com/assets/crosshairs/${id}-320.webp`})
test('crosshair favorites retain only bounded provider metadata, deduplicate, and reject unsafe links',()=>{
  const good=favorite(),data=normalizeCrosshairFavorites([good,{...good,imageData:'expensive duplicate'},null,{...favorite('two'),page:'javascript:alert(1)'},{...favorite('three'),thumbnail:'https://evil.example/a.webp'},{...favorite('four'),name:'\u0000  Sample  '}])
  assert.deepEqual(data,[good,{...favorite('four'),name:'Sample'}])
  assert.deepEqual(normalizeCrosshairFavorites(undefined),[])
  assert.equal(normalizeCrosshairFavorites(Array.from({length:MAX_CROSSHAIR_FAVORITES+20},(_,i)=>favorite(String(i)))).length,MAX_CROSSHAIR_FAVORITES)
})
test('favorites toggle independently of selection and survive a settings JSON round-trip',()=>{
  const one=favorite(),two=favorite('two'),saved=toggleCrosshairFavorite(toggleCrosshairFavorite([],one),two)
  assert.deepEqual(normalizeCrosshairFavorites(JSON.parse(JSON.stringify(saved))),[one,two])
  assert.deepEqual(toggleCrosshairFavorite(saved,one),[two])
  assert.deepEqual(saved,[one,two],'Removing a favorite must not mutate the saved array')
})
test('image size supports one-pixel reticles and enlarged images without viewport clipping',()=>{
  assert.equal(normalizeCrosshair({imageSize:-10}).imageSize,1)
  assert.equal(normalizeCrosshair({imageSize:999}).imageSize,256)
  const cfg=normalizeCrosshair({imageSize:256,rotation:45});cfg.mode='image'
  assert.ok(crosshairExtent(cfg)>256*Math.SQRT2)
})
