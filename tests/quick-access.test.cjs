const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {quickAccessSlots,assignQuickAction,quickActionAvailable,quickAccessVisible}=load()('src/services/quickAccess.ts')
test('quick access keeps three unique valid actions and excludes launcher services in Clips mode',()=>{
  assert.deepEqual(quickAccessSlots(undefined,'launcher'),[null,null,null])
  assert.deepEqual(quickAccessSlots(undefined,'clips'),[null,null,null])
  assert.deepEqual(quickAccessSlots(['unknown','friends','friends','media'],'clips'),[null,'friends',null])
  assert.equal(quickActionAvailable('performance','clips'),false)
  assert.deepEqual(quickAccessSlots(['downloads','clips','settings','friends'],'launcher'),['downloads','clips','settings'])
})
test('assigning another slot swaps its action and does not mutate saved preferences',()=>{
  const current=['crosshair','performance','save-clip']
  assert.deepEqual(assignQuickAction(current,0,'save-clip'),['save-clip','performance','crosshair'])
  assert.deepEqual(current,['crosshair','performance','save-clip'])
  assert.deepEqual(assignQuickAction(current,1,'friends'),['crosshair','friends','save-clip'])
  assert.deepEqual(assignQuickAction(current,1,null),['crosshair',null,'save-clip'])
  assert.deepEqual(assignQuickAction([null,null,'friends'],0,'friends'),['friends',null,null])
})
test('quick access locations default to sidebar and can be enabled independently',()=>{
  assert.equal(quickAccessVisible(undefined,'sidebar'),true)
  assert.equal(quickAccessVisible(undefined,'titlebar'),false)
  assert.equal(quickAccessVisible({sidebar:false,topbar:true,titlebar:true},'sidebar'),false)
  assert.equal(quickAccessVisible({sidebar:false,topbar:true,titlebar:true},'topbar'),true)
})
