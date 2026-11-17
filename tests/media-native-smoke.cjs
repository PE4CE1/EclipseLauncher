const assert=require('node:assert/strict')
const {MediaTransport}=require('./download-loader.cjs')()('electron/mediaTransport.ts')

// Read-only against real Windows players; the control check targets a nonexistent session.
;(async()=>{
  if(process.platform!=='win32')throw new Error('This check requires Windows')
  const client=new MediaTransport()
  try{
    for(const filter of ['spotify','all','spotify']){
      const reply=await client.send('GET',filter)
      assert.ok(reply?.Success&&!reply.Error,'The native media query must complete')
      if(reply.Cover)assert.match(reply.Cover,/^data:image\/(png|jpeg|webp|bmp);base64,/)
      console.log(JSON.stringify({filter,success:reply.Success,app:reply.App,session:!!reply.SessionId,hasCover:reply.HasCover,coverBytes:reply.Cover?.length||0}))
    }
    const missing=await client.send('TOGGLE','spotify','Eclipse.Nonexistent.TestSession')
    assert.equal(missing?.Success,false)
    assert.equal(missing?.App,null)
    console.log(JSON.stringify({missingTargetFailsSafely:true}))
  }finally{client.stop()}
})().catch(error=>{console.error(error.message);process.exitCode=1})
