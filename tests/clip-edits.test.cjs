const test=require('node:test'),assert=require('node:assert/strict')
const {ClipEditHistory,clampClipPosition,normalizeClipEdit,validateClipDraftInput,createClipDraftWriter}=require('./download-loader.cjs')()('src/services/clipEdits.ts')
const initial={title:'Highlight',start:0,end:20,gameVolume:1,micVolume:1}

test('seeking and playback positions stay within the selected interval',()=>{
  for(const value of [-100,0,4,8,11,100,NaN])assert.ok(clampClipPosition(value,{start:5,end:10})>=5&&clampClipPosition(value,{start:5,end:10})<=10)
  assert.equal(clampClipPosition(3,{start:5,end:10}),5);assert.equal(clampClipPosition(12,{start:5,end:10}),10)
})
test('a continuous trim gesture is one undo step and redo restores the whole edit',()=>{
  const history=new ClipEditHistory(initial,20)
  history.begin('trim')
  for(let i=1;i<=120;i++)history.update({start:i/20,end:18})
  history.commit('trim')
  assert.equal(history.present.start,6);assert.equal(history.undo(),true);assert.deepEqual(history.present,initial)
  assert.equal(history.undo(),false);assert.equal(history.redo(),true);assert.equal(history.present.start,6);assert.equal(history.present.end,18)
})
test('title and volume groups do not accidentally commit each other on blur',()=>{
  const history=new ClipEditHistory(initial,20)
  history.begin('title');history.update({title:'Round won'})
  history.begin('gameVolume');history.commit('title')
  for(let i=0;i<20;i++)history.update({gameVolume:i/40})
  history.commit('gameVolume');history.undo()
  assert.equal(history.present.title,'Round won');assert.equal(history.present.gameVolume,1)
  history.undo();assert.equal(history.present.title,'Highlight')
})
test('new edits clear redo, cancelling a gesture retains redo, and no-op edits add no history',()=>{
  const history=new ClipEditHistory(initial,20)
  assert.equal(history.update({...initial}),false);assert.equal(history.canUndo,false)
  history.update({micVolume:.3});history.undo()
  history.begin('trim');history.update({start:4});history.cancel('trim')
  assert.equal(history.canRedo,true);assert.equal(history.present.start,0)
  history.update({title:'New branch'});assert.equal(history.canRedo,false)
})
test('measured duration changes clamp every history entry without inventing an undo step',()=>{
  const history=new ClipEditHistory({...initial,end:0},0)
  history.rebaseDuration(20);assert.equal(history.present.end,20);assert.equal(history.canUndo,false)
  history.update({start:12,end:16});history.rebaseDuration(8)
  assert.ok(history.present.start<history.present.end&&history.present.end<=8)
  history.undo();assert.equal(history.present.start,0);assert.equal(history.present.end,8)
  assert.equal(normalizeClipEdit({...initial,start:100,end:100},.04).end,.04)
})
test('undo history is bounded even after many discrete edits',()=>{
  const history=new ClipEditHistory(initial,20,50)
  for(let i=0;i<250;i++)history.update({title:'Clip '+i})
  let count=0;while(history.undo())count++
  assert.equal(count,50)
})
test('draft input accepts only bounded real edit values and excludes extra properties',()=>{
  const valid={sourceDuration:20,state:initial,baseTitle:'Untrusted',arbitrary:'discard'}
  assert.deepEqual(validateClipDraftInput(valid),{sourceDuration:20,state:initial})
  for(const patch of [{sourceDuration:Infinity},{sourceDuration:100000},{state:{...initial,start:-1}},{state:{...initial,end:25}},{state:{...initial,start:19.95}},{state:{...initial,micVolume:NaN}},{state:{...initial,gameVolume:2}},{state:{...initial,title:''}},{state:{...initial,title:'a'.repeat(501)}}])assert.throws(()=>validateClipDraftInput({...valid,...patch}),/Invalid/)
})
test('draft writes from closing/reopening editors and discard stay ordered across async saves',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),calls=[]
  const writer=createClipDraftWriter(async(id,draft)=>{calls.push(draft?.state.title||'discard');if(calls.length===1)await gate;return{success:true}})
  const first=writer('clip_1',{sourceDuration:20,state:initial})
  const discard=writer('clip_1',null)
  const latest=writer('clip_1',{sourceDuration:20,state:{...initial,title:'New editor'}})
  await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,['Highlight'])
  release();await Promise.all([first,discard,latest]);assert.deepEqual(calls,['Highlight','discard','New editor'])
})
test('a failed draft write does not poison the next save or other clips',async()=>{
  let calls=0;const writer=createClipDraftWriter(async()=>{if(++calls===1)throw Error('Disk full');return{success:true}})
  assert.equal((await writer('clip_1',null)).success,false)
  assert.equal((await writer('clip_1',null)).success,true)
  assert.equal((await writer('clip_2',null)).success,true)
})
