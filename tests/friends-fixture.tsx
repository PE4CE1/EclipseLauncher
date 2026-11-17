import {lazy,Suspense,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {FriendsWindow} from '../src/components/friends/FriendsWindow'
import {useGameStore} from '../src/store/gameStore'
import {useUIStore} from '../src/store/uiStore'
import {friendsFixture,chatFixture} from './friends-social-fixture'
import {ProfileSummary} from '../src/components/layout/SidebarProfileSummary'
import {Notification} from '../src/components/shared/Notification'
import {CopyButton} from '../src/components/profile/ProfileOverview'
import {sendAppNotification} from '../src/services/notificationService'
import '../src/index.css'
const native=location.hash==='#friends'
const AddFriend=lazy(()=>new Promise(resolve=>setTimeout(resolve,180)).then(()=>import('../src/components/friends/AddFriendModal').then(module=>({default:module.AddFriendModal}))))
const names=['Chaos','Snakgod','Sneaky','ninja']
Object.assign(window,{__chatFixture:chatFixture})
window.electronAPI?.chatNotifications?.onMuted(value=>useGameStore.getState().updateSettings({chatMutedFriends:value}))
Object.assign(window,{
  __chatMuted:(peer:string)=>useGameStore.getState().settings.chatMutedFriends?.['my-uid']?.includes(peer)===true,
  __chatNotificationPreview:()=>useUIStore.getState().showNotification('Want to play another round?','info','Nova',30000,{kind:'message',peerId:'online',avatarUrl:'https://fixture.eclipse/nova.png',private:true}),
  __generalNotificationPreview:()=>useUIStore.getState().showNotification('Your download is ready. Jump back in whenever you want.','success','Download complete',30000),
})
const friends=[{id:'playing',username:'Avery',status:'ingame' as const,currentGame:'Rocket League',avatarUrl:'https://fixture.eclipse/avery.png'},{id:'online',username:'Nova',status:'online' as const,avatarUrl:'https://fixture.eclipse/nova.png'},...names.map((name,index)=>({id:'offline-'+index,username:name,status:'offline' as const,lastSeen:Date.now()-(index+1)*12*60*60_000,avatarUrl:'https://fixture.eclipse/'+name+'.png'}))]
useGameStore.getState().updateSettings({username:'SERGEANTPEACE(GER)',avatarUrl:'https://fixture.eclipse/me.png',friendCode:'ECL-TEST1',userUid:'my-uid',language:'en',eclipseFriends:friends,incomingFriendRequests:[{fromUid:'request-user',fromUsername:'Sage',fromAvatarUrl:'https://fixture.eclipse/sage.png',fromFriendCode:'ECL-SAGE1',timestamp:Date.now()}],soundEffects:false,desktopNotifications:true})
useUIStore.getState().setIsFriendsOpen(true)
Object.assign(window,{__friendsFixture:{calls:friendsFixture,openFriends:()=>useUIStore.getState().setIsFriendsOpen(true),language:(language:'de'|'en')=>useGameStore.getState().updateSettings({language}),profile:()=>useUIStore.getState().selectedFriendId,addOpen:()=>useUIStore.getState().isAddFriendOpen,openAdd:()=>useUIStore.getState().setIsAddFriendOpen(true),closeAdd:()=>useUIStore.getState().setIsAddFriendOpen(false),many:()=>useGameStore.getState().updateSettings({eclipseFriends:[...friends,...Array.from({length:15},(_,index)=>({id:'extra-'+index,username:'Friend '+index,status:'offline' as const,avatarUrl:''}))]})}})
function Fixture(){
  const open=useUIStore(state=>state.isAddFriendOpen)
  useEffect(()=>window.electronAPI?.onShowAddFriendModal(()=>{if(useUIStore.getState().isAddFriendOpen)requestAnimationFrame(()=>window.electronAPI?.addFriendModalReady?.());else useUIStore.getState().setIsAddFriendOpen(true)}),[])
  return <main className="friends-test-host" style={{height:'100vh',background:native?'transparent':'#171410'}}><div style={{padding:35,color:'#a39682',display:native?'none':'block'}}>ECLIPSE · FRIENDS PREVIEW</div><FriendsWindow isStandalone={native}/><Suspense fallback={null}>{open&&<AddFriend/>}</Suspense></main>
}
function ProfilePreview(){const settings=useGameStore(state=>state.settings);return <><button data-profile-preview style={{position:'fixed',zIndex:100,display:'flex',gap:12,alignItems:'center',width:240,margin:'20px 30px'}}><ProfileSummary settings={settings} playing={false} expanded={false} updateAvailable={false}/></button><div style={{position:'fixed',left:30,bottom:30,zIndex:100}}><CopyButton value="ECL-PROFILE" label="Copy friend code"/></div></>}
Object.assign(window,{__requestPreview:async()=>{useGameStore.getState().updateSettings({incomingFriendRequests:[{fromUid:'fresh-request',fromUsername:'River',fromAvatarUrl:'',fromFriendCode:'ECL-RIVER',timestamp:Date.now()}]});await sendAppNotification({title:'Friend request',body:'River wants to add you. Open Friends to accept the request.',duration:6000,playSound:false})}})
createRoot(document.getElementById('root')!).render(<>{!native&&<ProfilePreview/>}<Fixture/>{!native&&<Notification/>}</>)
