const test=require('node:test'),assert=require('node:assert/strict'),loadTs=require('./download-loader.cjs')
const now=Math.floor(new Date(2026,10,7,12).getTime()/1000),stamp=(year,month,day)=>Math.floor(new Date(year,month,day,12).getTime()/1000)
const item=(id,release={},extra={})=>({appid:id,id,item_type:0,type:0,success:1,visible:true,name:'Game '+id,release:{steam_release_date:stamp(2026,10,6),...release},assets:{asset_url_format:`steam/apps/${id}/\${FILENAME}`,header:'header.jpg'},...extra})
test('calendar weeks start on Monday, include weekends and cross years without dropping or repeating days',()=>{
  const {calendarWeek,calendarDayKey,calendarDate}=loadTs()('src/services/releaseCalendar.ts')
  assert.deepEqual(calendarWeek(new Date(2027,0,3,23)).map(calendarDayKey),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'])
  assert.equal(calendarDayKey(calendarWeek(new Date(2026,10,7),1)[0]),'2026-11-09')
  assert.equal(calendarDayKey(calendarDate('2026-03-29')),'2026-03-29')
  for(const date of [new Date(2026,2,29),new Date(2026,9,25)]){const keys=calendarWeek(date).map(calendarDayKey);assert.equal(new Set(keys).size,7);assert.ok(keys.every(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)))}
})
test('calendar dates honor Steam public precision and never expose a private exact day from an approximate window',()=>{
  const {parseCalendarItems}=loadTs()('src/services/releaseCalendar.ts'),order=new Map(Array.from({length:9},(_,i)=>[i+1,i]))
  const rows=[item(1),item(2,{is_coming_soon:true,coming_soon_display:'date_full',steam_release_date:stamp(2026,10,10)}),item(3,{is_coming_soon:true,coming_soon_display:'date_month',steam_release_date:stamp(2026,10,30)}),item(4,{is_coming_soon:true,coming_soon_display:'date_quarter',steam_release_date:stamp(2026,11,31)}),item(5,{is_coming_soon:true,coming_soon_display:'date_year',steam_release_date:stamp(2027,11,31)}),item(6,{is_coming_soon:true,steam_release_date:stamp(2026,10,15)}),item(7,{is_coming_soon:true,coming_soon_display:'date_full',is_abridged_release_date:true}),item(8,{is_coming_soon:true,steam_release_date:0,custom_release_date_message:'<b>To be announced</b>'})]
  const result=parseCalendarItems({response:{store_items:rows}},order,'de',now)
  assert.equal(result[0].releaseState,'released');assert.equal(result[0].releaseDay,'2026-11-06')
  assert.equal(result[1].releaseDay,'2026-11-10');assert.equal(result[1].releaseState,'upcoming')
  for(const game of result.slice(2))assert.equal(game.releaseDay,null,game.name)
  assert.match(result[2].releaseWindow,/November 2026/);assert.equal(result[3].releaseWindow,'Q4 2026');assert.equal(result[4].releaseWindow,'2027');assert.equal(result[7].releaseWindow,'To be announced')
})
test('a missed planned date stays upcoming; future timestamps without a published release do not become released games',()=>{
  const {parseCalendarItems}=loadTs()('src/services/releaseCalendar.ts')
  const games=parseCalendarItems({response:{store_items:[item(1,{is_coming_soon:true,coming_soon_display:'date_full'}),item(2,{steam_release_date:stamp(2026,10,12)}),item(3,{steam_release_date:Infinity}),item(4,{steam_release_date:-1})]}},new Map([[1,0],[2,1],[3,2],[4,3]]),'en',now)
  assert.equal(games.length,1);assert.equal(games[0].releaseState,'upcoming');assert.equal(games[0].releaseDay,'2026-11-06')
})
test('calendar accepts only requested visible games, deduplicates and rejects unsafe artwork',()=>{
  const {parseCalendarItems}=loadTs()('src/services/releaseCalendar.ts')
  const rows=[item(1),item(1),item(2,{}, {type:8}),item(3,{}, {visible:false}),item(4),item(5,{}, {success:2}),item(6,{}, {assets:{asset_url_format:'steam/apps/6/\${FILENAME}',header:'../../evil.png'}}),item(7,{}, {name:'Uninitialized'}),item(8,{}, {name:'Steam Frame'})]
  const games=parseCalendarItems({response:{store_items:rows}},new Map([[1,5],[2,1],[3,2],[5,4],[6,0],[7,6],[8,7]]),'en',now)
  assert.deepEqual(games.map(game=>game.steamId),[1,6]);assert.equal(games[1].headerImage,undefined)
})
test('calendar search extracts unique app IDs without trusting bundle IDs or rendering upstream markup',()=>{
  const {parseCalendarSearch}=loadTs()('src/services/releaseCalendar.ts')
  assert.deepEqual(parseCalendarSearch({success:1,results_html:'<a data-ds-appid="42" data-ds-itemkey="App_42"><script>evil()</script></a><a data-ds-appid="42" data-ds-itemkey="App_42"></a><a data-ds-appid="43,44" data-ds-itemkey="Bundle_8"></a><a data-ds-appid="0" data-ds-itemkey="App_0"></a>'}),[42])
  assert.deepEqual(parseCalendarSearch({success:0,results_html:'<a data-ds-appid="42" data-ds-itemkey="App_42">'}),[])
})
test('calendar grouping retains popularity order, real weekend dates and does not put undated games on arbitrary days',()=>{
  const {calendarWeek,groupCalendarWeek}=loadTs()('src/services/releaseCalendar.ts')
  const groups=groupCalendarWeek([{steamId:1,releaseDay:'2026-11-06',priority:4},{steamId:2,releaseDay:'2026-11-06',priority:1},{steamId:3,releaseDay:'2026-11-08',priority:0},{steamId:4,releaseDay:null,priority:0}],calendarWeek(new Date(2026,10,7)))
  assert.deepEqual(groups[4].map(g=>g.steamId),[2,1]);assert.equal(groups[6][0].steamId,3);assert.equal(groups.flat().length,3)
})
test('calendar batches metadata, keeps region consistent and degrades gracefully when one public list fails',async()=>{
  const calls=[]
  const {fetchReleaseCalendar}=loadTs({'./httpClient':{desktopFetch:async(url,options)=>{const u=new URL(url);calls.push(u);assert.ok(options.signal)
    if(u.pathname.includes('/search/')){assert.equal(u.searchParams.get('cc'),'DE');assert.equal(u.searchParams.get('l'),'german');if(u.searchParams.get('filter')==='popularcomingsoon')throw Error('Outage');assert.equal(u.searchParams.get('sort_by'),'Released_DESC');return Response.json({success:1,results_html:'<a data-ds-appid="1" data-ds-itemkey="App_1">'})}
    const input=JSON.parse(u.searchParams.get('input_json'));assert.equal(input.context.language,'german');assert.equal(input.context.country_code,'DE');return Response.json({response:{store_items:input.ids.map(({appid})=>item(appid))}})
  }}})('src/services/releaseCalendar.ts')
  const result=await fetchReleaseCalendar('de',[{steamId:2,name:'Seed'}])
  assert.equal(result.partial,true);assert.deepEqual(result.games.map(g=>g.steamId),[1,2]);assert.equal(calls.length,3)
})
test('calendar honors cancellation and rejects an empty or failed metadata feed',async()=>{
  const controller=new AbortController();controller.abort()
  const {fetchReleaseCalendar}=loadTs({'./httpClient':{desktopFetch:()=>{assert.fail('Cancelled requests must not be sent')}}})('src/services/releaseCalendar.ts')
  await assert.rejects(fetchReleaseCalendar('en',[],controller.signal))
  const other=loadTs({'./httpClient':{desktopFetch:async()=>Response.json({success:1,results_html:''})}})('src/services/releaseCalendar.ts')
  await assert.rejects(other.fetchReleaseCalendar('en',[]),/no games/)
})
