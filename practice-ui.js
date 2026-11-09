(function(){
  'use strict';
  const $=id=>document.getElementById(id),P=window.MJPractice,KEY='queyou.practice.v1';
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('zh-CN');
  const empty=()=>({points:{answered:0,correct:0,streak:0,best:0},fu:{answered:0,correct:0,streak:0,best:0}});
  let stats=empty(),mode='points',question=null,answered=false;
  try{const data=JSON.parse(localStorage.getItem(KEY));if(data)for(const m of ['points','fu']){const s=data[m];if(s&&['answered','correct','streak','best'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&s.correct<=s.answered&&s.streak<=s.best&&s.best<=s.correct)stats[m]=s;}}catch(_){}
  function renderStats(){const s=stats[mode];$('practiceStats').innerHTML=`<span>已答 <b>${s.answered}</b></span><span>答对 <b>${s.correct}</b></span><span>正确率 <b>${s.answered?Math.round(s.correct/s.answered*100):0}%</b></span><span>连对 <b>${s.streak}</b> · 最长 ${s.best}</span>`;}
  function tile(t,win=false){return `<span class="tile ${win?'win':''}" aria-label="${esc(MJ.tileLabel(t))}${win?' 和了牌':''}">${MJTiles.svg(t)}</span>`;}
  function handHtml(q){
    const hand=q.input.tiles.slice().sort((a,b)=>MJ.redBase(a)-MJ.redBase(b));
    return `<p class="hint">手牌（不含下方单列的和了牌）</p><div class="practice-hand">${hand.map(t=>tile(t)).join('')}</div><div class="practice-win"><span>和了牌</span>${tile(q.input.win,true)}</div>${q.input.melds.length?`<p class="hint">已声明的面子（暗杠仍算门前）</p><div class="practice-melds">${q.input.melds.map(m=>`<div class="practice-meld"><small>${{chi:'吃',pon:'碰',minkan:'明杠',ankan:'暗杠',kakan:'加杠'}[m.kind]}</small><div class="practice-hand">${m.tiles.map(t=>tile(t)).join('')}</div></div>`).join('')}</div>`:'<p class="hint">无副露、无杠。</p>'}`;
  }
  function next(){
    const options={players:+$('practicePlayers').value,level:$('practiceLevel').value};
    try{question=mode==='points'?P.pointQuestion(options):P.fuQuestion(options,Math.random,question&&question.id);}catch(e){$('practiceQuestion').textContent=e.message;return;}
    answered=false;const q=question,c=q.ctx;
    $('practiceMode').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.practice===mode));
    $('practiceQuestion').innerHTML=`<div class="practice-context">雀魂${c.players===3?'三麻':'四麻'} · ${c.seatWind===0?'亲家（东家）':'子家（南家）'} · ${c.tsumo?'自摸':'荣和'}${mode==='fu'?' · 东场':''}</div>${mode==='points'?`<div class="practice-value">${q.han} <small>番</small> ${q.fu} <small>符</small></div><p>${c.honba} 本场 · ${c.riichiSticks} 根供托</p><p class="hint">题目已确认有役，番数包含宝牌。不切上满贯；${c.players===3?'三麻自摸损。':''}填写实际支付金额及和牌者总收入。</p>`:handHtml(q)+`<p class="hint">${c.riichi==='riichi'?'已立直，':'未立直，'}无宝牌、无其他特殊和牌条件。按雀魂规则计算最终符数；如有多种拆牌，以最高得点的合法解释为准。</p>`}`;
    $('practiceAnswers').innerHTML=q.fields.map(f=>`<label>${esc(f.label)}<input id="practice-${f.id}" data-answer="${f.id}" type="number" inputmode="numeric" min="0" step="1" autocomplete="off" placeholder="${mode==='fu'?'输入符数':'输入点数'}"></label>`).join('');
    $('practiceFeedback').innerHTML='';$('practiceFeedback').className='hidden';$('practiceError').textContent='';$('practiceSubmit').disabled=false;$('practiceNext').textContent='换一题（不计分）';renderStats();
  }
  function explanation(q){
    if(q.kind==='fu'){
      const raw=q.result.fuItems.filter(i=>i.label!=='切上').reduce((s,i)=>s+i.value,0);
      return `<h3>${esc(q.topic)} · ${q.result.fu} 符</h3>${q.result.fuItems.map(i=>`<div class="practice-line"><span>${esc(i.label==='切上'?'向上进位到十位':i.label.replace('待ち','等待'))}</span><b>＋${i.value} 符</b></div>`).join('')}<p>${q.result.fuItems.some(i=>i.label==='切上')?`${raw} 符向上进位 → ${q.result.fu} 符`:`最终 ${q.result.fu} 符，无需再进位`}</p>${q.note?`<p class="hint">${esc(q.note)}</p>`:''}<p class="hint">本手役种：${q.result.yaku.map(y=>esc(y.name)).join('、')}。顺子与两面等待不加符。</p>`;
    }
    const c=q.ctx,r=q.result,base=q.han>=13?8000:q.han>=11?6000:q.han>=8?4000:q.han>=6?3000:q.han>=5?2000:Math.min(2000,q.fu*2**(q.han+2));
    const calc=r.payments.map(p=>{
      const factor=c.tsumo?(c.seatWind===0||p.from==='亲家'?2:1):(c.seatWind===0?6:4);
      const raw=base*factor,rounded=Math.ceil(raw/100)*100,bonus=c.honba*(c.tsumo?100:300);
      return `<div class="practice-line"><span>${esc(p.from)}${p.count>1?'（每人）':''}</span><b>${fmt(p.amount)} 点</b></div><p class="hint">${fmt(base)} × ${factor} ＝ ${fmt(raw)}，向上取整到百位为 ${fmt(rounded)}${bonus?'，再加本场 '+fmt(bonus):''}。</p>`;
    }).join('');
    return `<h3>支付与计算过程</h3><p>${r.limitName?`${esc(r.limitName)}，基本点 ${fmt(base)}`:`基本点＝${q.fu} × 2^(${q.han}＋2)＝${fmt(base)}`}${q.han<5&&q.fu*2**(q.han+2)===1920?'；雀魂不切上满贯':''}。</p>${calc}<p class="hint">供托 ${fmt(r.stickExtra)} 点从桌上供托池发放，不重复向玩家收取。</p><p>总收入：${r.payments.map(p=>`${fmt(p.amount)} × ${p.count}`).join(' ＋ ')} ＋ ${fmt(r.stickExtra)} ＝ <strong>${fmt(r.grandTotal)} 点</strong></p>`;
  }
  $('practiceForm').onsubmit=e=>{
    e.preventDefault();if(answered)return;const values={};
    for(const f of question.fields){const value=$('practice-'+f.id).value.trim();if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))){$('practiceError').textContent='请把每一项填成非负整数。';return;}values[f.id]=Number(value);}
    const correct=P.grade(question,values),old=JSON.parse(JSON.stringify(stats)),s=stats[mode];s.answered++;if(correct){s.correct++;s.streak++;s.best=Math.max(s.best,s.streak);}else s.streak=0;
    try{localStorage.setItem(KEY,JSON.stringify(stats));}catch(err){stats=old;$('practiceError').textContent='成绩未能保存，请清理本地空间后重试。';return;}
    answered=true;$('practiceError').textContent='';$('practiceSubmit').disabled=true;$('practiceAnswers').querySelectorAll('input').forEach(el=>el.disabled=true);$('practiceNext').textContent='下一题';
    $('practiceFeedback').className='card practice-feedback '+(correct?'correct':'incorrect');
    $('practiceFeedback').innerHTML=`<h3>${correct?'答对了！':'本题尚未答对'}</h3>${question.fields.map(f=>`<p class="${values[f.id]===f.answer?'':'warning'}">${esc(f.label)}：你的答案 ${fmt(values[f.id])}，正确答案 <strong>${fmt(f.answer)}</strong></p>`).join('')}<hr>${explanation(question)}`;
    renderStats();$('practiceFeedback').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('practiceNext').onclick=()=>{next();$('practiceQuestion').scrollIntoView({behavior:'smooth',block:'start'});};
  $('practiceMode').onclick=e=>{const b=e.target.closest('[data-practice]');if(b&&b.dataset.practice!==mode){mode=b.dataset.practice;next();}};
  $('practicePlayers').onchange=$('practiceLevel').onchange=next;
  window.MJPracticeUI={reset(){localStorage.removeItem(KEY);stats=empty();next();}};
  next();
})();
