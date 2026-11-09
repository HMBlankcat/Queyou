const test=require('node:test'),assert=require('node:assert/strict'),P=require('../practice');
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('20 fu teaching cases have the independently specified fu in both suits and player modes',()=>{
  assert.equal(P.fuCases.length,20);
  for(const c of P.fuCases)for(const n of [3,4])for(const swap of [false,true]){
    if(n===3&&c.fourOnly)continue;
    const q=P.makeFu(c,n,swap);assert.equal(q.result.fu,c.fu,c.id);assert.equal(q.result.fuItems.reduce((s,i)=>s+i.value,0),c.fu,c.id);
    assert.equal(q.input.tiles.length+1+q.input.melds.length*3,14);
    assert(P.grade(q,{fu:c.fu}));assert(!P.grade(q,{fu:c.fu+10}));
  }
});
test('fu fundamentals cover fixed values, ron triplet and double wind rules',()=>{
  const get=id=>P.makeFu(P.fuCases.find(e=>e.id===id));
  assert.equal(get('pinfu-tsumo').result.fu,20);assert.equal(get('seven-pairs').result.fu,25);
  const ron=get('ron-triplet').result.fuItems;assert(ron.some(i=>i.label.includes('（明）')&&i.value===2));assert(ron.some(i=>i.label==='门前荣和'&&i.value===10));
  assert(get('double-wind').result.fuItems.some(i=>i.label.includes('雀头')&&i.value===4));
  assert(get('closed-kan-terminal').result.fuItems.some(i=>i.label.includes('杠')&&i.value===32));
});
test('random point exercises match an independent payment formula across all settings',()=>{
  const rng=random(17),seen=new Set();
  for(const players of [3,4])for(const level of ['basic','advanced'])for(let i=0;i<1200;i++){
    const q=P.pointQuestion({players,level},rng),c=q.ctx,h=q.han,f=q.fu;
    const base=h>=13?8000:h>=11?6000:h>=8?4000:h>=6?3000:h>=5?2000:Math.min(2000,f*2**(h+2));
    const ceil=n=>Math.ceil(n/100)*100;
    const pays=c.tsumo?(c.seatWind===0?[[ceil(base*2)+100*c.honba,players-1]]:[[ceil(base*2)+100*c.honba,1],[ceil(base)+100*c.honba,players-2]]):[[ceil(base*(c.seatWind===0?6:4))+300*c.honba,1]];
    assert.deepEqual(q.result.payments.map(p=>[p.amount,p.count]),pays);
    assert.equal(q.result.grandTotal,pays.reduce((s,[p,n])=>s+p*n,0)+1000*c.riichiSticks);
    const answers=Object.fromEntries(q.fields.map(f=>[f.id,f.answer]));assert(P.grade(q,answers));assert(!P.grade(q,{...answers,total:answers.total+100}));
    if(level==='basic'){assert.equal(c.honba,0);assert.equal(c.riichiSticks,0);assert(h<=4);}
    seen.add([players,c.seatWind,c.tsumo].join(':'));
  }
  assert.equal(seen.size,8);
});
test('fu difficulty filters exclude chi for sanma and avoid immediately repeating a case',()=>{
  const rng=random(41);let previous;
  for(const players of [3,4])for(const level of ['basic','advanced'])for(let i=0;i<150;i++){
    const q=P.fuQuestion({players,level},rng,previous);assert.notEqual(q.id,previous);previous=q.id;
    if(players===3)assert(q.input.melds.every(m=>m.kind!=='chi'));
    if(level==='basic')assert(!P.fuCases.find(e=>e.id===q.id).level);
  }
});
