import type { CS2Stats } from '../src/types/cs2Stats'
const empty=():CS2Stats=>({kills:0,deaths:0,assists:0,headshots:0,headshotKills:0,ct:0,t:0,round:0,map:'',lastSeenAt:0})
export function createCS2Session(){
  let state=empty(),baseline:{key:string;k:number;d:number;a:number;round:number;hs:number;rk:number;time:number}|undefined
  return {
    read:()=>({...state}),
    disconnect(){baseline=undefined;state={...state,lastSeenAt:0}},
    reset(){state=empty();baseline=undefined;return {...state}},
    ingest(data:any,now=Date.now()):CS2Stats|undefined{
      const p=data?.player,m=data?.map,provider=data?.provider
      const valid=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<1000000
      if(provider?.appid!==730||!/^\d{17}$/.test(provider.steamid)||p?.steamid!==provider.steamid||p.activity!=='playing'||m?.phase!=='live')return
      const s=p.match_stats
      if(!s||![s.kills,s.deaths,s.assists,m.round].every(valid)||typeof m.name!=='string')return
      const time=Number(provider.timestamp)||0,key=provider.steamid+':'+m.name+':'+m.mode
      if(baseline?.key===key&&time&&time<baseline.time)return
      const hs=valid(p.state?.round_killhs)?p.state.round_killhs:0,rk=valid(p.state?.round_kills)?p.state.round_kills:0
      if(baseline&&baseline.key===key&&m.round>=baseline.round&&s.kills>=baseline.k&&s.deaths>=baseline.d&&s.assists>=baseline.a){
        state.kills+=s.kills-baseline.k;state.deaths+=s.deaths-baseline.d;state.assists+=s.assists-baseline.a
        if(valid(p.state?.round_killhs)&&valid(p.state?.round_kills)){
          const newRound=m.round!==baseline.round
          state.headshots+=Math.min(Math.max(0,hs-(newRound?0:baseline.hs)),s.kills-baseline.k)
          state.headshotKills+=Math.min(Math.max(0,rk-(newRound?0:baseline.rk)),s.kills-baseline.k)
        }
      }
      baseline={key,k:s.kills,d:s.deaths,a:s.assists,round:m.round,hs,rk,time}
      state={...state,map:m.name.slice(0,64),ct:valid(m.team_ct?.score)?m.team_ct.score:0,t:valid(m.team_t?.score)?m.team_t.score:0,round:m.round,lastSeenAt:now}
      return {...state}
    },
  }
}
export const cs2Session=createCS2Session()
