const test=require('node:test'),assert=require('node:assert/strict'),load=require('./download-loader.cjs')
const own='Epic|0123456789abcdef0123456789abcdef|0'
const packet=(id='match-1',playlist=11,team=0,ended=false,winner=0)=>({Event:'UpdateState',Data:{MatchGuid:id,Players:[{PrimaryId:own,Name:'Eclipse',TeamNum:team}],Game:{PlaylistId:playlist,bReplay:false,bHasWinner:ended,Winner:winner===0?'Blue':'Orange',Teams:[{Name:'Blue',TeamNum:0},{Name:'Orange',TeamNum:1}]}}})
const ended=(id,winner=0)=>({Event:'MatchEnded',Data:{MatchGuid:id,WinnerTeamNum:winner}})
function fixture(){const model=load()('electron/rlSession.ts').createRLSession();model.select(own,'2v2');return model}
test('official match IDs count wins, losses and changing streaks exactly once',()=>{
  const m=fixture()
  for(const [index,winner] of [0,0,1,1,0].entries()){const id='m'+index;m.accept(packet(id));m.accept(ended(id,winner));m.accept(ended(id,winner));m.accept(packet(id,11,0,true,winner))}
  assert.deepEqual([m.snapshot().sessionWins,m.snapshot().sessionLosses,m.snapshot().streak,m.snapshot().bestWinStreak],[3,2,1,2])
})
test('end-state snapshots work without the optional MatchEnded event',()=>{const m=fixture();m.accept(packet());m.accept(packet('match-1',11,0,true,1));assert.equal(m.snapshot().sessionLosses,1)})
test('playlists retain separate counters and playlist changes never create results',()=>{
  const m=fixture();m.accept(packet('duel',10));m.accept(ended('duel'));m.accept(packet('doubles'));m.accept(ended('doubles',1));assert.equal(m.snapshot().sessionLosses,1)
  m.select(own,'1v1');assert.deepEqual([m.snapshot().sessionWins,m.snapshot().sessionLosses],[1,0]);m.select(own,'3v3');assert.equal(m.snapshot().sessionWins,0)
})
test('spectator targets, unknown identities and already ended matches do not produce results',()=>{
  const m=fixture();m.accept(packet('late',11,0,true));m.accept(ended('late'));assert.equal(m.snapshot().sessionWins,0)
  const other=packet('other');other.Data.Players[0].PrimaryId='Epic|someone_else|0';other.Data.Game.Target={Name:'Eclipse',TeamNum:0};m.accept(other);m.accept(ended('other'));assert.equal(m.snapshot().sessionWins,0);assert.equal(m.snapshot().connection,'select-player')
})
test('replays and unsupported playlists never count',()=>{
  const m=fixture();m.accept({Event:'ReplayCreated',Data:{MatchGuid:'replay'}});m.accept(packet('replay'));m.accept(ended('replay'));assert.equal(m.snapshot().sessionWins,0)
  m.accept({Event:'MatchCreated',Data:{MatchGuid:'casual'}});m.accept(packet('casual',2));m.accept(ended('casual'));assert.equal(m.snapshot().sessionWins,0)
})
test('reset preserves completed-match deduplication while allowing the next match',()=>{
  const m=fixture();m.accept(packet());m.accept(ended('match-1'));m.reset();m.accept(packet('match-1'));m.accept(ended('match-1'));assert.equal(m.snapshot().sessionWins,0)
  m.accept(packet('new'));m.accept(ended('new'));assert.equal(m.snapshot().sessionWins,1)
})
test('changed accounts and abandoned games cannot inherit another player result',()=>{
  const m=fixture();m.accept(packet());m.select('Steam|76561198000000000|0','2v2');m.accept(ended('match-1'));assert.equal(m.snapshot().sessionWins,0)
  const n=fixture();n.accept(packet());n.accept({Event:'MatchDestroyed',Data:{MatchGuid:'match-1'}});n.accept(ended('match-1'));assert.equal(n.snapshot().sessionWins,0)
})
test('malformed and contradictory team/result fields cannot invent a win',()=>{
  const m=fixture();m.accept(packet());m.accept(ended('match-1',255));m.accept(ended('match-1','0'));assert.equal(m.snapshot().sessionWins,0)
  m.accept(packet('match-1',11,1));m.accept(packet());m.accept(ended('match-1'));assert.equal(m.snapshot().sessionWins,0)
})
test('MMR remains unavailable rather than inferred from outcomes or arbitrary game fields',()=>{
  const m=fixture(),p=packet();p.Data.Game.MMR=1900;m.accept(p);m.accept(ended('match-1'));assert.equal(m.snapshot().mmr,null);assert.equal(m.snapshot().sessionMMRDelta,null);assert.equal(m.snapshot().mmrStatus,'unavailable')
})
