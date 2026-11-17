import type { BrowserWindowConstructorOptions } from 'electron'

export const FRIENDS_WINDOW_SIZE = {width:340,height:540} as const
export function friendsWindowOptions(preload:string, icon?:string):BrowserWindowConstructorOptions {
  return {...FRIENDS_WINDOW_SIZE,minWidth:340,maxWidth:340,minHeight:540,maxHeight:540,
    resizable:false,maximizable:false,fullscreenable:false,movable:true,frame:false,transparent:true,
    title:'Eclipse · Friends',titleBarStyle:'hidden',backgroundColor:'#00000000',show:false,icon,
    webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:false},
  }
}

interface DialogHost {
  isDestroyed():boolean
  isMinimized():boolean
  restore():void
  show():void
  focus():void
  webContents:{send(channel:string):void;setBackgroundThrottling(flag:boolean):void;invalidate():void}
}

/** Render the dialog before focusing a background/minimized main window. */
export function createAddFriendReveal(getWindow:()=>DialogHost|null, timeoutMs=2000) {
  let pending:DialogHost|null=null, timer:ReturnType<typeof setTimeout>|undefined
  const cancel=()=>{
    clearTimeout(timer)
    if(pending&&!pending.isDestroyed())pending.webContents.setBackgroundThrottling(true)
    pending=null
  }
  const reveal=(host:DialogHost)=>{
    if(pending!==host)return
    clearTimeout(timer);pending=null
    if(host.isDestroyed())return
    host.webContents.setBackgroundThrottling(true)
    if(host.isMinimized())host.restore()
    host.webContents.invalidate();host.show();host.focus()
  }
  return {
    open(){
      cancel()
      const host=getWindow()
      if(!host||host.isDestroyed())return
      pending=host
      // Allow the renderer's preparation frame even while the app is minimized.
      host.webContents.setBackgroundThrottling(false)
      timer=setTimeout(()=>reveal(host),timeoutMs);timer.unref?.()
      host.webContents.send('show-add-friend-modal')
    },
    ready(sender:unknown){if(pending&&pending.webContents===sender)reveal(pending)},
    dismiss(sender:unknown){if(pending&&pending.webContents===sender)cancel()},
    cancel,
  }
}
