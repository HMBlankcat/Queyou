const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../rounds'),L=require('../ledger'),E=require('../examples'),M=require('../engine');
test('every listed yaku has a valid winning example, including double yakuman',()=>{
  assert.equal(E.entries.length,41);
  for(const y of M.YAKU_TABLE)assert(E.entries.some(e=>e.name===y.name),'missing '+y.name);
  for(const e of E.entries){const result=M.score(E.input(e),e.ctx);assert(result.ok,e.name+': '+result.reason);assert(result.best.yaku.some(y=>y.name===e.name||e.name==='役牌'&&y.name.startsWith('役牌')),e.name);}
});
test('dealer win repeats; nondealer win clears honba and rotates',()=>{
  const r={...R.initial(),honba:2};assert.deepEqual(R.advance(r,{type:'win',winner:0},4),{...r,honba:3,serial:2});
  assert.deepEqual(R.advance(r,{type:'win',winner:2},4),{dealer:1,roundWind:0,hand:2,honba:0,serial:2});
});
test('all exhaustive draw configurations increment honba and retain dealer iff ready',()=>{
  for(const n of [3,4])for(let dealer=0;dealer<n;dealer++)for(let mask=0;mask<2**n;mask++){
    const r={...R.initial(),dealer,hand:dealer+1,honba:3};const ready=Array.from({length:n},(_,i)=>!!(mask&(1<<i)));
    const next=R.advance(r,{type:'draw',ready},n);assert.equal(next.honba,4);assert.equal(next.dealer,ready[dealer]?dealer:(dealer+1)%n);
  }
});
test('four and three player last hand advance round wind',()=>{
  for(const n of [3,4]){const next=R.advance({...R.initial(),dealer:n-1,hand:n},{type:'win',winner:0},n);assert.equal(next.roundWind,1);assert.equal(next.hand,1);assert.equal(next.dealer,0);}
});
test('abort retains dealer, advances honba, retains pot',()=>{
  let g=L.create(['a','b','c'],35000);g.roundBase=R.initial();g.roundBaseIndex=0;
  g=L.add(g,'riichi',[{from:0,to:'pot',amount:1000}],{type:'riichi',player:0,roundSerial:1});
  g=L.add(g,'abort',[],{type:'abort'});assert.equal(R.current(g).dealer,0);assert.equal(R.current(g).honba,1);assert.equal(L.balances(g).pot,1000);assert.deepEqual(R.riichiPlayers(g),[]);
});
test('undo restores scores and round as an atomic event',()=>{
  let g=L.create(['a','b','c','d'],25000);g.roundBase=R.initial();g.roundBaseIndex=0;
  const before=JSON.parse(JSON.stringify(g));g=L.settle(g,M.quickScore(2,30,{},0),1,0,2,false,'win');assert.equal(R.current(g).dealer,1);
  g.events.pop();assert.deepEqual(R.current(g),R.current(before));assert.deepEqual(L.balances(g),L.balances(before));
});
test('round correction is reversible and validated',()=>{
  let g=L.create(['a','b','c'],35000);g.roundBase=R.initial();g.roundBaseIndex=0;
  const roundState={dealer:2,roundWind:1,hand:3,honba:2,serial:1};g=L.add(g,'adjust',[],{type:'round-adjust',roundState});assert.deepEqual(R.current(g),roundState);g.events.pop();assert.deepEqual(R.current(g),R.initial());assert.throws(()=>R.validate({...roundState,dealer:3},3));
});
test('backup preserves automatic round state and migration anchor',()=>{
  let g=L.create(['a','b','c'],35000);g.roundBase={...R.initial(),dealer:1,hand:2,honba:3};g.roundBaseIndex=0;
  g=L.add(g,'draw',[],{type:'draw',ready:[false,true,false]});const restored=L.validate(JSON.parse(JSON.stringify(g)));assert.deepEqual(R.current(restored),R.current(g));assert.deepEqual(restored,g);
});
test('legacy events before the migration anchor do not advance the new round',()=>{
  let g=L.create(['a','b','c'],35000);g=L.add(g,'old draw',[],{type:'draw',ready:[false,false,false]});g.roundBase=R.initial();g.roundBaseIndex=1;assert.deepEqual(R.current(g),R.initial());g=L.add(g,'new draw',[],{type:'draw',ready:[false,false,false]});assert.equal(R.current(g).dealer,1);
});
test('correcting the same hand preserves declared riichi and migration backup flag',()=>{
  let g=L.create(['a','b','c'],35000);g.roundBase=R.initial();g.roundBaseIndex=0;g.migrated=true;
  g=L.add(g,'riichi',[{from:1,to:'pot',amount:1000}],{type:'riichi',player:1,roundSerial:1});
  g=L.add(g,'correct',[],{type:'round-adjust',roundState:{...R.initial(),honba:2}});
  assert.deepEqual(R.riichiPlayers(g),[1]);assert.equal(L.validate(g).migrated,true);
});
test('a finished round cannot accidentally settle a second time',()=>{
  const r=R.advance({...R.initial(),roundWind:3,hand:3,dealer:2},{type:'win',winner:0},3);
  assert.equal(r.finished,true);assert.throws(()=>R.advance(r,{type:'abort'},3));
});
