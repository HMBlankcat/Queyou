(function(){
  'use strict';
  const A=window.MJEfficiency,$=id=>document.getElementById(id),ANALYSIS='queyou.analysis.v1',TRAINING='queyou.training.v1';
  const tile=t=>`<span class="tile" aria-label="${MJ.tileLabel(t)}">${MJTiles.svg(t)}</span>`;
  const tiles=ts=>ts.map(tile).join(''),fmt=n=>Math.round(n).toLocaleString('zh-CN'),sname=s=>s<0?'完成形':s===0?'听牌':s+' 向听';
  const fresh=()=>({players:4,hand:[],melds:[],visible:[],dora:[],nuki:0,seatWind:1,roundWind:0});
  const empty=()=>({answered:0,correct:0,streak:0,best:0});
  let input=fresh(),record={discard:empty(),pure:empty(),position:{}},target='hand',draft=[],result=null,revision=0,timer,worker=null,sequence=0,requests=new Map(),detailsBusy=false;
  let question=null,choice=null,submitted=false,pure=null,pureChoice=new Set(),pureSubmitted=false,pureBusy=false,pureRevision=0,trainingError='';
  function message(id,text){$(id).textContent=text;}
  try{const saved=JSON.parse(localStorage.getItem(ANALYSIS));if(saved&&[3,4].includes(saved.players)&&['hand','visible','dora','melds'].every(k=>Array.isArray(saved[k])))input={...fresh(),...saved};}catch(_){}
  try{const saved=JSON.parse(localStorage.getItem(TRAINING));if(saved){for(const k of ['discard','pure']){const s=saved[k];if(s&&['answered','correct','streak','best'].every(x=>Number.isSafeInteger(s[x])&&s[x]>=0)&&s.correct<=s.answered&&s.streak<=s.best&&s.best<=s.correct)record[k]=s;}if(saved.position&&typeof saved.position==='object')record.position=saved.position;}}catch(_){}
  function saveInput(){try{localStorage.setItem(ANALYSIS,JSON.stringify(input));}catch(_){message('effError','输入未能保存，请先清理手机空间。');}}
  function cancel(){revision++;if(worker)worker.terminate();worker=null;for(const r of requests.values())r.reject(Error('cancelled'));requests.clear();detailsBusy=false;$('effDetails').disabled=false;}
  function request(kind,payload={}){
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      if(typeof Worker!=='undefined'){
        if(!worker){try{worker=new Worker('efficiency-worker.js');worker.onmessage=e=>{const p=requests.get(e.data.id);if(p){requests.delete(e.data.id);e.data.ok?p.resolve(e.data.result):p.reject(Error(e.data.error));}};worker.onerror=()=>{const pending=[...requests.values()];requests.clear();worker.terminate();worker=null;pending.forEach(p=>fallback(p.kind,p.payload).then(p.resolve,p.reject));};}catch(_){worker=null;}}
        if(worker){requests.set(id,{resolve,reject,kind,payload});worker.postMessage({id,kind,...payload});return;}
      }
      fallback(kind,payload).then(resolve,reject);
    });
  }
  function fallback(kind,p){return new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(kind==='analyze'?A.analyze(p.input):kind==='details'?{quality:A.quality(p.input,p.row),ev:A.ev(p.input,p.row,p.options)}:A.pureQuestion(p.options.level,p.options.suit,Math.random,p.options.previous));}catch(e){reject(e);}},0));}
  function totalTiles(){return input.hand.length+3*input.melds.length;}
  function editor(){
    $('effPlayers').value=String(input.players);$('effSeat').value=String(input.seatWind);$('effRound').value=String(input.roundWind);$('effNuki').value=input.nuki;$('effNukiLabel').classList.toggle('hidden',input.players!==3);
    $('effSeat').querySelector('[value="3"]').disabled=input.players===3;
    message('effCount',`${totalTiles()} / 13 或 14 张`);
    $('effHand').innerHTML=input.hand.map((t,i)=>`<button class="tile" data-remove="hand:${i}" aria-label="删除手牌${MJ.tileLabel(t)}">${MJTiles.svg(t)}<small>×</small></button>`).join('')||'<p class="hint">录入摸牌前 13 张，或摸牌后 14 张。面子另录。</p>';
    $('effMelds').innerHTML=input.melds.map((m,i)=>`<div class="eff-meld"><small>${{chi:'吃',pon:'碰',ankan:'暗杠',minkan:'明杠',kakan:'加杠'}[m.kind]}</small><div class="eff-tiles">${tiles(m.tiles)}</div><button data-remove="melds:${i}" aria-label="删除面子">×</button></div>`).join('');
    for(const k of ['visible','dora'])$('eff-'+k).innerHTML=input[k].map((t,i)=>`<button class="tile" data-remove="${k}:${i}" aria-label="删除${MJ.tileLabel(t)}">${MJTiles.svg(t)}</button>`).join('')||'<span class="hint">尚未录入</span>';
    $('effTarget').value=target;message('effDraft',draft.length?'待选面子：'+draft.map(MJ.tileLabel).join('、'):['chi','pon','ankan','minkan','kakan'].includes(target)?'从牌库选满一组，自动加入面子区。':'点上方已录入的牌可以删除。');
    const used=input.hand.concat(input.visible,input.dora,input.melds.flatMap(m=>m.tiles),Array(input.nuki).fill(30),draft),c=A.counts(used);
    $('effPalette').innerHTML=[0,1,2,3].map(k=>`<div class="palette-row"><span class="row-name">${['万','筒','索','字'][k]}</span>${Array.from({length:k===3?7:9},(_,n)=>n+9*k).map(t=>paletteButton(t,c[t]>=4||used.filter(x=>x===t).length>=([4,13,22].includes(t)?3:4))).join('')}</div>`).join('')+`<div class="eff-red"><span>赤五</span>${[34,35,36].map(t=>paletteButton(t,used.includes(t)||c[MJ.redBase(t)]>=4)).join('')}</div>`;
  }
  function paletteButton(t,disabled){return `<button class="tile" data-add="${t}" aria-label="加入${MJ.tileLabel(t)}" ${disabled||!A.allowed(t,input.players)?'disabled':''}>${MJTiles.svg(t)}</button>`;}
  function changed(){saveInput();editor();schedule();}
  function schedule(){clearTimeout(timer);cancel();result=null;$('effResults').innerHTML='';message('effError','');message('effStatus','');if([13,14].includes(totalTiles()))timer=setTimeout(analyze,250);else message('effStatus','录入完整的 13 或 14 张后自动分析。');}
  async function analyze(){
    clearTimeout(timer);cancel();const rev=revision;message('effError','');
    try{A.validate(input);message('effStatus','正在分析向听与进张…');const r=await request('analyze',{input});if(rev!==revision)return;result=r;renderResults();message('effStatus',r.complete?'当前已是完成形；下方是继续舍牌的比较，请先检查是否可以和牌。':`${r.afterDraw?'已比较 '+r.rows.length+' 种舍牌':'摸牌前手牌分析'} · 未知牌 ${r.totalUnknown} 张`);}
    catch(e){if(e.message!=='cancelled'&&rev===revision){result=null;message('effError',e.message);message('effStatus','');$('effResults').innerHTML='';}}
  }
  function improvementHtml(items){return items.length?`<div class="eff-improvements">${items.map(i=>`<div class="eff-improvement ${i.good===true?'good':i.good===false?'poor':''}">${tile(i.tile)}<small>余 ${i.count} 张${i.good===true?' · 好形':i.good===false?' · 普通':''}</small></div>`).join('')}</div>`:'<p class="hint">没有剩余的有效进张。</p>';}
  function resultCard(row,index){return `<details class="card eff-row" ${index===0?'open':''}><summary><span class="eff-discard">${row.discard===null?'当前手牌':'切 '+tile(row.discard)}</span><span><b>${sname(row.shanten)}</b><small>${row.types} 种 · ${row.total} 张${row.best?' · 进张优选':''}</small></span></summary><p class="hint">${row.shanten===0?'和牌张':'使向听数降低的有效进张'}；剩余张数已扣除手牌、面子、指示牌、拔北和其他已见牌。</p>${improvementHtml(row.quality?row.quality.improvements:row.improvements)}${row.quality?`<div class="eff-metrics"><span>好形率 <b>${row.quality.rate===null?'仅 0／1 向听计算':row.quality.rate.toFixed(1)+'%'}</b></span><span>模拟自摸 EV <b>${fmt(row.ev.mean)} 点</b></span><span>估计误差 <b>${row.ev.winRate===0?'尚未观测到和牌':'±'+fmt(1.96*row.ev.standardError)+' 点'}</b></span><span>模拟和牌率 <b>${row.ev.winRate.toFixed(1)}%</b></span></div><p class="hint">未来 ${row.ev.turns} 次自摸 · ${row.ev.samples} 次模拟；误差为近似 95% 统计范围。</p>`:'<p class="hint">点击上方「计算好形率与 EV」可补充模型估算。</p>'}</details>`;}
  function renderResults(){if(!result)return;const rows=result.rows.map((r,i)=>({...r,index:i}));if($('effSort').value==='ev'&&rows.every(r=>r.ev))rows.sort((a,b)=>b.ev.mean-a.ev.mean);$('effResults').innerHTML=rows.map((r,i)=>resultCard(r,r.index===0?0:i+1)).join('');}
  $('effSort').onchange=renderResults;
  $('effDetails').onclick=async()=>{
    if(detailsBusy)return;if(!result){await analyze();if(!result)return;}
    const rev=revision;detailsBusy=true;$('effDetails').disabled=true;
    try{for(let i=0;i<result.rows.length;i++){message('effStatus',`正在计算好形率与 EV：${i+1} / ${result.rows.length}`);const row=result.rows[i],r=await request('details',{input,row,options:{samples:+$('effSamples').value,turns:+$('effTurns').value}});if(rev!==revision)return;row.quality=r.quality;row.ev=r.ev;renderResults();}message('effStatus','模型计算完成。小幅 EV 差异可能来自采样误差，请结合进张和场况判断。');}
    catch(e){if(e.message!=='cancelled')message('effError',e.message);}finally{if(rev===revision){detailsBusy=false;$('effDetails').disabled=false;}}
  };
  $('effAnalyze').onclick=analyze;
  $('effTarget').onchange=()=>{target=$('effTarget').value;draft=[];editor();};
  $('effPalette').onclick=e=>{
    const b=e.target.closest('[data-add]');if(!b)return;const t=+b.dataset.add;message('effError','');
    if(['hand','visible','dora'].includes(target)){
      if(target==='hand'&&totalTiles()>=14){message('effError','手牌已满，请先删除一张。');return;}
      if(target==='dora'&&input.dora.length>=5){message('effError','宝牌指示最多五张。');return;}input[target].push(t);
    }else{
      if(input.melds.length>=4){message('effError','面子最多四组。');return;}
      draft.push(t);const need=['ankan','minkan','kakan'].includes(target)?4:3;
      if(draft.length===need){const values=draft.map(MJ.redBase).sort((a,b)=>a-b),valid=target==='chi'?input.players===4&&values[0]<27&&Math.floor(values[0]/9)===Math.floor(values[2]/9)&&values[1]===values[0]+1&&values[2]===values[0]+2:values.every(v=>v===values[0]);if(!valid){draft=[];editor();message('effError','这些牌不能组成所选面子，请重新选择。');return;}input.melds.push({kind:target,tiles:draft});draft=[];}
    }
    changed();
  };
  $('view-efficiency').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){const [k,i]=b.dataset.remove.split(':');input[k].splice(+i,1);draft=[];changed();}});
  $('effClear').onclick=()=>{input=fresh();draft=[];target='hand';changed();};
  $('effDemo').onclick=()=>{input={...fresh(),hand:A.parse('125667m34478p235s')};draft=[];changed();};
  $('effPaste').onclick=()=>{try{const a=A.parse($('effNotation').value);if(!a.length)throw Error('请先输入牌谱');if(!['hand','visible','dora'].includes(target))throw Error('粘贴牌谱请先选择手牌、已见牌或宝牌指示');input[target]=a;draft=[];changed();}catch(e){message('effError',e.message);}};
  $('effPlayers').onchange=()=>{input.players=+$('effPlayers').value;if(input.players===4)input.nuki=0;if(input.players===3&&input.seatWind===3)input.seatWind=1;changed();};
  for(const [id,k] of [['effSeat','seatWind'],['effRound','roundWind'],['effNuki','nuki']])$(id).onchange=()=>{input[k]=+$(id).value;changed();};
  for(const id of ['effSamples','effTurns'])$(id).onchange=()=>{cancel();if(result){for(const r of result.rows){delete r.quality;delete r.ev;}renderResults();}message('effStatus','模拟条件已更新，请重新计算好形率与 EV。');};
  function stats(kind,id){const s=record[kind];$(id).innerHTML=`<span>已答 <b>${s.answered}</b></span><span>答对 <b>${s.correct}</b></span><span>正确率 <b>${s.answered?Math.round(s.correct/s.answered*100):0}%</b></span><span>连对 <b>${s.streak}</b> · 最长 ${s.best}</span>`;}
  function grade(kind,correct){const old=JSON.parse(JSON.stringify(record)),s=record[kind];s.answered++;if(correct){s.correct++;s.streak++;s.best=Math.max(s.best,s.streak);}else s.streak=0;try{localStorage.setItem(TRAINING,JSON.stringify(record));return true;}catch(_){record=old;return false;}}
  function bank(){const players=+$('discardPlayers').value,level=$('discardLevel').value;return MJDiscardBank.filter(q=>q.players===players&&(level==='all'||q.shanten===+level));}
  function discardNext(index){
    const list=bank(),old=question;let n;
    if(Number.isInteger(index))n=Math.max(0,Math.min(list.length-1,index));
    else if($('discardOrder').value==='random'){n=Math.floor(Math.random()*list.length);if(list[n]===old)n=(n+1)%list.length;}
    else n=old&&list.includes(old)?(list.indexOf(old)+1)%list.length:Math.min(list.length-1,Math.max(0,record.position[$('discardPlayers').value+':'+$('discardLevel').value]||0));
    question=list[n];record.position[$('discardPlayers').value+':'+$('discardLevel').value]=n;try{localStorage.setItem(TRAINING,JSON.stringify(record));}catch(_){}
    choice=null;submitted=false;$('discardJump').max=list.length;$('discardJump').value=n+1;message('discardNumber',`${question.id} · 筛选后第 ${n+1} / ${list.length} 题`);
    $('discardHand').innerHTML=question.hand.map((t,i)=>`<button class="tile" data-choice="${t}" aria-label="选择切${MJ.tileLabel(t)}，第${i+1}张">${MJTiles.svg(t)}</button>`).join('');
    message('discardContext',`雀魂${question.players===3?'三麻':'四麻'} · 东场南家 · 门前未立直 · 无宝牌、无其他已见牌`);message('discardSelection','请选择要切的一种牌，再提交答案。');message('discardError','');$('discardFeedback').innerHTML='';$('discardFeedback').className='hidden';$('discardSubmit').disabled=false;stats('discard','discardStats');
  }
  $('discardHand').onclick=e=>{const b=e.target.closest('[data-choice]');if(!b||submitted)return;choice=+b.dataset.choice;$('discardHand').querySelectorAll('button').forEach(x=>{const on=+x.dataset.choice===choice;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',String(on));});message('discardSelection','当前选择：切 '+MJ.tileLabel(choice));};
  $('discardSubmit').onclick=()=>{
    if(submitted||!question)return;if(choice===null){message('discardError','请先点选要切的牌。');return;}
    const correct=question.answers.includes(choice);if(!grade('discard',correct)){message('discardError','成绩未能保存，请清理空间后重试。');return;}submitted=true;message('discardError','');$('discardSubmit').disabled=true;$('discardHand').querySelectorAll('button').forEach(b=>b.disabled=true);
    const r=A.analyze({hand:question.hand,players:question.players}),chosen=r.rows.find(r=>r.discard===choice),best=r.rows[0];
    $('discardFeedback').className='card practice-feedback '+(correct?'correct':'incorrect');$('discardFeedback').innerHTML=`<h3>${correct?'答对了！':'再比较一下进张'}</h3><p>进张优选：${question.answers.map(tile).join(' ')}；舍牌后 ${sname(best.shanten)}，${best.types} 种、${best.total} 张进张。等价选择均计对。</p><p>你的选择：${tile(choice)} → ${sname(chosen.shanten)}，${chosen.types} 种、${chosen.total} 张。</p><p class="hint">先选向听数最少的舍牌，再比较有效进张总张数。本题主题：${question.topic}。不按防守、EV 或终局顺位评分。</p>${improvementHtml(best.improvements)}<details><summary>比较所有舍牌</summary>${r.rows.map(x=>`<div class="practice-line"><span>切 ${MJ.tileLabel(x.discard)}${x.best?' · 优选':''}</span><b>${sname(x.shanten)} · ${x.total} 张</b></div>`).join('')}</details>`;stats('discard','discardStats');$('discardFeedback').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('discardNext').onclick=()=>{discardNext();$('discardNumber').scrollIntoView({behavior:'smooth',block:'start'});};
  $('discardGo').onclick=()=>{const n=Number($('discardJump').value);if(!Number.isInteger(n)||n<1||n>bank().length){message('discardError','请输入当前筛选范围内的题号。');return;}discardNext(n-1);};
  for(const id of ['discardPlayers','discardLevel'])$(id).onchange=()=>{question=null;discardNext();};
  $('discardOrder').onchange=()=>discardNext();
  async function pureNext(){
    const token=++pureRevision;pureBusy=true;pureChoice.clear();pureSubmitted=false;pure=null;message('pureError','');message('pureState','正在生成清一色听牌…');$('pureHand').innerHTML='';$('pureChoices').innerHTML='';$('pureFeedback').innerHTML='';$('pureFeedback').className='hidden';$('pureSubmit').disabled=true;
    const suit=$('pureSuit').value==='random'?Math.floor(Math.random()*3):+$('pureSuit').value,level=$('pureLevel').value;
    try{const q=await request('pure',{options:{suit,level,previous:pureNext.previous||''}});if(token!==pureRevision)return;pure=q;pureNext.previous=q.key;message('pureState','13 张门前清一色：请选择全部能完成和牌形的牌。');$('pureHand').innerHTML=tiles(q.hand);$('pureChoices').innerHTML=Array.from({length:9},(_,i)=>`<button class="tile" data-wait="${9*suit+i}" aria-pressed="false" aria-label="选择${MJ.tileLabel(9*suit+i)}">${MJTiles.svg(9*suit+i)}</button>`).join('');$('pureSubmit').disabled=false;}
    catch(e){if(e.message==='cancelled'&&token===pureRevision){message('pureState','生成已中断，点「换一题」重新生成。');}else if(token===pureRevision)message('pureError',e.message);}finally{if(token===pureRevision)pureBusy=false;stats('pure','pureStats');}
  }
  $('pureChoices').onclick=e=>{const b=e.target.closest('[data-wait]');if(!b||pureSubmitted)return;const t=+b.dataset.wait;if(pureChoice.has(t))pureChoice.delete(t);else pureChoice.add(t);b.classList.toggle('selected',pureChoice.has(t));b.setAttribute('aria-pressed',String(pureChoice.has(t)));message('pureError','');};
  $('pureSubmit').onclick=()=>{
    if(!pure||pureBusy||pureSubmitted)return;if(!pureChoice.size){message('pureError','请至少选择一种听牌；本模式每题都已听牌。');return;}
    const missing=pure.waits.filter(t=>!pureChoice.has(t)),extra=[...pureChoice].filter(t=>!pure.waits.includes(t)),correct=!missing.length&&!extra.length;
    if(!grade('pure',correct)){message('pureError','成绩未能保存，请清理空间后重试。');return;}pureSubmitted=true;$('pureSubmit').disabled=true;$('pureChoices').querySelectorAll('button').forEach(b=>b.disabled=true);
    const c=A.counts(pure.hand),total=pure.waits.reduce((n,t)=>n+4-c[t],0);
    $('pureFeedback').className='card practice-feedback '+(correct?'correct':'incorrect');$('pureFeedback').innerHTML=`<h3>${correct?'全部找对了！':'核对遗漏和多选'}</h3><p>正确答案：${pure.waits.length} 面听，共余 ${total} 张。</p><div class="eff-tiles">${tiles(pure.waits)}</div>${missing.length?'<p>漏选：'+missing.map(MJ.tileLabel).join('、')+'</p>':''}${extra.length?'<p>多选：'+extra.map(MJ.tileLabel).join('、')+'</p>':''}<p class="hint">每种牌最多四张，不把第五张当作听牌。点击下面的答案查看一种合法拆法；可能还有其他拆法。</p>${pure.waits.map(t=>{const a=c.slice();a[t]++;const groups=A.decomposition(a)[0];return `<details class="pure-breakdown"><summary>${MJ.tileLabel(t)} · 余 ${4-c[t]} 张</summary><div class="eff-groups">${groups.map(g=>`<div class="eff-tiles">${tiles(g)}</div>`).join('')}</div></details>`;}).join('')}`;stats('pure','pureStats');$('pureFeedback').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('pureNext').onclick=pureNext;for(const id of ['pureLevel','pureSuit'])$(id).onchange=pureNext;
  for(const id of ['discardReset','pureReset'])$(id).onclick=()=>MJApp.confirm('清除何切与听牌成绩','<p>清除何切、清一色听牌两种训练的汇总成绩和题号进度，不能撤销。点数、符数成绩及对局记录保留。</p>',()=>resetStats());
  function resetStats(){record={discard:empty(),pure:empty(),position:{}};localStorage.removeItem(TRAINING);stats('discard','discardStats');stats('pure','pureStats');}
  document.addEventListener('queyou:view',e=>{if(e.detail==='efficiency'){editor();if(!result&&[13,14].includes(totalTiles()))schedule();}if(e.detail==='discard'&&!question)discardNext();if(e.detail==='pure'&&!pure&&!pureBusy)pureNext();});
  document.addEventListener('click',e=>{if(e.target.closest('[data-import-efficiency]')){input={...fresh(),...MJApp.analysisInput(),visible:[]};draft=[];target='hand';changed();MJApp.go('efficiency');}});
  window.MJTrainingUI={reset(){cancel();clearTimeout(timer);pureRevision++;pureBusy=false;input=fresh();result=null;question=null;pure=null;draft=[];target='hand';localStorage.removeItem(ANALYSIS);A.clearCaches();resetStats();editor();$('effResults').innerHTML='';message('effStatus','录入完整的 13 或 14 张后自动分析。');message('effError','');},resetStats,load(next){input={...fresh(),...next};draft=[];changed();}};
  editor();stats('discard','discardStats');stats('pure','pureStats');
})();
