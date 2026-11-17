const test=require('node:test'),assert=require('node:assert/strict')
const {chooseUploadDimensions}=require('./download-loader.cjs')()('electron/uploadQuality.ts')
const options={source:'fixture.mp4',cropWidth:1920,cropHeight:1080,cropX:0,fps:60,rate:2_450_000,encoder:'h264_nvenc',ranges:[{start:10,end:20},{start:30,end:50}],full:[1920,1080],suggested:[1280,720]}

function runner(scores){let score=0;const calls=[];return{calls,run:async(args,timeout)=>{
  assert.ok(timeout>0&&timeout<=2500);calls.push(args)
  if(args.some(arg=>String(arg).includes('libvmaf')))return{stderr:'VMAF score: '+scores[score++]}
  return{stderr:''}
}}}
test('the real picture comparison keeps 1080p when lower resolution loses more detail',async()=>{
  const f=runner([91,89,85,87])
  assert.deepEqual(await chooseUploadDimensions(options,f.run),[1920,1080])
  assert.equal(f.calls.length,8)
  const inputs=f.calls.filter(args=>args.includes('-vf'))
  assert.ok(inputs.every(args=>{const at=Number(args[args.indexOf('-ss')+1]);return at>=10&&at<20||at>=30&&at<50}),'Samples must come from retained footage')
})
test('the real picture comparison chooses 720p when its cleaner compression scores higher',async()=>{
  const f=runner([75,79,88,86]);assert.deepEqual(await chooseUploadDimensions(options,f.run),[1280,720])
})
test('close scores prefer the higher resolution and unsupported metrics fall back without breaking exports',async()=>{
  assert.deepEqual(await chooseUploadDimensions(options,runner([88,88,88.2,88.2]).run),[1920,1080])
  assert.deepEqual(await chooseUploadDimensions(options,async()=>{throw Error('Metric unavailable')}),[1280,720])
  assert.deepEqual(await chooseUploadDimensions({...options,suggested:[1920,1080]},async()=>{throw Error('No probe needed')}),[1920,1080])
})
