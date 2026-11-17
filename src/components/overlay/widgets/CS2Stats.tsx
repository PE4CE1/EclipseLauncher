import { useEffect, useState } from 'react'
import type { CS2Stats as Stats } from '../../../types/cs2Stats'
export function CS2Stats({language='en',editMode=false}:{language?:string;editMode?:boolean}){
  const [stats,setStats]=useState<Stats>(),[now,setNow]=useState(Date.now),de=language==='de'
  useEffect(()=>{let active=true,revision=0;const stop=window.electronAPI?.onCS2Stats?.(value=>{revision++;if(active)setStats(value)});const requested=revision;void window.electronAPI?.getCS2Stats?.().then(value=>{if(active&&revision===requested)setStats(value)});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;stop?.();clearInterval(timer)}},[])
  const live=stats&&now-stats.lastSeenAt<20000,s=stats
  return <div className="overlay-panel cs2-session-hud"><div className="performance-hud__heading"><span/>CS2 · {de?'SESSION':'SESSION'}</div>{!live&&!editMode?<p>{de?'Warte auf CS2 · GSI einrichten':'Waiting for CS2 · set up GSI'}</p>:<><div className="cs2-session-score">{s?.ct??0} : {s?.t??0}<small>{s?.map||'CS2'}</small></div><div className="cs2-session-grid">{[['K/D',s?(s.kills/Math.max(1,s.deaths)).toFixed(2):'—'],[de?'Kills / Tode':'Kills / deaths',s?`${s.kills} / ${s.deaths}`:'—'],['Assists',s?.assists??'—'],['HS',s&&s.headshotKills?Math.round(s.headshots/s.headshotKills*100)+'%':'—']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><small>{de?'Seit Beginn der Erfassung':'Since tracking started'}</small></>}</div>
}
