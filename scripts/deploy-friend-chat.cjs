const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process')
const {firebaseAdminClient,adminRequest}=require('./firebase-admin-rest.cjs')
const project='eclipse-launcher-d4cd3'
async function main(){
 const rules=firebaseAdminClient('rules',project),firestore=firebaseAdminClient('firestore',project)
 const release=await rules.get(`projects/${project}/releases/cloud.firestore`,adminRequest())
 const before=await rules.get(release.body.rulesetName,adminRequest())
 const remote=before.body.source.files.find(file=>file.name==='firestore.rules').content,local=fs.readFileSync('firestore.rules','utf8')
 const normalize=value=>value.replace(/\r\n/g,'\n').trim()
 const previous=local.slice(0,local.indexOf('    function chatMember('))+local.slice(local.indexOf('    match /device_identities/'))
 if(normalize(remote)!==normalize(previous)&&normalize(remote)!==normalize(local))throw Error('Live rules differ from the expected prior version; refusing to overwrite unrelated security changes')
 fs.mkdirSync('.cache/friend-chat',{recursive:true})
 if(!fs.existsSync('.cache/friend-chat/rules-before.json'))fs.writeFileSync('.cache/friend-chat/rules-before.json',JSON.stringify({rulesetName:release.body.rulesetName,source:before.body.source},null,2))
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({project,additiveRulesVerified:true,readyToDeploy:true}));return}
 const endpoint=`projects/${project}/databases/(default)/collectionGroups/chats/indexes`
 const existing=await firestore.get(endpoint,adminRequest())
 let index=(existing.body.indexes||[]).find(index=>index.queryScope==='COLLECTION'&&index.fields.some(field=>field.fieldPath==='members'&&field.arrayConfig==='CONTAINS')&&index.fields.some(field=>field.fieldPath==='updatedAt'&&field.order==='DESCENDING'))
 if(!index){const created=await firestore.post(endpoint,{queryScope:'COLLECTION',fields:[{fieldPath:'members',arrayConfig:'CONTAINS'},{fieldPath:'updatedAt',order:'DESCENDING'}]},adminRequest());fs.writeFileSync('.cache/friend-chat/index-operation.json',JSON.stringify(created.body,null,2))}
 if(normalize(remote)!==normalize(local)){
   const cli=path.resolve('.cache/firebase-security/node_modules/firebase-tools/lib/bin/firebase.js')
   const deploy=spawnSync(process.execPath,[cli,'deploy','--only','firestore:rules','--project',project,'--non-interactive'],{encoding:'utf8',windowsHide:true,timeout:120000})
   fs.writeFileSync('.cache/friend-chat/rules-deploy.log',(deploy.stdout||'')+(deploy.stderr||''))
   if(deploy.status!==0)throw Error('Rules deployment failed; see .cache/friend-chat/rules-deploy.log')
 }
 const deadline=Date.now()+300000
 do{
   const result=await firestore.get(endpoint,adminRequest())
   index=(result.body.indexes||[]).find(index=>index.fields.some(field=>field.fieldPath==='members'&&field.arrayConfig==='CONTAINS')&&index.fields.some(field=>field.fieldPath==='updatedAt'&&field.order==='DESCENDING'))
   if(index?.state==='READY')break
   if(index?.state==='NEEDS_REPAIR')throw Error('Chat index requires repair')
   await new Promise(resolve=>setTimeout(resolve,3000))
 }while(Date.now()<deadline)
 if(index?.state!=='READY')throw Error('Chat index is still building; run this script again to verify completion')
 const active=await rules.get(`projects/${project}/releases/cloud.firestore`,adminRequest()),source=await rules.get(active.body.rulesetName,adminRequest())
 if(normalize(source.body.source.files.find(file=>file.name==='firestore.rules').content)!==normalize(local))throw Error('Live rule verification failed')
 const report={project,rulesVerified:true,indexReady:true,rulesSha256:crypto.createHash('sha256').update(local).digest('hex'),verifiedAt:new Date().toISOString()}
 fs.writeFileSync('.cache/friend-chat/deployment.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
