/** Keep user intent across metadata loading, seeks and interrupted play promises. */
export function createClipPlayback(getPlayer:()=>HTMLVideoElement|null, prepare:(player:HTMLVideoElement)=>boolean, changed:(wanted:boolean)=>void, failed:(error:unknown)=>void) {
  let wanted=false,pending:Promise<void>|null=null,revision=0,retries=0,ownPauses=0
  const setWanted=(value:boolean)=>{if(wanted!==value){wanted=value;changed(value)}}
  const ready=()=>{
    const player=getPlayer()
    if(!wanted||pending||!player||player.error||player.readyState<2||player.seeking||!player.paused)return
    if(!prepare(player)||player.seeking)return
    const token=revision
    let retry=false
    const promise=player.play();pending=promise
    void promise.catch(error=>{
      if(!wanted||token!==revision)return
      if(error?.name==='AbortError'&&retries++<1){retry=true;return}
      setWanted(false);if(!player.paused)ownPauses++;player.pause();failed(error)
    }).finally(()=>{
      if(pending===promise)pending=null
      if(wanted&&(retry||token!==revision))queueMicrotask(ready)
    })
  }
  const play=()=>{revision++;retries=0;setWanted(true);ready()}
  const pause=()=>{revision++;setWanted(false);const player=getPlayer();if(player&&!player.paused)ownPauses++;player?.pause()}
  const observedPause=()=>{
    if(ownPauses){ownPauses--;return}
    const player=getPlayer()
    if(wanted&&player?.paused&&player.readyState>0){revision++;setWanted(false)}
  }
  return {play,pause,ready,observedPause,toggle:()=>wanted?pause():play(),wanted:()=>wanted}
}
