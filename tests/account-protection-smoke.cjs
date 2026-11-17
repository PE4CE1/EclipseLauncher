const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),output=path.join(root,'.cache/account'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.setPath('userData',process.env.ECLIPSE_SMOKE_TEMP);app.setPath('sessionData',process.env.ECLIPSE_SMOKE_TEMP)
let window;const errors=[]
app.whenReady().then(async()=>{
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:/.test(details.url)}))
 window=new BrowserWindow({show:false,width:940,height:650,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}})
 window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)})
 await window.loadFile(path.join(output,'fixture/tests/account-fixture.html'))
 const evaluate=code=>window.webContents.executeJavaScript(code,true)
 const until=async code=>{const deadline=Date.now()+8000;while(Date.now()<deadline){if(await evaluate(code))return;await wait(30)}throw Error('Account UI timeout: '+code)}
 await until('!!window.__accountFixture&&!!document.querySelector("[data-account-protection]")')
 assert.match(await evaluate('document.querySelector("[data-recovery-error]").textContent'),/This legacy profile/)
 assert.doesNotMatch(await evaluate('document.body.innerText'),/bestehende|Anmeldung|gespeicherten/)
 await evaluate('window.__accountFixture.settings({language:"de"});true')
 await until('document.querySelector("[data-recovery-error]").textContent.includes("Dieses ältere Profil")')
 await evaluate('window.__accountFixture.settings({language:"en"});window.__accountFixture.input("ECL-TEST1");true')
 await until('!document.querySelector("[data-recovery-restore]").disabled')
 await evaluate('document.querySelector("[data-recovery-restore]").click();true')
 assert.equal(await evaluate('window.__accountFixture.calls.restored.length'),0)
 assert.match(await evaluate('window.__accountFixture.notifications.at(-1)'),/Friend codes/)
 assert.equal(await evaluate('document.querySelector("[data-recovery-copy]").disabled'),true)
 await evaluate('document.querySelector("[data-recovery-setup]").click();true')
 await until('document.querySelector("[data-account-protection]").dataset.recoveryReady==="true"')
 assert.equal(await evaluate('document.querySelector("[data-recovery-copy]").disabled'),false)
 await evaluate('document.querySelector("[data-recovery-reveal]").click();true')
 await until('document.querySelector("[data-recovery-key]").textContent===window.__accountFixture.key')
 await evaluate('document.querySelector("[data-recovery-copy]").click();true')
 await until('window.__accountFixture.copied.length===1')
 assert.equal(await evaluate('window.__accountFixture.copied[0]===window.__accountFixture.key'),true)
 await evaluate('window.__accountFixture.input(window.__accountFixture.key);true')
 await evaluate('document.querySelector("[data-recovery-restore]").click();true')
 await until('window.__accountFixture.calls.restored.length===1')
 assert.equal(await evaluate('document.querySelector("[data-recovery-key]").textContent.includes("ECL-SEC-")'),false,'Restoring hides the key again')
 assert.deepEqual(errors,[])
 fs.mkdirSync(output,{recursive:true})
 for(let attempt=0;attempt<5;attempt++){
  try{window.webContents.invalidate();await wait(80);fs.writeFileSync(path.join(output,'account-protection.png'),(await window.webContents.capturePage()).toPNG());break}
  catch(error){if(attempt===4||!/UnknownVizError/.test(String(error)))throw error}
 }
 const result={legacyGermanErrorTranslated:true,liveLanguageChange:true,friendCodeRejected:true,keyShownOnlyAfterSetup:true,copyWorks:true,keyHiddenAfterRestore:true,rendererErrors:errors}
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));window.destroy();app.exit(0)
}).catch(error=>{console.error(error);window?.destroy();app.exit(1)})
setTimeout(()=>app.exit(1),30000).unref()
