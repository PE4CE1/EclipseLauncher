const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),load=require('./download-loader.cjs')

test('a repaired secure key survives stale legacy writes and external repairs refresh the native cache',async t=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'.account-identity-'))
 t.after(()=>{assert.equal(path.dirname(directory),__dirname);fs.rmSync(directory,{recursive:true,force:true})})
 let registry=null
 const service=load({os:{homedir:()=>directory,hostname:()=> 'fixture',arch:()=> 'x64'},'./ipcSecurity':{ipcMain:{}},child_process:{
  execFileSync:(_file,args)=>{if(args.includes('MachineGuid'))return 'MachineGuid REG_SZ 12345678-abcd-1234-abcd-123456789abc';if(registry)return 'Payload REG_SZ '+registry;throw Error('Missing fixture registry')},
  execFile:(_file,args,_options,callback)=>{if(args[0]==='add'){registry=args[args.indexOf('/d')+1];setImmediate(()=>callback(null,'',''))}else setImmediate(()=>callback(registry?null:Error('Missing fixture registry'),registry?'Payload REG_SZ '+registry:'',''))},
 }})('electron/accountPersistenceService.ts')
 const key='ECL-SEC-ABCDEFGH-JKLMNPQR-STUVWXYZ-23456789'
 await service.savePersistentIdentity({canonicalUid:'owner',friendCode:'ECL-TEST1',accountSecret:key})
 await service.savePersistentIdentity({canonicalUid:'owner',accountSecret:'OLD-PUBLIC-KEY'})
 assert.equal(service.loadPersistentIdentitySync().accountSecret,key)
 const file=path.join(directory,'.eclipse_launcher_identity.json'),data=JSON.parse(fs.readFileSync(file,'utf8'))
 const newer={...data,lastUpdated:data.lastUpdated+1000,accountSecret:'ECL-SEC-23456789-ABCDEFGH-JKLMNPQR-STUVWXYZ'}
 fs.writeFileSync(file,JSON.stringify(newer))
 assert.equal((await service.loadPersistentIdentity()).accountSecret,newer.accountSecret)
 assert.equal(JSON.parse(Buffer.from(registry,'base64').toString()).accountSecret,newer.accountSecret)
})
