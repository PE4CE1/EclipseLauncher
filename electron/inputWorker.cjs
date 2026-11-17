function createInputCollector(hook,keys,send,clock=()=>performance.now()){
  let left=[],right=[],lastLeft=-Infinity,lastRight=-Infinity,lastLmb=0,lastRmb=0,button,scoreboard=false,keyCode=keys.Tab,timer
  const bind=value=>{const entry=Object.entries(keys).find(([name,code])=>typeof code==='number'&&name.toUpperCase()===String(value||'Tab').toUpperCase());const next=entry?.[1];if(next!==keyCode&&scoreboard){scoreboard=false;send({type:'scoreboard',open:false})}keyCode=next}
  const flush=()=>{
    const now=clock();left=left.filter(time=>now-time<=1000);right=right.filter(time=>now-time<=1000)
    if(button||left.length!==lastLmb||right.length!==lastRmb){lastLmb=left.length;lastRmb=right.length;send({type:'cps',lmb:lastLmb,rmb:lastRmb,total:lastLmb+lastRmb,...(button?{buttonClicked:button}:{})});button=undefined}
  }
  const start=()=>{
    if(timer)return
    // Raw mouse motion never enters the launcher UI process.
    hook.handler=event=>{
      if(event.type===7){const now=clock();if(event.button===1&&now-lastLeft>=10){lastLeft=now;left.push(now);button='lmb'}else if(event.button===2&&now-lastRight>=10){lastRight=now;right.push(now);button='rmb'}}
      else if((event.type===4||event.type===5)&&event.keycode===keyCode){const down=event.type===4;if(down!==scoreboard){scoreboard=down;send({type:'scoreboard',open:down})}}
    }
    hook.start();timer=setInterval(flush,40)
  }
  const stop=()=>{if(timer)clearInterval(timer);timer=undefined;hook.stop();hook.removeAllListeners();left=[];right=[]}
  return{start,stop,bind,flush}
}
module.exports={createInputCollector}
if(process.parentPort){
  const {uIOhook,UiohookKey}=require('uiohook-napi')
  const collector=createInputCollector(uIOhook,UiohookKey,value=>process.parentPort.postMessage(value))
  process.parentPort.on('message',({data})=>{
    if(data?.type==='bind')collector.bind(data.key)
    else if(data?.type==='stop'){collector.stop();process.exit(0)}
  })
  try{collector.start();process.parentPort.postMessage({type:'ready'})}
  catch(error){process.parentPort.postMessage({type:'failed',message:String(error?.message||error).slice(0,200)});process.exit(1)}
}
