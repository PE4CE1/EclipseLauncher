const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs')
const host=path.resolve(__dirname,'../electron/native/NativeCaptureHost.exe'),skip=process.platform!=='win32'||!fs.existsSync(host)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function fixture(t){
  const values=['space value','a"b','C:\\trailing\\','Grüße 🎬']
  const child=spawn(host,[process.execPath,'-e','console.log(JSON.stringify({pid:process.pid,args:process.argv.slice(1)}));setInterval(()=>{},1000)',...values],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  t.after(()=>{if(child.exitCode===null)child.kill()})
  const data=await new Promise((resolve,reject)=>{let out='';const timeout=setTimeout(()=>reject(new Error('Native capture host startup timed out')),5000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Native capture host exited: '+code))});child.stdout.on('data',bytes=>{out+=String(bytes);if(out.includes('\n')){clearTimeout(timeout);resolve(JSON.parse(out.trim()))}})})
  assert.deepEqual(data.args,values,'Windows command-line quoting must preserve exact paths, quotes and Unicode')
  return{child,pid:data.pid}
}
async function assertExited(pid){for(let i=0;i<40;i++){try{process.kill(pid,0)}catch(error){assert.equal(error.code,'ESRCH');return}await wait(50)}assert.fail('Native recorder outlived its capture host')}
test('native capture lifetime guard terminates its recorder after a host crash',{skip},async t=>{const f=await fixture(t);f.child.kill();await assertExited(f.pid)})
test('native capture lifetime guard terminates its recorder when the Electron pipe closes',{skip},async t=>{const f=await fixture(t);f.child.stdin.end();await assertExited(f.pid)})
test('native capture host returns an immediate encoder failure without waiting for stdin to close',{skip},async t=>{
  const child=spawn(host,[process.execPath,'-e','process.exit(7)'],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  t.after(()=>{if(child.exitCode===null)child.kill()})
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Capture host did not return encoder failure')),2000);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);resolve(code)})})
  assert.equal(code,7)
})
