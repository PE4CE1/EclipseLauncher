// Explicit integration probe. --collector never requests elevation or changes Windows permissions.
const net=require('node:net')
const {spawn}=require('node:child_process')
const {randomBytes}=require('node:crypto')
const path=require('node:path')
const fs=require('node:fs')
const assert=require('node:assert/strict')

async function probe(wrongParent=false){
  const name='EclipseFps_'+randomBytes(16).toString('hex')
  const report={ready:false,status:'not-started',wrongParent}
  let socket,child,timer,tail=''
  const server=net.createServer(connection=>{
    socket=connection;socket.setEncoding('utf8')
    socket.on('error',()=>{})
    socket.on('data',chunk=>{
      tail+=chunk
      const lines=tail.split(/\r?\n/);tail=lines.pop()||''
      for(const line of lines){
        if(line==='!ready'){report.ready=true;socket.write('target:'+process.pid+'\n');setTimeout(()=>socket.end('close\n'),1500)}
        if(line.startsWith('!status\t'))report.status=line.split('\t')[2]
        if(line.startsWith('!csv\t'))report.status='csv-received'
      }
    })
  })
  try{
    const address = String.fromCharCode(92,92,46,92) + 'pipe' + String.fromCharCode(92) + name
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(address,resolve)})
    const code=await new Promise((resolve,reject)=>{
      child=spawn(path.resolve(__dirname,'../electron/native/PresentMon/FpsBroker.exe'),[name,String(process.pid+(wrongParent?1:0)),'--collector'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
      child.stderr.on('data',data=>process.stderr.write(data))
      child.once('error',reject);child.once('exit',resolve)
      timer=setTimeout(()=>{child.kill();reject(new Error('Native FPS broker did not shut down'))},12000)
    })
    report.exitCode=code
    assert.equal(code,wrongParent?5:0)
    assert.equal(report.ready,!wrongParent)
    return report
  }finally{clearTimeout(timer);socket?.destroy();if(server.listening)server.close()}
}
;(async()=>{
  const result={native:await probe(),rejectsWrongParent:await probe(true)}
  fs.mkdirSync(path.resolve(__dirname,'../.cache/overlay-audit'),{recursive:true})
  fs.writeFileSync(path.resolve(__dirname,'../.cache/overlay-audit/broker-native.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
})().catch(error=>{console.error(error);process.exitCode=1})
