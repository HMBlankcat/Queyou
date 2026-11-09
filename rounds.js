(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function initial(){return {dealer:0,roundWind:0,hand:1,honba:0,serial:1};}
  function validate(r,n){
    if(!r || !Number.isInteger(r.dealer)||r.dealer<0||r.dealer>=n || !Number.isInteger(r.roundWind)||r.roundWind<0||r.roundWind>3 || !Number.isInteger(r.hand)||r.hand<1||r.hand>n || !Number.isInteger(r.honba)||r.honba<0||r.honba>999 || !Number.isInteger(r.serial)||r.serial<1)throw Error('局况无效，请检查庄家、局数、场风与本场');
    return copy(r);
  }
  function advance(r,outcome,n){
    r=validate(r,n); if(r.finished)throw Error('本桌已结束，请新建对局或校正局况');const next=copy(r);
    if(!outcome||!['win','draw','abort'].includes(outcome.type))throw Error('结局类型无效');
    let rotate=false;
    if(outcome.type==='win'){
      if(!Number.isInteger(outcome.winner)||outcome.winner<0||outcome.winner>=n)throw Error('和牌玩家无效');
      rotate=outcome.winner!==r.dealer;next.honba=rotate?0:r.honba+1;
    } else if(outcome.type==='draw'){
      if(!Array.isArray(outcome.ready)||outcome.ready.length!==n||outcome.ready.some(x=>typeof x!=='boolean'))throw Error('请确认各家听牌状态');
      rotate=!outcome.ready[r.dealer];next.honba++;
    } else next.honba++;
    if(rotate){next.dealer=(r.dealer+1)%n;next.hand++;if(next.hand>n){next.hand=1;next.roundWind++;}}
    next.serial++;
    // No automatic placement/end-game settlement: north-round boundary requires an explicit new table.
    if(next.roundWind>3){next.roundWind=3;next.hand=n;next.finished=true;}
    return next;
  }
  function current(g){
    let r=g.roundBase?validate(g.roundBase,g.names.length):initial();
    const offset=Math.min(g.roundBaseIndex||0,g.events.length);
    for(const e of g.events.slice(offset)){
      const m=e.meta||{};
      if(m.type==='round-adjust')r=validate(m.roundState,g.names.length);
      else if(['win','draw','abort'].includes(m.type))r=advance(r,m,g.names.length);
    }
    return r;
  }
  function label(r){return r.finished?'北场已结束':`${['东','南','西','北'][r.roundWind]}${r.hand}局 · ${r.honba} 本场`;}
  function riichiPlayers(g){const r=current(g);return g.events.filter(e=>e.meta&&e.meta.type==='riichi'&&e.meta.roundSerial===r.serial).map(e=>e.meta.player);}
  const api={initial,validate,advance,current,label,riichiPlayers};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MJRounds=api;
})(typeof window==='undefined'?globalThis:window);
