/* Queyou tile-efficiency engine. Independently implemented from Mahjong rules.
 * Shanten: exhaustive block partitions; EV: finite, sampled self-draw model. */
(function(root){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./engine'):root.MJ;
  const blocks=new Map(),shantenCache=new Map(),terminals=[0,8,9,17,18,26,27,28,29,30,31,32,33];
  const base=M.redBase,counts=tiles=>M.toCounts(tiles).c;
  function allowed(t,players=4){t=base(t);return players!==3||t===0||t>=8;}
  function parse(text){
    const out=[],s=String(text).replace(/\s/g,'').toLowerCase();let end=0;
    for(const m of s.matchAll(/([0-9]+)([mpsz])/g)){
      if(m.index!==end)throw Error('请使用 123m456p789s12344z 这样的牌谱格式');
      for(const d of m[1]){const n=+d,k='mpsz'.indexOf(m[2]);if(k===3&&(n<1||n>7))throw Error('字牌使用 1z–7z');out.push(n===0?34+k:k*9+n-1);}
      end=m.index+m[0].length;
    }
    if(end!==s.length)throw Error('牌谱包含不能识别的字符');return out;
  }
  function notation(tiles){return ['m','p','s','z'].map((s,k)=>{const a=tiles.filter(t=>(base(t)<27?Math.floor(base(t)/9):3)===k).slice().sort((a,b)=>base(a)-base(b)||a-b);return a.length?a.map(t=>t>=34?'0':base(t)%9+1).join('')+s:'';}).join('');}
  // Each frontier records (completed groups, incomplete groups, selected head).
  function frontier(a,honors=false){
    const key=(honors?'h':'s')+a.join('');if(blocks.has(key))return blocks.get(key);
    const i=a.findIndex(n=>n>0);if(i<0)return [[0,0,0]];
    const out=new Map();
    function take(ids,dm,dt,dp){
      for(const t of ids)a[t]--;
      for(const [m,t,p] of frontier(a,honors))if(m+dm<=4&&t+dt<=4&&p+dp<=1){const v=[m+dm,t+dt,p+dp];out.set(v.join(''),v);}
      for(const t of ids)a[t]++;
    }
    take([i],0,0,0);
    if(a[i]>=3)take([i,i,i],1,0,0);
    if(a[i]>=2){take([i,i],0,1,0);take([i,i],0,0,1);}
    if(!honors){
      if(i<7&&a[i+1]&&a[i+2])take([i,i+1,i+2],1,0,0);
      if(i<8&&a[i+1])take([i,i+1],0,1,0);
      if(i<7&&a[i+2])take([i,i+2],0,1,0);
    }
    const list=[...out.values()],best=list.filter(v=>!list.some(w=>w!==v&&w[2]===v[2]&&w[0]>=v[0]&&w[1]>=v[1]));
    if(blocks.size>50000)blocks.clear();blocks.set(key,best);return best;
  }
  function sets(a,needed){
    const i=a.findIndex(n=>n>0);if(i<0)return needed===0;if(needed<=0)return false;
    if(a[i]>=3){a[i]-=3;const ok=sets(a,needed-1);a[i]+=3;if(ok)return true;}
    if(i<27&&i%9<7&&a[i+1]&&a[i+2]){a[i]--;a[i+1]--;a[i+2]--;const ok=sets(a,needed-1);a[i]++;a[i+1]++;a[i+2]++;if(ok)return true;}return false;
  }
  function complete(a,meldCount=0){
    if(a.reduce((s,n)=>s+n,0)!==14-3*meldCount)return false;
    if(!meldCount&&(a.filter(n=>n===2).length===7||terminals.every(t=>a[t]>0)&&terminals.reduce((s,t)=>s+a[t],0)===14))return true;
    for(let i=0;i<34;i++)if(a[i]>=2){a[i]-=2;const ok=sets(a,4-meldCount);a[i]+=2;if(ok)return true;}return false;
  }
  function waits(a,meldCount=0,players=4,physical=a){
    const out=[];for(let t=0;t<34;t++)if(allowed(t,players)&&physical[t]<4){a[t]++;if(complete(a,meldCount))out.push(t);a[t]--;}return out;
  }
  function shanten(a,meldCount=0){
    const key=meldCount+':'+a.join('');if(shantenCache.has(key))return shantenCache.get(key);
    let states=[[meldCount,0,0]];
    for(let k=0;k<4;k++){
      const group=frontier(a.slice(k*9,k===3?34:k*9+9),k===3),out=new Map();
      for(const [m,t,p] of states)for(const [mm,tt,pp] of group)if(m+mm<=4&&p+pp<=1){const v=[m+mm,Math.min(4,t+tt),p+pp];out.set(v.join(''),v);}
      states=[...out.values()];
    }
    let value=Math.min(...states.map(([m,t,p])=>8-2*m-Math.min(t,4-m)-p));
    if(!meldCount){const pairs=a.filter(n=>n>=2).length,unique=a.filter(n=>n>0).length;value=Math.min(value,6-pairs+Math.max(0,7-unique),13-terminals.filter(t=>a[t]>0).length-(terminals.some(t=>a[t]>=2)?1:0));}
    // A four-of-a-kind cannot supply a fifth winning tile, even on a theoretical wait.
    const total=a.reduce((s,n)=>s+n,0);
    if(value===0&&total===13-3*meldCount&&!waits(a,meldCount).length)value=1;
    if(shantenCache.size>70000)shantenCache.clear();shantenCache.set(key,value);return value;
  }
  function validate(input){
    const data={players:4,hand:[],melds:[],visible:[],dora:[],nuki:0,seatWind:1,roundWind:0,...input};
    if(![3,4].includes(data.players))throw Error('请选择三麻或四麻');
    for(const k of ['hand','visible','dora'])if(!Array.isArray(data[k])||data[k].some(t=>!Number.isInteger(t)||t<0||t>36||!allowed(t,data.players)))throw Error('录入了规则中不存在的牌');
    if(!Array.isArray(data.melds)||data.melds.length>4)throw Error('面子最多四组');
    for(const m of data.melds){
      if(!m||!Array.isArray(m.tiles)||m.tiles.some(t=>!Number.isInteger(t)||t<0||t>36||!allowed(t,data.players)))throw Error('面子牌不合法');
      const c=m.tiles.map(base).sort((a,b)=>a-b),kan=['ankan','minkan','kakan'].includes(m.kind);
      if(m.kind==='chi'){if(data.players===3||c.length!==3||c[0]>=27||Math.floor(c[0]/9)!==Math.floor(c[2]/9)||c[1]!==c[0]+1||c[2]!==c[0]+2)throw Error('吃牌面子不合法');}
      else if(!['pon','ankan','minkan','kakan'].includes(m.kind)||c.length!==(kan?4:3)||c.some(t=>t!==c[0]))throw Error('碰杠面子不合法');
    }
    if(!Number.isInteger(data.nuki)||data.nuki<0||data.nuki>4||data.players===4&&data.nuki)throw Error('拔北数量不合法');
    if(!Number.isInteger(data.seatWind)||data.seatWind<0||data.seatWind>=data.players||!Number.isInteger(data.roundWind)||data.roundWind<0||data.roundWind>3)throw Error('风位不合法');
    if(data.dora.length>5)throw Error('宝牌指示最多五张');
    const n=data.hand.length+3*data.melds.length;if(n!==13&&n!==14)throw Error(`手牌加每组面子按 3 张折算，需要 13 或 14 张；目前 ${n} 张`);
    const all=data.hand.concat(data.visible,data.dora,data.melds.flatMap(m=>m.tiles),Array(data.nuki).fill(30)),physical=counts(all);
    if(physical.some(n=>n>4))throw Error('手牌、面子、宝牌指示与已见牌合计不能超过同牌四张');
    for(let k=0;k<3;k++)if(all.filter(t=>t===34+k).length>1||all.filter(t=>t===4+9*k).length>3)throw Error('每门只有一张赤五和三张普通五');
    data.physical=physical;data.all=all;return data;
  }
  function remaining(data){return Array.from({length:34},(_,t)=>allowed(t,data.players)?4-data.physical[t]:0);}
  function handShanten(a,data){
    const s=shanten(a,data.melds.length);
    if(s===0&&data.melds.length&&a.reduce((x,y)=>x+y,0)===13-3*data.melds.length){
      const own=a.map((n,t)=>n+data.melds.reduce((v,m)=>v+m.tiles.filter(x=>base(x)===t).length,0));
      if(!waits(a,data.melds.length,data.players,own).length)return 1;
    }
    return s;
  }
  function advances(a,s,data,rem){
    const out=[];for(let t=0;t<34;t++)if(rem[t]>0){a[t]++;const next=shanten(a,data.melds.length);a[t]--;if(next<s)out.push({tile:t,count:rem[t]});}return out;
  }
  function analyze(input){
    const d=validate(input),a=counts(d.hand),rem=remaining(d),afterDraw=d.hand.length+3*d.melds.length===14;
    const discards=afterDraw?[...new Set(d.hand)].sort((a,b)=>base(a)-base(b)||a-b):[null],rows=[];
    for(const discard of discards){
      if(discard!==null)a[base(discard)]--;
      const s=handShanten(a,d),improvements=advances(a,s,d,rem),total=improvements.reduce((n,t)=>n+t.count,0);
      rows.push({discard,shanten:s,improvements,total,types:improvements.length});if(discard!==null)a[base(discard)]++;
    }
    rows.sort((a,b)=>a.shanten-b.shanten||b.total-a.total||(a.discard>=34)-(b.discard>=34)||a.discard-b.discard);
    for(const r of rows)r.best=r.shanten===rows[0].shanten&&r.total===rows[0].total;
    return {rows,remaining:rem,totalUnknown:rem.reduce((a,b)=>a+b,0),complete:afterDraw&&complete(a,d.melds.length),afterDraw};
  }
  function handAfter(data,discard){const a=data.hand.slice();if(discard!==null)a.splice(a.indexOf(discard),1);return a;}
  function quality(input,row){
    const d=validate(input),rem=remaining(d),a=counts(handAfter(d,row.discard)),m=d.melds.length;
    const good=(c,r)=>{const w=waits(c,m,d.players);const live=w.filter(t=>r[t]>0);return live.length>=2&&live.reduce((s,t)=>s+r[t],0)>=6;};
    if(row.shanten===0)return {rate:good(a,rem)?100:0,improvements:row.improvements};
    if(row.shanten!==1)return {rate:null,improvements:row.improvements};
    let yes=0,total=0;const items=[];
    for(const item of row.improvements){
      const t=item.tile;let best=false;a[t]++;rem[t]--;
      for(let x=0;x<34&&!best;x++)if(a[x]){a[x]--;if(handShanten(a,d)===0&&good(a,rem))best=true;a[x]++;}
      a[t]--;rem[t]++;total+=item.count;if(best)yes+=item.count;items.push({...item,good:best});
    }
    return {rate:total?100*yes/total:0,improvements:items};
  }
  function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
  function ev(input,row,options={}){
    const d=validate(input),turns=[4,8,12].includes(+options.turns)?+options.turns:8,samples=[64,128,256].includes(+options.samples)?+options.samples:128;
    const rng=random(hash(JSON.stringify(input))+(options.seed||0)),bag=[];
    for(let t=0;t<37;t++){
      if(!allowed(t,d.players))continue;
      const cap=t>=34?1:[4,13,22].includes(t)?3:4;
      for(let n=d.all.filter(x=>x===t).length;n<cap;n++)bag.push(t);
    }
    const policies=new Map(),scores=new Map(),meldCount=d.melds.length,closed=d.melds.every(m=>m.kind==='ankan'),bonus=t=>(t>=34?3:0)+d.dora.filter(i=>M.nextDora(i,d.players)===base(t)).length*3;
    function choose(hand){
      const sorted=hand.slice().sort((a,b)=>a-b),key=sorted.join(',');if(policies.has(key))return policies.get(key);
      const a=counts(hand);let best=null;
      for(const t of new Set(hand)){
        const b=base(t);a[b]--;const s=shanten(a,meldCount);
        // A fast, fixed policy: minimize shanten, retain value and connected tiles.
        const connection=a[b]*2+(b<27?[-2,-1,1,2].reduce((v,n)=>v+(Math.floor((b+n)/9)===Math.floor(b/9)&&a[b+n]?1.5-Math.abs(n)*.25:0),0):0);
        const rank=[s,bonus(t)+connection];a[b]++;
        if(!best||rank[0]<best.rank[0]||rank[0]===best.rank[0]&&rank[1]<best.rank[1])best={t,rank};
      }
      if(policies.size<12000)policies.set(key,best.t);return best.t;
    }
    let sum=0,squares=0,wins=0;
    for(let run=0;run<samples;run++){
      const hand=handAfter(d,row.discard),pool=bag.slice();let reward=0;
      for(let turn=0;turn<turns&&pool.length;turn++){
        const i=Math.floor(rng()*pool.length),tile=pool[i];pool[i]=pool[pool.length-1];pool.pop();hand.push(tile);
        const c=counts(hand);
        if(complete(c,meldCount)){
          const key=hand.slice().sort((a,b)=>a-b).join(',')+'|'+tile;
          let score=scores.get(key);
          if(score===undefined){
            const before=hand.slice();before.pop();
            const r=M.score({tiles:before,win:tile,melds:d.melds},{players:d.players,seatWind:d.seatWind,roundWind:d.roundWind,tsumo:true,riichi:closed?'riichi':'none',nuki:d.nuki,doraIndicators:d.dora,rules:{kiriage:false,doubleYakuman:true,doubleWindFu:4}});
            score=r.ok?r.best.grandTotal:0;scores.set(key,score);
          }
          if(score){reward=score;wins++;break;}
        }
        const discard=choose(hand);hand.splice(hand.indexOf(discard),1);
      }
      sum+=reward;squares+=reward*reward;
    }
    const mean=sum/samples,variance=Math.max(0,(squares-sum*sum/samples)/Math.max(1,samples-1));
    return {mean,standardError:Math.sqrt(variance/samples),winRate:wins/samples*100,samples,turns};
  }
  function decomposition(a,meldCount=0){
    const out=[];
    function walk(c,groups){const i=c.findIndex(n=>n>0);if(i<0){if(groups.length===4-meldCount)out.push(groups.map(g=>g.slice()));return;}if(c[i]>=3){c[i]-=3;walk(c,groups.concat([[i,i,i]]));c[i]+=3;}if(i<27&&i%9<7&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;walk(c,groups.concat([[i,i+1,i+2]]));c[i]++;c[i+1]++;c[i+2]++;}}
    for(let p=0;p<34;p++)if(a[p]>=2){a[p]-=2;const start=out.length;walk(a,[]);a[p]+=2;for(let i=start;i<out.length;i++)out[i].push([p,p]);}
    if(!meldCount&&a.filter(n=>n===2).length===7)out.push(a.flatMap((n,t)=>n===2?[[t,t]]:[]));return out;
  }
  function pureQuestion(level='hard',suit=1,rng=Math.random,previous=''){
    const range=level==='expert'?[7,9]:level==='basic'?[2,3]:[4,6];
    const makeHand=c=>{const hand=c.slice(0,9).flatMap((n,t)=>Array(n).fill(t+9*suit));if(c[4]===4)hand[hand.indexOf(4+9*suit)]=34+suit;return hand;};
    for(let attempt=0;attempt<4000;attempt++){
      const c=Array(34).fill(0);for(let k=0;k<4;k++){
        if(rng()<.72){const t=Math.min(6,Math.floor(rng()*7));c[t]++;c[t+1]++;c[t+2]++;}
        else{const t=Math.min(8,Math.floor(rng()*9));c[t]+=3;}
      }
      c[Math.min(8,Math.floor(rng()*9))]+=2;if(c.some(n=>n>4))continue;
      const tiles=c.flatMap((n,t)=>Array(n).fill(t)),removed=tiles[Math.min(13,Math.floor(rng()*14))];c[removed]--;
      const w=waits(c),key=c.slice(0,9).join('');if(w.length<range[0]||w.length>range[1]||key===previous)continue;
      const offset=9*suit;return {key,hand:makeHand(c),waits:w.map(t=>t+offset),level};
    }
    // Exhaustive fallback guarantees the requested difficulty even for a constant RNG.
    let answer=null;const c=Array(34).fill(0);
    function visit(i,left){if(answer)return;if(i===9){if(left)return;const key=c.slice(0,9).join('');if(key===previous)return;const w=waits(c);if(w.length>=range[0]&&w.length<=range[1])answer={key,hand:makeHand(c),waits:w.map(t=>t+9*suit),level};return;}for(let n=Math.max(0,left-(8-i)*4);n<=Math.min(4,left);n++){c[i]=n;visit(i+1,left-n);if(answer)break;}c[i]=0;}
    visit(0,13);if(!answer)throw Error('暂时无法生成，请重试');return answer;
  }
  const api={parse,notation,allowed,counts,complete,waits,shanten,validate,analyze,quality,ev,pureQuestion,decomposition,random,clearCaches(){blocks.clear();shantenCache.clear();}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MJEfficiency=api;
})(typeof window==='undefined'?globalThis:window);
