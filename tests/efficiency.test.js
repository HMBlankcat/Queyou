const test=require('node:test'),assert=require('node:assert/strict'),A=require('../efficiency'),M=require('../engine'),B=require('../discard-bank');
const hand=s=>A.parse(s);
test('shanten handles standard, seven-pairs, kokushi and fixed melds',()=>{
  for(const [s,expected] of [['123m456m789p2355s',0],['123m456m789p23455s',-1],['1122m3344p5566s1z',0],['1111222233334z',2],['19m19p19s1234567z',0],['119m19p19s1234567z',-1],['147m147p147s1234z',6]])assert.equal(A.shanten(A.counts(hand(s))),expected,s);
  assert.equal(A.shanten(A.counts(hand('123p456p789s1z')),1),0);
  assert.equal(A.shanten(A.counts(hand('1z')),4),0);
});
test('notation and inventory validation include red fives and sanma restrictions',()=>{
  assert.equal(A.notation(hand('123m405p789s123z')),'123m450p789s123z');assert.throws(()=>A.parse('123x'));assert.throws(()=>A.parse('8z'));
  for(const d of [{players:3,hand:hand('123m456p789s1122z')},{hand:hand('123p456p789s1122z'),visible:hand('1111z')},{hand:hand('11115555p123456s')},{hand:hand('123m456p789s1122z'),dora:Array(6).fill(0)},{hand:hand('123m456p789s11z')},{players:3,hand:hand('123p456p789s1z'),melds:[{kind:'chi',tiles:hand('234s')}]}])assert.throws(()=>A.analyze(d));
});
test('ukeire counts exclude every known tile and never put a discarded tile back',()=>{
  const data={hand:hand('123m456m789p2355s1z'),visible:hand('11s'),dora:hand('4s')},r=A.analyze(data),x=r.rows.find(r=>r.discard===27);
  assert.equal(x.shanten,0);assert.deepEqual(x.improvements,[{tile:18,count:2},{tile:21,count:3}]);assert.equal(x.total,5);
  const c=A.analyze({hand:hand('123m456m789p2355s1z')});assert.equal(c.totalUnknown,122);
});
test('quality uses weighted effective draws and the stated live-wait definition',()=>{
  const d={hand:hand('123m456m789p2355s')},r=A.analyze(d);assert.equal(A.quality(d,r.rows[0]).rate,100);
  const e={...d,visible:hand('111s444s')},x=A.analyze(e);assert.equal(x.rows[0].total,2);assert.equal(A.quality(e,x.rows[0]).rate,0);
  const q=B.find(q=>q.shanten===1),input={hand:q.hand,players:q.players},row=A.analyze(input).rows[0],v=A.quality(input,row);assert(v.rate>=0&&v.rate<=100);assert(v.improvements.every(t=>typeof t.good==='boolean'));
});
test('a fixed meld cannot create an impossible fifth-tile wait',()=>{
  const r=A.analyze({hand:hand('123p456p789s1z'),melds:[{kind:'pon',tiles:hand('111z')}]});assert.equal(r.rows[0].shanten,1);
});
test('EV agrees with exact scoring when the only unknown tile wins; exhausted pool pays zero',()=>{
  const input={hand:hand('123m456m789p2355s'),visible:[]},known=input.hand.slice(),winning=18;
  for(let t=0;t<37;t++){
    const cap=t>=34?1:[4,13,22].includes(t)?3:4,n=known.filter(x=>x===t).length;
    for(let i=n;i<cap-(t===winning?1:0);i++)input.visible.push(t);
  }
  const row=A.analyze(input).rows[0],r=A.ev(input,row,{samples:64,turns:4});
  assert.equal(r.mean,2700);assert.equal(r.winRate,100);assert.equal(r.standardError,0);
  input.visible.push(winning);const zero=A.ev(input,A.analyze(input).rows[0],{samples:64});assert.equal(zero.mean,0);assert.equal(zero.winRate,0);
});
test('EV is reproducible, finite and leaves input data intact',()=>{
  const input={hand:hand('125667m34478p235s')},before=JSON.stringify(input),r=A.analyze(input).rows[0],x=A.ev(input,r,{samples:64});assert.deepEqual(A.ev(input,r,{samples:64}),x);assert.equal(JSON.stringify(input),before);assert(Number.isFinite(x.mean)&&x.mean>=0&&x.winRate>=0&&x.winRate<=100);
});
test('720 independent exercises have distinct valid hands and correct complete answer sets',()=>{
  assert.equal(B.length,720);assert.equal(new Set(B.map(q=>q.players+':'+q.hand.join(','))).size,720);
  for(const players of [3,4])for(const s of [0,1,2])assert.equal(B.filter(q=>q.players===players&&q.shanten===s).length,120);
  for(const q of B){const r=A.analyze(q),best=r.rows.filter(x=>x.best);assert.equal(r.rows[0].shanten,q.shanten,q.id);assert.equal(r.rows[0].total,q.total,q.id);assert.deepEqual(best.map(x=>x.discard),q.answers,q.id);assert(!r.complete);}
});
test('random pure-suit exercises obey requested wait counts and exactly match scoring engine',()=>{
  const rng=A.random(1911);let previous='';
  for(const [level,min,max] of [['basic',2,3],['hard',4,6],['expert',7,9]])for(let suit=0;suit<3;suit++)for(let i=0;i<30;i++){
    const q=A.pureQuestion(level,suit,rng,previous);assert.notEqual(q.key,previous);previous=q.key;assert.equal(q.hand.length,13);assert(q.waits.length>=min&&q.waits.length<=max);const c=A.counts(q.hand);assert(c.every(n=>n<=4));
    const expected=[];for(let t=9*suit;t<9*suit+9;t++)if(c[t]<4){const win=t===9*suit+4&&q.hand.filter(x=>x===t).length===3?34+suit:t;const r=M.score({tiles:q.hand,win,melds:[]},{players:4,seatWind:1,roundWind:0,riichi:'none',tsumo:true});if(r.ok)expected.push(t);}
    assert.deepEqual(q.waits,expected);for(const t of q.waits){c[t]++;const groups=A.decomposition(c);assert(groups.length>0);assert.deepEqual(A.counts(groups[0].flat()),c);c[t]--;}
  }
});
test('pure generator terminates and does not repeat for a degenerate random source',()=>{
  for(const level of ['basic','hard','expert']){const q=A.pureQuestion(level,1,()=>0);assert.notEqual(A.pureQuestion(level,1,()=>0,q.key).key,q.key);}
});
