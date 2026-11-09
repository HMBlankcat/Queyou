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
    const base=q.result.yakuman?8000*q.result.yakumanCount:h>=13?8000:h>=11?6000:h>=8?4000:h>=6?3000:h>=5?2000:Math.min(2000,f*2**(h+2));
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
test('point exercises give complete legal hands and indicators without repeating the previous seed',()=>{
  const M=require('../engine'),rng=random(987);let previous;
  const coverage={red:false,kan:false,nuki:false,yakuman:false,dora:false};
  for(const players of [3,4])for(const level of ['basic','advanced'])for(let i=0;i<400;i++){
    const q=P.pointQuestion({players,level},rng,previous);assert.notEqual(q.id,previous);previous=q.id;
    const {input,ctx}=q;assert.equal(input.tiles.length+1+input.melds.length*3,14);
    assert.deepEqual(M.score(input,ctx).best,q.result);
    const held=input.tiles.concat(input.win,input.melds.flatMap(m=>m.tiles));
    const all=held.concat(ctx.doraIndicators,ctx.uraIndicators,Array(ctx.nuki).fill(30));
    for(let t=0;t<34;t++)assert(all.filter(x=>M.redBase(x)===t).length<=4,`${q.id} has more than four tile ${t}`);
    for(const t of [4,13,22])assert(all.filter(x=>x===t).length<=3);
    for(const t of [34,35,36])assert(all.filter(x=>x===t).length<=1);
    assert.equal(ctx.doraIndicators.length,1+input.melds.filter(m=>m.tiles.length===4).length);
    assert.equal(ctx.uraIndicators.length,ctx.riichi==='none'?0:ctx.doraIndicators.length);
    if(players===3){assert(all.every(t=>!(M.redBase(t)>0&&M.redBase(t)<8)));assert(input.melds.every(m=>m.kind!=='chi'));}
    if(level==='basic'){assert.equal(q.result.doraHan+q.result.uraHan+q.result.akaHan,0);assert(!q.result.yakuman);}
    coverage.red ||= held.some(t=>t>=34);coverage.kan ||= input.melds.some(m=>m.tiles.length===4);
    coverage.nuki ||= ctx.nuki>0;coverage.yakuman ||= q.result.yakuman;coverage.dora ||= q.result.doraHan>0;
  }
  assert(Object.values(coverage).every(Boolean),JSON.stringify(coverage));
});
test('fu difficulty filters exclude chi for sanma and avoid immediately repeating a case',()=>{
  const rng=random(41);let previous;
  for(const players of [3,4])for(const level of ['basic','advanced'])for(let i=0;i<150;i++){
    const q=P.fuQuestion({players,level},rng,previous);assert.notEqual(q.id,previous);previous=q.id;
    if(players===3)assert(q.input.melds.every(m=>m.kind!=='chi'));
    if(level==='basic')assert(!P.fuCases.find(e=>e.id===q.id).level);
  }
});
