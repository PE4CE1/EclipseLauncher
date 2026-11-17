const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),load=require('./download-loader.cjs')
test('clip sharing streams the rendered edit, copies working links and cleans failed uploads without touching original files',async t=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'.clip-sharing-'));t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(__dirname));fs.rmSync(directory,{recursive:true,force:true})})
 const original=path.join(directory,'clip.mp4');fs.writeFileSync(original,'original');let base,fail=false,received,requestCount=0,deleted=0,copied='',lastRender
 const id='01234567-89ab-cdef-0123-456789abcdef',secret='-'.repeat(43),server=http.createServer((request,response)=>{requestCount++;assert.equal(request.headers.authorization,'Bearer header.payload.signature');const chunks=[];request.on('data',value=>chunks.push(value));request.on('end',()=>{const body=Buffer.concat(chunks);response.setHeader('Content-Type','application/json');if(request.method==='POST'){const meta=JSON.parse(body);assert.equal(meta.title,'My clip');assert.equal(meta.bytes,13);response.end(JSON.stringify({id,url:base+'/s/'+secret,expires:Date.now()+7*86400000}))}else if(request.method==='PUT'){received=body;assert.equal(request.headers['content-length'],'13');response.statusCode=fail?503:200;response.end(JSON.stringify(fail?{error:'test failure'}:{success:true}))}else if(request.method==='DELETE'){deleted++;response.end('{}')}else{response.statusCode=404;response.end('{}')}})})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close()})
 const previous=process.env.ECLIPSE_CLIP_SHARE_URL;delete process.env.ECLIPSE_CLIP_SHARE_URL;t.after(()=>{if(previous===undefined)delete process.env.ECLIPSE_CLIP_SHARE_URL;else process.env.ECLIPSE_CLIP_SHARE_URL=previous})
 const handlers=new Map(),service=load({electron:{app:{getPath:()=>directory,isPackaged:false},clipboard:{writeText:async value=>{copied=value}}},'./ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}}})('electron/clipShareService.ts')
 service.initClipSharing(async(payload,output)=>{lastRender=payload;fs.writeFileSync(output,'rendered-edit')},payload=>{assert.equal(payload.filePath,original);return payload})
 assert.equal(handlers.get('clips:share-config')().configured,false)
 process.env.ECLIPSE_CLIP_SHARE_URL=base
 const clip={filePath:original,suggestedName:'My clip',trimStart:1,trimEnd:4,cuts:[{start:2,end:3}],output:'portrait',discordVolume:.3},event={sender:{isDestroyed:()=>false,send(){}}},payload={clip,token:'header.payload.signature',days:7}
 const shared=await handlers.get('clips:share')(event,payload);assert.equal(shared.success,true,shared.error);assert.equal(copied,base+'/s/'+secret);assert.equal(received.toString(),'rendered-edit');assert.equal(lastRender.output,'portrait');assert.deepEqual(lastRender.cuts,clip.cuts);assert.equal(lastRender.discordVolume,.3)
 assert.equal(fs.readdirSync(path.join(directory,'clip_exports')).length,0);assert.equal(fs.readFileSync(original,'utf8'),'original');assert.equal(handlers.get('clips:share-links')({},original).length,1)
 copied='';await handlers.get('clips:share-copy')({},id);assert.equal(copied,base+'/s/'+secret)
 const before=requestCount;assert.equal((await handlers.get('clips:share-delete')({},{id:'invalid',token:payload.token})).success,false);assert.equal(requestCount,before)
 fail=true;assert.equal((await handlers.get('clips:share')(event,payload)).success,false);assert.equal(deleted,1);assert.equal(fs.readdirSync(path.join(directory,'clip_exports')).length,0)
 assert.equal((await handlers.get('clips:share-delete')({},{id,token:payload.token})).success,true);assert.equal(handlers.get('clips:share-links')({},original).length,0)
})

