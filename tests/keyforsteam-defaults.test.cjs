const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const {withKeyforsteamDefaults}=load()('src/services/keyforsteamDefaults.ts')
test('Keyforsteam automatically enables for fresh and existing installs including old disabled settings',()=>{
  for(const saved of [{},{keyforsteamEnabled:false},{keyforsteamEnabled:true}]){
    const input={...saved,language:'en',backgroundLighting:false},before={...input},result=withKeyforsteamDefaults(input)
    assert.equal(result.keyforsteamEnabled,true);assert.equal(result.keyforsteamDefaultsVersion,1)
    assert.equal(result.language,'en');assert.equal(result.backgroundLighting,false)
    assert.deepEqual(input,before,'Loading defaults must not mutate saved input')
  }
})
test('the activation migration runs once and preserves later opt-outs across restarts',()=>{
  const enabled=withKeyforsteamDefaults({keyforsteamEnabled:false}),disabled={...enabled,keyforsteamEnabled:false}
  assert.equal(withKeyforsteamDefaults(enabled),enabled)
  assert.equal(withKeyforsteamDefaults(disabled),disabled)
  assert.equal(withKeyforsteamDefaults(JSON.parse(JSON.stringify(disabled))).keyforsteamEnabled,false)
  assert.equal(withKeyforsteamDefaults({keyforsteamDefaultsVersion:1}).keyforsteamEnabled,true)
  assert.equal(withKeyforsteamDefaults({keyforsteamDefaultsVersion:1,keyforsteamEnabled:'false'}).keyforsteamEnabled,true)
})
