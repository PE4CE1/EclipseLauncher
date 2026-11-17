const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')

function fixture(){
 const auth={currentUser:{uid:'temporary',isAnonymous:true}},calls=[]
 const recovery=load({'firebase/auth':{signInWithEmailAndPassword:async(a,email,password)=>{calls.push({email,password});a.currentUser={uid:'owner',isAnonymous:false};return{user:a.currentUser}},updateCurrentUser:async(a,user)=>{a.currentUser=user}}})('src/services/accountRecovery.ts')
 return{auth,calls,recovery}
}

test('friend codes, raw UIDs and legacy recovery keys never reach Firebase sign-in',async()=>{
 const f=fixture()
 for(const value of ['ECL-86EVW','86EVW','owner','ECL-SEC-ABCD-EFGH-JKLM-NPQR'])await assert.rejects(f.recovery.authenticateRecovery(f.auth,value),error=>error.code==='recovery/invalid-key')
 assert.equal(f.calls.length,0);assert.equal(f.auth.currentUser.uid,'temporary')
})

test('a saved valid key reconnects the canonical UID instead of trusting the friend code or local UID alone',async()=>{
 const f=fixture(),key=f.recovery.newRecoveryKey()
 await f.recovery.resumeSavedRecovery(f.auth,'owner',key)
 assert.equal(f.auth.currentUser.uid,'owner');assert.equal(f.calls.length,1)
 assert.doesNotMatch(f.calls[0].email,/ECL-|owner/)
})

test('a recovery key for a different UID rolls back authentication and cannot claim a local account',async()=>{
 const f=fixture(),previous=f.auth.currentUser
 await assert.rejects(f.recovery.resumeSavedRecovery(f.auth,'victim',f.recovery.newRecoveryKey()),error=>error.code==='recovery/session-mismatch')
 assert.equal(f.auth.currentUser,previous)
})

test('a friend code or legacy key cannot repair a mismatched sign-in',async()=>{
 const f=fixture()
 await assert.rejects(f.recovery.resumeSavedRecovery(f.auth,'owner','ECL-86EVW'),error=>error.code==='recovery/session-mismatch')
 assert.equal(f.calls.length,0)
})

test('old German errors and new error codes render in the currently selected language',()=>{
 const {recoveryError}=fixture().recovery
 const legacy='Die bestehende Anmeldung muss zuerst der gespeicherten Konto-ID zugeordnet werden. Dein lokales Profil bleibt erhalten.'
 assert.match(recoveryError(legacy,'en'),/legacy profile/);assert.doesNotMatch(recoveryError(legacy,'en'),/Anmeldung|bestehende/)
 assert.match(recoveryError(legacy,'de'),/ältere Profil/)
 for(const code of ['invalid-key','session-mismatch','different-key','provider-disabled','invalid-credential','rate-limited','persistence-failed','rollback-failed','profile-missing','profile-incomplete','unavailable']){
  const error={code:'recovery/'+code}
  assert.notEqual(recoveryError(error,'en'),recoveryError(error,'de'))
  assert.doesNotMatch(recoveryError(error,'en'),/uiRecovery|recovery\//)
 }
})
