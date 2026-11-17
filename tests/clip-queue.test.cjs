const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
test('clip jobs run in order and later jobs continue after an encoder failure',async()=>{
  const{createBoundedWorkQueue}=load()('src/services/boundedWorkQueue.ts'),queue=createBoundedWorkQueue(3,100),order=[];let release
  const a=queue.run(20,async()=>{order.push('first');await new Promise(resolve=>release=resolve);throw Error('Encoder failed')});const caught=a.catch(()=>false)
  const b=queue.run(20,async()=>{order.push('second');return true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,['first']);release();assert.equal(await caught,false);assert.equal(await b,true);assert.deepEqual(order,['first','second']);assert.equal(queue.count,0)
})
test('clip queue enforces both job and retained-byte limits and frees capacity',async()=>{
  const{createBoundedWorkQueue}=load()('src/services/boundedWorkQueue.ts'),queue=createBoundedWorkQueue(2,60);let release
  const a=queue.run(40,()=>new Promise(resolve=>release=resolve));await assert.rejects(queue.run(30,async()=>true));const b=queue.run(20,async()=>true);await assert.rejects(queue.run(0,async()=>true));await new Promise(resolve=>setImmediate(resolve));release(true);await Promise.all([a,b]);assert.equal(await queue.run(60,async()=>true),true)
})
test('completing one saved clip cannot erase another pending snapshot',()=>{
  const store=load()('src/store/clipStore.ts').useClipStore
  for(const id of ['a','b'])store.getState().setPendingClip({id,title:id,gameTitle:'Game',createdAt:1})
  store.getState().addClip({id:'saved-a',title:'a'},'a');assert.deepEqual(store.getState().pendingClips.map(clip=>clip.id),['b'])
  store.getState().updatePendingThumbnail('b','preview');assert.equal(store.getState().pendingClip.thumbnailUrl,'preview');store.getState().clearPendingClip('a');assert.equal(store.getState().pendingClip.id,'b')
})
