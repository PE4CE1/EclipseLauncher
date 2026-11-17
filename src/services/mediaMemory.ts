let captureActive=false,readers=0,releasePending=false
let timer:ReturnType<typeof setTimeout>|undefined,idle:number|undefined
function cancel(){
  clearTimeout(timer);timer=undefined
  if(idle!==undefined)window.cancelIdleCallback?.(idle)
  idle=undefined
}
function schedule(){
  cancel()
  if(captureActive||readers||!releasePending||!window.electronAPI?.releaseUnusedMediaMemory)return
  timer=setTimeout(()=>{
    timer=undefined
    const release=()=>{idle=undefined;if(!captureActive&&!readers&&releasePending){releasePending=false;try{window.electronAPI?.releaseUnusedMediaMemory?.()}catch{}}}
    if(window.requestIdleCallback)idle=window.requestIdleCallback(release,{timeout:2000})
    else release()
  },1500)
}
export function setCaptureMemoryActive(active:boolean){if(captureActive===active)return;captureActive=active;if(active)cancel();else{releasePending=true;schedule()}}
export function requestUnusedMediaRelease(){releasePending=true;schedule()}
export function retainMediaMemory(heavy=false){
  readers++;cancel();let released=false
  return()=>{if(released)return;released=true;readers--;if(heavy)releasePending=true;schedule()}
}
