const fs = require('node:fs')
const assert = require('node:assert/strict')
const base = '.cache/smoothness-20261108/'
const before = JSON.parse(fs.readFileSync(base+'control/verification.json'))
const after = JSON.parse(fs.readFileSync(base+'after/verification.json'))
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
const result = {scope:'Controlled 590-game production Electron test. Heap values describe JavaScript memory, not total application RAM. Timing varies with the system.',views:{}}
for (const mode of ['grid','list']) {
  const a = before.views[mode], b = after.views[mode]
  assert.equal(b.initial.height,a.initial.height)
  assert.equal(b.returnHeight,a.returnHeight)
  for (let index=0;index<6;index++) for(const key of ['x','y','width','height']) {
    assert.ok(Math.abs(a.initial.first[index][key]-b.initial.first[index][key])<.04, `${mode} card ${index} changed ${key}`)
  }
  const oldTask = median(a.samples.map(sample=>sample.taskMs)), newTask = median(b.samples.map(sample=>sample.taskMs))
  result.views[mode] = {beforeHeapMiB:a.memory.heapMiB,afterHeapMiB:b.memory.heapMiB,heapReductionPercent:100*(1-b.memory.heapMiB/a.memory.heapMiB),beforeNodes:a.memory.nodes,afterNodes:b.memory.nodes,beforeMountedCards:a.memory.mountedCards,afterMountedCards:b.memory.mountedCards,beforeMainThreadMs:oldTask,afterMainThreadMs:newTask,mainThreadReductionPercent:100*(1-newTask/oldTask),beforeP95FrameMs:median(a.samples.map(sample=>sample.p95Ms)),afterP95FrameMs:median(b.samples.map(sample=>sample.p95Ms)),geometryUnchanged:true}
}
fs.writeFileSync(base+'comparison.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
