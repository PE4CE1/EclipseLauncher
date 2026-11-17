const path=require('node:path'),{spawn}=require('node:child_process')
;(async()=>{
  const {createServer}=await import('vite')
  const server=await createServer({configFile:path.join(__dirname,'overlay-dev.vite.mts')})
  try{
    await server.listen()
    const port=server.httpServer.address().port
    const code=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[path.join(__dirname,'run-electron-smoke.cjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,ECLIPSE_OVERLAY_RUNTIME:'1',ECLIPSE_OVERLAY_APPEARANCE:'1',VITE_DEV_SERVER_URL:`http://127.0.0.1:${port}/`}})
      child.once('error',reject);child.once('exit',resolve)
    })
    if(code!==0)throw new Error('Development overlay appearance test failed')
  }finally{await server.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