test('Discord copies enforce 20 MB before touching the clipboard and preserve the selected edit',async t=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'.clip-sharing-'));t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(__dirname));fs.rmSync(directory,{recursive:true,force:true})})
 const original=path.join(directory,'original.mp4');fs.writeFileSync(original,'untouched');const handlers=new Map(),copies=[];let rendered,bytes=19_900_001
 const service=load({electron:{app:{getPath:()=>directory,isPackaged:false},clipboard:{write:async value=>copies.push(value)},ClipboardItem:class{constructor(value){this.value=value}}},'./ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers.set(name,handler)}},'child_process':{execFile:(file,args,options,callback)=>{assert.equal(file,'powershell');assert.equal(options.windowsHide,true);assert.ok(args.some(value=>value.includes('Set-Clipboard -LiteralPath')));copies.push(args);callback(null)}}})('electron/clipShareService.ts')
 service.initClipSharing(async(payload,output)=>{rendered=payload;fs.writeFileSync(output,Buffer.alloc(bytes))},payload=>{assert.equal(payload.filePath,original);return payload})
 const payload={filePath:original,suggestedName:'Edited clip',trimStart:1,trimEnd:8,cuts:[{start:3,end:4}],output:'portrait',cropX:.3,gameVolume:.65,micVolume:0,discordVolume:.2,maxBytes:100_000_000}
 const result=await handlers.get('clips:copy-edited')({},payload)
 assert.equal(result.success,true,result.error);assert.equal(result.bytes,bytes);assert.equal(rendered.maxBytes,20_000_000);assert.deepEqual(rendered.cuts,payload.cuts);assert.equal(rendered.output,'portrait');assert.equal(rendered.discordVolume,.2);assert.equal(copies.length,1)
 const exports=path.join(directory,'clip_exports');assert.equal(fs.readdirSync(exports).length,1,'Copied file must remain available for pasting')
 bytes=20_000_001;const rejected=await handlers.get('clips:copy-edited')({},payload);assert.equal(rejected.success,false);assert.match(rejected.error,/20 MB/);assert.equal(copies.length,1,'Oversized files must never overwrite the clipboard');assert.equal(fs.readdirSync(exports).length,1,'Failed export must be removed');assert.equal(fs.readFileSync(original,'utf8'),'untouched')
})

test('quick sharing preserves drafts including cuts, crop and all audio channels',()=>{
 const {clipExportRequest}=load()('src/services/clipSharing.ts')
 const state={title:'Edited title',start:1,end:8,cuts:[{start:3,end:4}],gameVolume:.65,micVolume:0,discordVolume:.2,output:'portrait',cropX:.3}
 const clip={filePath:'original.mp4',title:'Original title',editDraft:{state}}
 assert.deepEqual(clipExportRequest(clip),{filePath:'original.mp4',suggestedName:'Edited title',trimStart:1,trimEnd:8,cuts:state.cuts,gameVolume:.65,micVolume:0,discordVolume:.2,output:'portrait',cropX:.3})
 assert.deepEqual(clipExportRequest({...clip,editDraft:undefined}),{filePath:'original.mp4',suggestedName:'Original title'})
 assert.equal(clipExportRequest(clip,{...state,title:'Current unsaved title'}).suggestedName,'Current unsaved title')
})

test('small WebM copies retain the WebM extension on the actual clipboard file',async t=>{
 const directory=fs.mkdtempSync(path.join(__dirname,'.clip-sharing-'));t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(__dirname));fs.rmSync(directory,{recursive:true,force:true})})
 const source=path.join(directory,'original.webm');fs.writeFileSync(source,'original WebM');const handlers=new Map(),copies=[]
 const service=load({electron:{app:{getPath:()=>directory,isPackaged:false},clipboard:{write:async value=>copies.push(value)},ClipboardItem:class{constructor(value){this.value=value}}},'./ipcSecurity':{ipcMain:{handle:(name,callback)=>handlers.set(name,callback)}},'child_process':{execFile:(_file,args,_options,callback)=>{copies.push(args);callback(null)}}})('electron/clipShareService.ts')
 service.initClipSharing(async(_payload,output)=>{assert.equal(path.extname(output),'.webm');fs.copyFileSync(source,output)},payload=>payload)
 const result=await handlers.get('clips:copy-edited')({},{filePath:source,suggestedName:'Original WebM'})
 assert.equal(result.success,true,result.error);assert.equal(copies.length,1)
 const files=fs.readdirSync(path.join(directory,'clip_exports'));assert.equal(files.length,1);assert.equal(path.extname(files[0]),'.webm')
 assert.deepEqual(fs.readFileSync(path.join(directory,'clip_exports',files[0])),fs.readFileSync(source))
})
