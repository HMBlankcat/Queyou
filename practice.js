(function(root){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./engine'):root.MJ;
  const E=typeof module!=='undefined'&&module.exports?require('./examples'):root.MJExamples;
  const choose=(a,rng)=>a[Math.min(a.length-1,Math.floor(rng()*a.length))];
  function pointQuestion(options={},rng=Math.random){
    const players=options.players===3?3:4,advanced=options.level==='advanced';
    const ctx={players,seatWind:choose([0,1],rng),tsumo:choose([false,true],rng),honba:advanced?choose([0,1,2,3],rng):0,riichiSticks:advanced?choose([0,1,2],rng):0};
    const han=choose(advanced?[1,2,3,4,5,6,7,8,10,11,12,13]:[1,2,3,4],rng);
    const fus=(advanced?[20,25,30,40,50,60,70,80,90,100,110]:[30,40,50,60]).filter(f=>!(f===20&&(!ctx.tsumo||han<2)||f===25&&(han<2||ctx.tsumo&&han<3)||f===110&&ctx.tsumo&&han<2));
    const fu=choose(fus,rng),result=M.quickScore(han,fu,ctx,0);
    const fields=result.payments.map((p,i)=>({id:'pay'+i,label:ctx.tsumo?`${p.from}支付（${p.count} 人，每人）`:'放铳者支付',answer:p.amount}));
    fields.push({id:'total',label:'和牌者总收入（含本场与供托）',answer:result.grandTotal});
    return {kind:'points',ctx,han,fu,result,fields};
  }
  const call=(kind,tiles)=>({kind,tiles});
  const common=['123p','456p','789s','234s','55s'];
  const fuCases=[
    {id:'pinfu-ron',topic:'平和荣和',groups:common,win:'4s',fu:30},
    {id:'pinfu-tsumo',topic:'平和自摸',groups:common,win:'4s',ctx:{tsumo:true},fu:20,note:'平和自摸固定 20 符，不再加自摸的 2 符。'},
    {id:'tanki',topic:'单骑等待',groups:common,win:'5s',fu:40},
    {id:'kanchan',topic:'嵌张等待',groups:common,win:'3s',fu:40},
    {id:'penchan',topic:'边张等待',groups:['123p','456p','789s','123s','55s'],win:'3s',fu:40},
    {id:'dragon-pair',topic:'三元牌雀头',groups:['123p','456p','789s','234s','55z'],win:'4s',fu:40},
    {id:'double-wind',topic:'连风雀头',groups:['123p','456p','789s','234s','11z'],win:'4s',ctx:{seatWind:0},fu:40,note:'东场东家：东雀头同时是自风与场风，雀魂计 4 符。'},
    {id:'seven-pairs',topic:'七对子',groups:['11p','33p','55p','77p','22s','44s','66z'],win:'6z',ctx:{riichi:'none'},fu:25,note:'七对子固定 25 符，不加门前荣和、等待或雀头符，也不进位到 30。'},
    {id:'open-honor',topic:'幺九明刻',groups:[call('pon','555z'),'123p','456p','789s','55s'],win:'9s',ctx:{riichi:'none'},fu:30},
    {id:'closed-simple',topic:'中张暗刻',groups:['222p','456p','789s','234s','55z'],win:'4s',fu:40},
    {id:'closed-terminal',topic:'幺九暗刻',groups:['111p','456p','789s','234s','55z'],win:'4s',fu:40},
    {id:'ron-triplet',topic:'荣和完成的刻子',groups:['222p','456p','789s','234s','55z'],win:'2p',fu:40,note:'荣和完成的中张刻子按明刻计 2 符，但整手依然门前，可加门前荣和 10 符。'},
    {id:'tsumo-triplet',topic:'自摸完成的刻子',groups:['222p','456p','789s','234s','55z'],win:'2p',ctx:{tsumo:true},fu:30},
    {id:'open-simple',topic:'中张明刻',groups:[call('pon','222p'),'456p','777z','999s','55z'],win:'6p',ctx:{riichi:'none'},fu:40,level:'advanced',note:'本例有两组幺九暗刻与一组中张明刻；三元牌雀头另加 2 符。'},
    {id:'open-kan-simple',topic:'中张明杠',groups:[call('minkan','2222p'),'456p','789s','555z','22s'],win:'9s',ctx:{riichi:'none'},fu:40,level:'advanced'},
    {id:'open-kan-terminal',topic:'幺九明杠',groups:[call('minkan','1111p'),'456p','789s','555z','22s'],win:'9s',ctx:{riichi:'none'},fu:50,level:'advanced'},
    {id:'closed-kan-simple',topic:'中张暗杠',groups:[call('ankan','2222p'),'456p','789s','555z','22s'],win:'9s',fu:60,level:'advanced'},
    {id:'closed-kan-terminal',topic:'幺九暗杠',groups:[call('ankan','1111p'),'456p','789s','555z','22s'],win:'9s',fu:70,level:'advanced'},
    {id:'open-runs-ron',topic:'副露平和形荣和',groups:[call('chi','234p'),'456p','678s','234s','55p'],win:'4s',ctx:{riichi:'none'},fu:30,level:'advanced',fourOnly:true,note:'这是可副露断幺九。副露全顺子、非役牌雀头、两面荣和仍按最低 30 符。'},
    {id:'open-runs-tsumo',topic:'副露平和形自摸',groups:[call('chi','234p'),'456p','678s','234s','55p'],win:'4s',ctx:{riichi:'none',tsumo:true},fu:30,level:'advanced',fourOnly:true}
  ];
  function makeFu(e,players=4,swap=false){
    const trans=s=>swap?s.replace(/[ps]/g,c=>c==='p'?'s':'p'):s;
    const ctx={players,seatWind:1,roundWind:0,riichi:'riichi',tsumo:false,honba:0,riichiSticks:0,nuki:0,rules:{kiriage:false,doubleYakuman:true,doubleWindFu:4},...e.ctx};
    const groups=e.groups.map(g=>typeof g==='string'?trans(g):{kind:g.kind,tiles:trans(g.tiles)}),input=E.input({groups,win:trans(e.win)}),scored=M.score(input,ctx);
    if(!scored.ok||scored.best.yakuman||scored.best.fu!==e.fu)throw Error('练习题校验失败：'+e.id+' / '+(scored.reason||scored.best.fu));
    return {kind:'fu',id:e.id,topic:e.topic,note:e.note||'',ctx,input,result:scored.best,fields:[{id:'fu',label:'最终符数（进位后；特殊固定符数除外）',answer:e.fu}]};
  }
  function fuQuestion(options={},rng=Math.random,previous){
    const players=options.players===3?3:4;
    const pool=fuCases.filter(e=>(players===4||!e.fourOnly)&&(options.level==='advanced'||!e.level)&&e.id!==previous);
    return makeFu(choose(pool,rng),players,rng()<.5);
  }
  function grade(q,values){return q.fields.every(f=>Number.isInteger(values[f.id])&&values[f.id]===f.answer);}
  const api={pointQuestion,fuQuestion,makeFu,fuCases,grade};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MJPractice=api;
})(typeof window==='undefined'?globalThis:window);
