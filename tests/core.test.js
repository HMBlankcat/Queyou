const test = require('node:test');
const assert = require('node:assert/strict');
const MJ = require('../engine.js'), L = require('../ledger.js');
function tiles(text) { const out=[]; for(const m of text.matchAll(/([0-9]+)([mpsz])/g)) { const base={m:0,p:9,s:18,z:27}[m[2]]; for(const d of m[1])out.push(d==='0'?34+base/9:base+Number(d)-1); } return out; }
function score(text, options={}, melds=[]) { const hand=tiles(text),win=hand.pop();return MJ.score({tiles:hand,win,melds}, {seatWind:1,roundWind:0,riichi:'none',rules:{kiriage:false,doubleYakuman:true},...options}); }
function best(...args){const r=score(...args);assert.equal(r.ok,true,r.reason);return r.best;}
function has(b,name){return b.yaku.some(y=>y.name===name);}
test('four han thirty fu is 7700, no kiriage',()=>{assert.equal(MJ.quickScore(4,30,{},0).grandTotal,7700);assert.equal(MJ.quickScore(3,60,{},0).grandTotal,7700);});
test('dealer ron and tsumo limits',()=>{assert.equal(MJ.quickScore(5,30,{seatWind:0},0).grandTotal,12000);assert.deepEqual(MJ.quickScore(5,30,{seatWind:0,tsumo:true},0).payments,[{from:'每家',amount:4000,count:3}]);});
test('sanma tsumo loss and honba, dealer',()=>{const r=MJ.quickScore(5,30,{players:3,seatWind:0,tsumo:true,honba:2,riichiSticks:1},0);assert.equal(r.grandTotal,9400);assert.deepEqual(r.payments,[{from:'每家',amount:4200,count:2}]);});
test('sanma tsumo loss and honba, nondealer',()=>{const r=MJ.quickScore(5,30,{players:3,tsumo:true,honba:2},0);assert.equal(r.grandTotal,6400);assert.deepEqual(r.payments.map(p=>[p.amount,p.count]),[[4200,1],[2200,1]]);});
test('ron payment includes honba; pot separate',()=>{const r=MJ.quickScore(4,30,{honba:2,riichiSticks:2},0);assert.equal(r.payments[0].amount,8300);assert.equal(r.grandTotal,10300);});
test('double and stacked yakuman',()=>assert.equal(MJ.quickScore(1,30,{seatWind:0},3).grandTotal,144000));
test('invalid quick combinations and inputs',()=>{for(const [h,f,c]of [[1,20,{tsumo:true}],[2,20,{}],[2,25,{tsumo:true}],[0,30,{}],[1,30,{honba:-1}],[1.5,30,{}]])assert.throws(()=>MJ.quickScore(h,f,c,0));});
test('all payment matrices conserve totals',()=>{for(const players of [3,4])for(const seatWind of [0,1])for(const tsumo of [false,true])for(const han of [1,2,3,4,5,6,8,11,13]){const r=MJ.quickScore(han,30,{players,seatWind,tsumo,honba:3,riichiSticks:2},0);assert.equal(r.payments.reduce((s,p)=>s+p.amount*p.count,0)+r.stickExtra,r.grandTotal);}});
test('original example is 4 han 30 fu 7700',()=>{const b=best('34234m567p67888s2m',{riichi:'riichi'});assert.equal(b.han,4);assert.equal(b.fu,30);assert.equal(b.grandTotal,7700);});
test('red winning tile is normalized and counts aka',()=>{const b=best('234m234p46s678s22p0s',{riichi:'riichi'});assert.equal(b.akaHan,1);assert.equal(b.wait,'kanchan');});
test('open pinfu shape ron has minimum 30 fu',()=>{const b=best('456p678s22p34s2s',{},[{kind:'chi',tiles:tiles('234m')}]);assert.equal(b.fu,30);assert(has(b,'断幺九'));});
test('dora alone cannot win',()=>{const r=score('456p789s55p23s4s',{doraIndicators:tiles('4p')},[{kind:'chi',tiles:tiles('123m')}]);assert.equal(r.ok,false);assert.match(r.reason,/无役/);});
test('seven pairs includes tanyao',()=>{const b=best('22335566p224488s');assert(has(b,'七对子'));assert(has(b,'断幺九'));assert.equal(b.fu,25);});
test('seven pairs haitei is recognized',()=>{const b=best('11335577p224488s',{tsumo:true,haitei:true});assert(has(b,'海底摸月'));});
test('pure chuuren checks pre-win shape',()=>{const b=best('11123456789995p');assert(has(b,'纯正九莲宝灯'));assert.equal(b.yakumanCount,2);});
test('ordinary chuuren not doubled',()=>{const b=best('11123456789959p');assert(has(b,'九莲宝灯'));assert.equal(b.yakumanCount,1);});
test('kokushi thirteen wait',()=>assert.equal(best('19m19p19s12345671z').yakumanCount,2));
test('ordinary kokushi single wait',()=>assert.equal(best('119m19p19s1234567z').yakumanCount,1));
test('honor seven pairs is yakuman',()=>assert(has(best('11223344556677z'),'字一色')));
test('seat and round wind both count',()=>{const b=best('123m456p789s222z55p',{seatWind:1,roundWind:1});assert.equal(b.yaku.find(y=>y.name==='役牌·南').han,2);});
test('sanma man dora wraps 1/9',()=>{assert.equal(MJ.nextDora(0,3),8);assert.equal(MJ.nextDora(8,3),0);const b=best('999m123456p789s22s',{players:3,riichi:'riichi',doraIndicators:[0]});assert.equal(b.doraHan,3);});
test('nuki stacks with north dora',()=>{const b=best('111m123456p789s22s',{players:3,riichi:'riichi',nuki:2,doraIndicators:[29]});assert.equal(b.nukiHan,2);assert.equal(b.doraHan,2);});
test('sanma forbids chi and 2-8 man',()=>{assert.equal(score('234m234p456s678s22p',{players:3,riichi:'riichi'}).ok,false);assert.equal(score('456p678s22p34s2s',{players:3},[{kind:'chi',tiles:tiles('234p')}]).ok,false);});
test('five identical including meld rejected',()=>assert.equal(score('111m123p456s22z',{},[{kind:'pon',tiles:tiles('111m')}]).ok,false));
test('cross-suit chi rejected',()=>assert.equal(score('456p678s22p34s2s',{},[{kind:'chi',tiles:[7,8,9]}]).ok,false));
test('red duplicates and indicator inventory rejected',()=>{assert.equal(score('234m234p406s678s00p',{riichi:'riichi'}).ok,false);assert.equal(score('111m123456p789s22s',{riichi:'riichi',doraIndicators:[0,0]}).ok,false);});
test('invalid contexts rejected',()=>{for(const c of [{riichi:'none',ippatsu:true},{tsumo:true,chankan:true},{haitei:true},{rinshan:true,tsumo:true},{nuki:1},{players:3,nuki:5},{seatWind:3,players:3},{honba:-1}])assert.equal(score('123456m123789p22s',c).ok,false);});
test('open riichi rejected',()=>assert.equal(score('456p678s22p34s2s',{riichi:'riichi'},[{kind:'chi',tiles:tiles('234m')}]).ok,false));
test('riichi deposit, win payout and zero-sum',()=>{let g=L.create(['甲','乙','丙','丁'],25000);g=L.add(g,'甲立直',[{from:0,to:'pot',amount:1000}],{type:'riichi',player:0});const r=MJ.quickScore(4,30,{seatWind:1,riichiSticks:1,honba:1},0);g=L.settle(g,r,1,0,2,false,'东一局');assert.deepEqual(L.balances(g),{points:[24000,34000,17000,25000],pot:0});g.events.pop();assert.deepEqual(L.balances(g),{points:[24000,25000,25000,25000],pot:1000});});
test('sanma named tsumo distribution',()=>{let g=L.create(['甲','乙','丙'],35000);g=L.settle(g,MJ.quickScore(5,30,{players:3,tsumo:true,honba:1},0),1,0,2,true,'自摸');assert.deepEqual(L.balances(g).points,[30900,41200,32900]);});
test('draw all tenpai combinations conserve scores',()=>{for(const n of [3,4])for(let mask=0;mask<2**n;mask++){let g=L.create(['甲','乙','丙','丁'].slice(0,n),25000);const ready=Array.from({length:n},(_,i)=>Boolean(mask&(1<<i))),count=ready.filter(Boolean).length;g=L.draw(g,ready,'流局');const b=L.balances(g);assert.equal(b.points.reduce((a,b)=>a+b,0),n*25000);if(count&&count<n)b.points.forEach((p,i)=>assert.equal(p-25000,ready[i]?(n===3?2000:3000)/count:-(n===3?2000:3000)/(n-count)));}});
test('ledger validation rejects invalid transfers',()=>{const g=L.create(['甲','乙','丙'],35000);for(const t of [{from:0,to:0,amount:1000},{from:0,to:1,amount:-100},{from:'pot',to:1,amount:1000},{from:0,to:7,amount:1000},{from:0,to:'pot',amount:100}])assert.throws(()=>L.add(g,'x',[t]));assert.throws(()=>L.create(['甲','甲','乙'],25000));});
test('backup validates without losing timestamps',()=>{let g=L.create(['甲','乙','丙'],35000);g=L.add(g,'转点',[{from:0,to:1,amount:1000}]);const restored=L.validate(JSON.parse(JSON.stringify(g)));assert.deepEqual(restored,g);});
test('CSV contains per-event changes and totals and neutralizes formulas',()=>{let g=L.create(['=甲','乙','丙'],35000);g=L.add(g,'转点',[{from:0,to:1,amount:1000}]);const csv=L.csv(g);assert(csv.includes("'=甲"));assert(csv.includes('34000'));assert(csv.includes('36000'));assert(csv.includes('→'));});
