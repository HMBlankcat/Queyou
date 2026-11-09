(function(){
  'use strict';
  const $=id=>document.getElementById(id),R=window.MJReferences;
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function yaku(){
    const text=$('yakuTableSearch').value.trim(),rows=R.yakuRows.filter(r=>(r.name+r.desc+r.hanText+r.openText).includes(text));
    $('yakuTableBody').innerHTML=rows.map(r=>`<tr><td>${r.hanText}</td><th scope="row">${esc(r.name)}</th><td>${esc(r.desc)}</td><td>${r.openText}</td></tr>`).join('')||'<tr><td colspan="4">没有匹配的役种。</td></tr>';
    $('otherRulesBody').innerHTML=R.otherRows.map(r=>`<tr>${r.map((s,i)=>i===0?`<th scope="row">${esc(s)}</th>`:`<td>${esc(s)}</td>`).join('')}</tr>`).join('');
  }
  function payment(result){
    if(!result)return '<span class="hint">—</span>';
    return result.payments.map(p=>`<span class="table-payment">${esc(p.from)} ${p.amount.toLocaleString('zh-CN')}${p.count>1?'／人':''}</span>`).join('')+`<small>合计 ${result.grandTotal.toLocaleString('zh-CN')}${result.limitName?' · '+esc(result.limitName):''}</small>`;
  }
  function points(){
    const players=+$('tablePlayers').value,dealer=$('tableSeat').value==='dealer',tsumo=$('tableMethod').value==='tsumo';
    $('pointsTableLegend').textContent=`雀魂${players===3?'三麻':'四麻'} · ${dealer?'亲家':'子家'}${tsumo?'自摸':'荣和'} · 0 本场、0 供托。${tsumo?(dealer?`每家金额均相同，共 ${players-1} 人支付。`:`亲家 1 人支付，子家 ${players-2} 人各付所列子家金额。`):'所列金额全部由放铳者支付。'} — 表示该番符／和牌方式不成立。`;
    $('pointsTableBody').innerHTML=R.fuValues.map(fu=>`<tr><th scope="row">${fu} 符</th>${[1,2,3,4].map(h=>`<td data-fu="${fu}" data-han="${h}">${payment(R.scoreCell(players,dealer,tsumo,h,fu))}</td>`).join('')}</tr>`).join('');
    $('limitsTableBody').innerHTML=R.limits.map(r=>`<tr><th scope="row">${r.name}</th><td>${r.condition}</td><td data-limit="${r.name}">${payment(R.scoreCell(players,dealer,tsumo,r.han,30,r.yakuman||0))}</td></tr>`).join('');
  }
  $('yakuTableSearch').oninput=yaku;
  ['tablePlayers','tableSeat','tableMethod'].forEach(id=>$(id).onchange=points);
  yaku();points();
})();
