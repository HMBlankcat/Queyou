(function () {
  'use strict';
  const $ = id => document.getElementById(id), MJ = window.MJ, L = window.MJLedger, R = window.MJRounds, E = window.MJExamples;
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => Number(n).toLocaleString('zh-CN');
  const signed = n => (n > 0 ? '+' : '') + fmt(n);
  const KEY = 'queyou.v1';
  const miniResult = document.createElement('button'); miniResult.id = 'miniResult'; miniResult.className = 'mini-result hidden'; miniResult.onclick = () => $('result').scrollIntoView({behavior:'smooth',block:'center'}); document.body.appendChild(miniResult);
  const contextCard = $('contextBadge').closest('.card'); contextCard.id='contextCard'; $('quickPanel').before(contextCard);
  contextCard.querySelector('h3').textContent='1 · 和牌方式与风位'; $('handPanel').querySelector('h3').textContent='2 · 手牌与副露';
  const special = document.createElement('details'); special.className='special-conditions'; special.innerHTML='<summary>一发、岭上、抢杠等特殊条件</summary>'; $('extras').before(special); special.appendChild($('extras'));
  const fresh = () => ({ players:4, method:'hand', han:1, fu:30, yakuman:0, seatWind:1, roundWind:0, tsumo:false, honba:0, sticks:0, nuki:0, riichi:'none', hand:[], winIndex:-1, melds:[], dora:[], ura:[], winner:1, dealer:0, loser:2, roundLabel:'东1局', booked:false });
  let S = fresh(), soloState = S, tableState = fresh(), scope='solo', simple=true, guideRead=[], quizAnswers={}, yakuGroup='all';
  let db = { version:1, active:-1, games:[] }, draft = [], target = 'hand', deleting = false, result = null, view = 'game', toastTimer, onConfirm, recoveryRaw = null;
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (!saved.db || !Array.isArray(saved.db.games)) throw Error('格式不支持');
      saved.db.games.forEach(L.validate);
      db = saved.db; soloState=Object.assign(fresh(),saved.soloState||saved.state||{});tableState=Object.assign(fresh(),saved.tableState||{});
      scope=saved.scope==='table'?'table':'solo';S=scope==='table'?tableState:soloState;simple=saved.simple!==false;
      guideRead=Array.isArray(saved.guideRead)?saved.guideRead:[];quizAnswers=saved.quizAnswers||{};
      db.games.forEach((g,i)=>{if(!g.roundBase){const old=i===db.active?saved.state:null;g.roundBase={...R.initial(),hand:old&&Number.isInteger(old.dealer)?old.dealer+1:1,dealer:old&&Number.isInteger(old.dealer)?old.dealer:0,roundWind:old&&Number.isInteger(old.roundWind)?old.roundWind:0,honba:old&&Number.isInteger(old.honba)?old.honba:0};g.roundBaseIndex=g.events.length;g.migrated=true;}});
      if (!db.games[db.active]) db.active = -1;
      if (!Array.isArray(S.hand) || ![3,4].includes(S.players)) {S = fresh();soloState=S;scope='solo';}
    }
  } catch (e) { recoveryRaw = localStorage.getItem(KEY); setTimeout(() => toast('本地记录读取失败；请用「备份全部」保留原始记录后恢复备份。'), 300); }
  function persist() {
    if (recoveryRaw) localStorage.setItem(KEY + '.recovery', recoveryRaw);
    if(scope==='table')tableState=S;else soloState=S;
    const value = JSON.stringify({ db, state:S, soloState, tableState, scope, simple, guideRead, quizAnswers });
    localStorage.setItem(KEY, value);
  }
  function saveState() { try { persist(); } catch (_) { toast('保存失败，手机空间可能不足，请导出备份。'); } }
  function game() { return db.games[db.active] || null; }
  function linked(){return scope==='table'?game():null;}
  function switchScope(next){
    if(next==='table'&&!game()){toast('先新建对局，再选择玩家结算');newGame();return;}
    if(scope==='table')tableState=S;else soloState=S;
    scope=next;S=scope==='table'?tableState:soloState;draft=[];target='hand';deleting=false;render();saveState();
  }
  function commit(next) {
    const old = game(),oldTable=tableState,oldS=S; const before=R.current(old),after=R.current(next);
    db.games[db.active] = next;
    if(before.serial!==after.serial||before.dealer!==after.dealer||before.honba!==after.honba||before.roundWind!==after.roundWind||before.hand!==after.hand){tableState=fresh();tableState.players=next.names.length;if(scope==='table')S=tableState;draft=[];}
    try { persist(); } catch (e) { db.games[db.active] = old;tableState=oldTable;S=oldS;throw Error('保存失败，尚未入账，请先导出备份'); }
    render();
  }
  function show(next) {
    view = next;
    if(next==='history')renderHistory();
    document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.id === 'view-' + next));
    document.querySelectorAll('[data-view]').forEach(e => e.classList.toggle('active', e.dataset.view === (next.endsWith('-table')?'yaku':next==='calc'&&scope==='table'?'game':next)));
    window.scrollTo(0, 0);
    miniResult.classList.toggle('hidden', next !== 'calc' || !result);
  }
  window.appBack = function () {
    if ($('diceDialog').open) { $('diceDialog').close(); return true; }
    if ($('tilePicker').open) { $('tilePicker').close(); return true; }
    if ($('dialog').open) { $('dialog').close(); return true; }
    if (view.endsWith('-table')) { show('yaku'); return true; }
    if (view !== 'game') { show('game'); return true; }
    return false;
  };
  function dialog(title, body, confirm) {
    $('dialogTitle').textContent = title; $('dialogBody').innerHTML = body;
    $('dialogConfirm').disabled = false; onConfirm = confirm; $('dialog').showModal();
  }
  $('dialogConfirm').onclick = () => {
    try { $('dialogConfirm').disabled = true; onConfirm(); $('dialog').close(); }
    catch (e) { $('dialogConfirm').disabled = false; toast(e.message); }
  };
  function rollDice(){
    const values=[Math.floor(Math.random()*6)+1,Math.floor(Math.random()*6)+1];
    const dots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
    values.forEach((n,i)=>{
      const face=$('die'+i);face.dataset.value=String(n);face.setAttribute('aria-label',`第 ${i+1} 颗：${n} 点`);
      face.innerHTML=Array.from({length:9},(_,j)=>`<span class="dice-dot ${dots[n].includes(j)?'filled':''}"></span>`).join('');
      $('dieLabel'+i).textContent=`第 ${i+1} 颗 · ${n} 点`;
      if(face.animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)face.animate([{transform:'rotate(-8deg) scale(.92)'},{transform:'rotate(8deg)'},{transform:'rotate(0) scale(1)'}],{duration:220});
    });
    $('diceTotal').textContent=`${values[0]} ＋ ${values[1]} ＝ ${values[0]+values[1]} 点`;
  }
  $('openDice').onclick=()=>{$('diceDialog').showModal();rollDice();};
  $('rollDice').onclick=rollDice;
  $('closeDice').onclick=()=>$('diceDialog').close();
  function activate(index) {
    db.active = index; tableState = fresh(); tableState.players = game().names.length;if(scope==='table')S=tableState;
    target = 'hand'; draft = []; saveState(); render();
  }
  function newGame() {
    dialog('新建对局', '<p class="hint">已有对局会保留在记录页。按初始东、南、西、北顺序输入。</p><label>人数<select id="newCount"><option value="4">四人麻将</option><option value="3">三人麻将</option></select></label><div id="nameFields"></div><label>每人初始点数<input id="newInitial" type="number" step="100" value="25000" inputmode="numeric"></label>', () => {
      const names = Array.from($('nameFields').querySelectorAll('input')).map(e => e.value);
      const g = L.create(names, Number($('newInitial').value));
      g.roundBase=R.initial();g.roundBaseIndex=0;
      const previous = JSON.parse(JSON.stringify(db)), previousState = S, previousTable = tableState;
      db.games.push(g); db.active = db.games.length - 1; tableState=fresh();tableState.players=names.length;if(scope==='table')S=tableState;
      try { persist(); } catch (_) { db = previous; S = previousState; tableState = previousTable; throw Error('空间不足，无法保存新对局'); }
      target = 'hand'; draft = []; render(); show('game'); toast('牌桌已建立');
    });
    const names = () => {
      const n = Number($('newCount').value);
      $('nameFields').innerHTML = Array.from({length:n}, (_,i) => `<label>${['东','南','西','北'][i]}家玩家<input maxlength="20" value="玩家${i+1}" aria-label="玩家${i+1}姓名"></label>`).join('');
      $('newInitial').value = n === 3 ? 35000 : 25000;
    };
    $('newCount').value = String(S.players); $('newCount').onchange = names; names();
  }
  function selectPlayers(id, value, includePot) {
    const el = $(id), g = game(); if (!g) return;
    const previous = value === undefined ? el.value : value;
    el.innerHTML = g.names.map((n,i) => `<option value="${i}">${esc(n)}</option>`).join('') + (includePot ? '<option value="pot">供托池</option>' : '');
    el.value = String(previous); if (el.selectedIndex < 0) el.selectedIndex = 0;
  }
  function sync() {
    const g = linked();
    if (g) { const r=R.current(g);S.players = g.names.length;S.dealer=r.dealer;S.roundWind=r.roundWind;S.honba=r.honba;S.roundLabel=R.label(r); S.seatWind = (S.winner - S.dealer + S.players) % S.players; S.sticks = L.balances(g).pot / 1000; }
    ['han','fu','yakuman','seatWind','roundWind','honba','sticks','nuki','riichi','roundLabel'].forEach(id => { if (document.activeElement !== $(id)) $(id).value = S[id]; });
    $('seatWind').disabled = !!g; $('sticks').disabled = !!g;
    $('roundWind').disabled=$('honba').disabled=$('dealer').disabled=!!g;
    $('calcTitle').textContent=g?'和牌结算':'看牌算分';$('scopeHint').textContent=g?R.label(R.current(g))+' · 确认支付后自动推进局况':'不用输入玩家。点选手牌、副露和宝牌，指定和了牌，即可查看役种、番符和点数。';
    document.body.classList.toggle('solo-calc',!g);
    $('scopeSeg').classList.add('hidden');
    $('calcFootnote').textContent=g?'单人和牌结算后自动推进局次。包牌、多家和了、流局满贯可手动转点并校正局况。未录入牌河，振听需自行确认。':'这里只计算牌型与点数，不登记玩家或修改对局。自风、场风及和牌方式会影响结果；未录入牌河，振听需自行确认。';
    contextCard.querySelector('h3').textContent=g?'1 · 和牌方式与风位':'和牌条件';
    $('handPanel').querySelector('h3').textContent=g?'2 · 手牌与副露':'选择和牌后的牌';
    if(g){if(contextCard.nextElementSibling!==$('quickPanel'))$('quickPanel').before(contextCard);}
    else if(contextCard.previousElementSibling!==$('handPanel'))$('handPanel').after(contextCard);
    $('simpleSeg').classList.toggle('hidden',!g);$('methodSeg').classList.toggle('hidden',!!g&&simple);
    document.body.classList.toggle('simple-mode',!!g&&simple);
    $('bookResult').classList.toggle('hidden',!g);$('nextHand').textContent='重新录入';
    $('scopeSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===scope));
    $('simpleSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('active',(b.dataset.value==='simple')===simple));
    $('han').disabled = $('fu').disabled = S.yakuman > 0;
    $('seatWind').querySelector('[value="3"]').disabled = S.players === 3;
    $('linkedContext').classList.toggle('hidden', !g);
    $('loserLabel').classList.toggle('hidden', !g || S.tsumo);
    $('nukiLabel').classList.toggle('hidden', S.players !== 3);
    $('quickPanel').classList.toggle('hidden', S.method !== 'quick');
    $('handPanel').classList.toggle('hidden', S.method !== 'hand');
    $('contextBadge').textContent = g ? '已关联牌桌' : '独立计算';
    $('ruleHint').textContent = S.players === 3 ? '雀魂三麻 · 自摸损 · 不切上满贯 · 自摸每家每本场 +100' : '雀魂四麻 · 不切上满贯 · 双倍役满 · 赤五各一张';
    for (const [id, value] of [['playersSeg',S.players],['methodSeg',S.method],['winSeg',S.tsumo?'tsumo':'ron']]) $(id).querySelectorAll('button').forEach(e => e.classList.toggle('active', e.dataset.value === String(value)));
    if (g) { selectPlayers('winner', S.winner); selectPlayers('dealer', S.dealer); selectPlayers('loser', S.loser); }
    if(game()){selectPlayers('tableDealer',R.current(game()).dealer);$('roundLabel').value=R.label(R.current(game()));}
    $('tileTarget').value = target; $('tileTarget').querySelector('[value="chi"]').disabled = S.players === 3;
    $('extras').querySelectorAll('input').forEach(e => e.checked = !!S[e.dataset.key]);
    $('deleteMode').classList.toggle('primary', deleting);
  }
  function tile(t, onClick, classes = '') {
    const e = document.createElement(onClick ? 'button' : 'span'); e.className = 'tile ' + classes;
    e.innerHTML = MJTiles.svg(t); e.setAttribute('aria-label', MJ.tileLabel(t));
    if (onClick) { e.type = 'button'; e.onclick = onClick; } return e;
  }
  const allowed = t => !(S.players === 3 && MJ.redBase(t) >= 1 && MJ.redBase(t) <= 7);
  function canPick(t){
    const all=S.hand.concat(S.melds.flatMap(m=>m.tiles),S.dora,S.ura,draft,Array(Math.max(0,Math.min(4,S.nuki||0))).fill(30));
    return allowed(t)&&all.filter(x=>MJ.redBase(x)===MJ.redBase(t)).length<4&&(!(t>=34)||!all.includes(t))&&(![4,13,22].includes(t)||all.filter(x=>x===t).length<3);
  }
  let pickerKind='hand';
  function openPicker(kind){
    if(kind==='meld'){target=$('tileTarget').value;if(['hand','dora','ura'].includes(target))target='pon';kind=target;}
    pickerKind=kind;if(kind!=='win'){target=kind;draft=[];sync();renderHand();}
    renderPicker();$('tilePicker').showModal();
  }
  function renderPicker(){
    if(pickerKind==='win'){
      $('pickerTitle').textContent='从已录入手牌选择和了牌';$('pickerStatus').textContent='选择最后和到的那一张，不会额外添加手牌。';$('pickerPalette').innerHTML='';
      S.hand.forEach((t,i)=>$('pickerPalette').appendChild(tile(t,()=>{S.winIndex=i;changed();$('tilePicker').close();})));return;
    }
    $('pickerTitle').textContent={hand:'选择手牌',chi:'吃 · 选择三张连续牌',pon:'碰 · 选择三张相同牌',minkan:'明杠 · 选择四张',ankan:'暗杠 · 选择四张',kakan:'加杠 · 补一张',dora:'选择宝牌指示牌',ura:'选择里宝牌指示牌'}[target];
    $('pickerStatus').textContent=`手牌 ${S.hand.length}/${14-S.melds.length*3} 张${draft.length?' · 待选 '+draft.map(MJ.tileLabel).join('、'):''}`;
    buildPalette($('pickerPalette'));
  }
  function buildPalette(host){
    host.innerHTML='';[[0,1,2,3,4,5,6,7,8],[9,10,11,12,13,14,15,16,17],[18,19,20,21,22,23,24,25,26],[27,28,29,30,31,32,33],[34,35,36]].forEach((row,i)=>{
      const el=document.createElement('div');el.className='palette-row';el.innerHTML=`<span class="row-name">${['万','筒','索','字','赤'][i]}</span>`;
      row.forEach(t=>{const b=tile(t,()=>picked(t));b.disabled=!canPick(t);el.appendChild(b);});host.appendChild(el);
    });
  }
  $('pickerClose').onclick=()=>$('tilePicker').close();
  $('tileShortcuts').onclick=e=>{const b=e.target.closest('[data-pick]');if(b)openPicker(b.dataset.pick);};
  function picked(t) {
    try {
      if(!canPick(t))throw Error('这张牌已用完，或不适用当前规则');
      if (target === 'hand') {
        if (S.hand.length + S.melds.length * 3 >= 14) throw Error('手牌已满，请先删牌或录入副露');
        S.hand.push(t);
      } else if (target === 'dora' || target === 'ura') {
        if (S[target].length >= 5) throw Error('每类指示牌最多五张');
        S[target].push(t);
      } else {
        draft.push(t); const need = target === 'kakan' ? 1 : ['chi','pon'].includes(target) ? 3 : 4;
        if (draft.length === need) {
          const tiles = draft.slice().sort((a,b) => MJ.redBase(a)-MJ.redBase(b)), bases = tiles.map(MJ.redBase);
          if (target === 'kakan') {
            const m = S.melds.find(m => m.kind === 'pon' && MJ.redBase(m.tiles[0]) === bases[0]);
            if (!m) { draft = []; throw Error('加杠需要已有同牌的碰'); }
            m.kind = 'kakan'; m.tiles.push(t);
          } else {
            const valid = target === 'chi' ? bases[0] < 27 && bases[0]%9 <= 6 && bases[1] === bases[0]+1 && bases[2] === bases[0]+2 : bases.every(b => b === bases[0]);
            if (!valid) { draft = []; throw Error('这组副露不合法，请重新选牌'); }
            if (S.melds.length >= 4 || S.hand.length + (S.melds.length+1)*3 > 14) { draft = []; throw Error('加入副露后牌数超过 14，请先删去相应手牌'); }
            S.melds.push({kind:target,tiles});
          }
          draft = []; toast('副露已加入');
        }
      }
      changed();
      if($('tilePicker').open)renderPicker();
    } catch(e) { toast(e.message); renderHand(); }
  }
  function renderHand() {
    const isMeld=!['hand','dora','ura'].includes(target);
    $('entryTabs').querySelectorAll('[data-entry]').forEach(b=>b.classList.toggle('active',b.dataset.entry===(isMeld?'meld':target)));
    $('meldKinds').classList.toggle('hidden',!isMeld);
    $('meldKinds').querySelectorAll('[data-meld]').forEach(b=>{b.classList.toggle('active',b.dataset.meld===target);b.disabled=S.players===3&&b.dataset.meld==='chi';});
    $('handCount').textContent = `${S.hand.length} / ${14 - S.melds.length*3}`;
    $('handTiles').innerHTML = S.hand.length ? '' : '<span class="hint">从牌库选牌，包含和了牌</span>';
    S.hand.forEach((t,i) => {const wrap=document.createElement('div');wrap.className='hand-tile';wrap.appendChild(tile(t, () => {
      if (deleting) { S.hand.splice(i,1); S.winIndex = S.winIndex === i ? -1 : S.winIndex > i ? S.winIndex-1 : S.winIndex; }
      else S.winIndex = S.winIndex === i ? -1 : i;
      changed();
    }, (S.winIndex === i ? 'win ' : '') + (deleting ? 'delete' : '')));
      const x=document.createElement('button');x.className='tile-remove';x.textContent='×';x.setAttribute('aria-label','删除'+MJ.tileLabel(t));x.onclick=()=>{S.hand.splice(i,1);S.winIndex=S.winIndex===i?-1:S.winIndex>i?S.winIndex-1:S.winIndex;changed();};wrap.appendChild(x);$('handTiles').appendChild(wrap);
    });
    const plus=document.createElement('button');plus.className='tile-add';plus.textContent='＋';plus.setAttribute('aria-label','添加手牌');plus.onclick=()=>openPicker('hand');plus.disabled=S.hand.length+S.melds.length*3>=14;$('handTiles').appendChild(plus);
    buildPalette($('palette'));
    $('winningTile').innerHTML='<span>和了牌</span>';if(S.winIndex>=0&&S.hand[S.winIndex]!==undefined)$('winningTile').appendChild(tile(S.hand[S.winIndex]));
    const selectWin=document.createElement('button');selectWin.textContent=S.winIndex>=0?'更换和了牌':'选择最后和到的牌';selectWin.onclick=()=>openPicker('win');$('winningTile').appendChild(selectWin);
    $('draft').textContent = draft.length ? '待选：' + draft.map(MJ.tileLabel).join(' · ') : (['hand','dora','ura'].includes(target) ? '' : '选满后自动加入副露');
    $('melds').innerHTML = ''; $('indicators').innerHTML = '';
    const box = (host, label, tiles, remove) => {
      const el = document.createElement('div'); el.className = 'meld-box'; el.innerHTML = `<span>${esc(label)}</span>`;
      tiles.forEach(t => el.appendChild(tile(t)));
      const x = document.createElement('button'); x.className = 'remove'; x.textContent = '×'; x.setAttribute('aria-label','移除'+label); x.onclick = () => { remove(); changed(); }; el.appendChild(x); $(host).appendChild(el);
    };
    S.melds.forEach((m,i) => box('melds', {chi:'吃',pon:'碰',minkan:'明杠',ankan:'暗杠',kakan:'加杠'}[m.kind], m.tiles, () => S.melds.splice(i,1)));
    for (const key of ['dora','ura']) S[key].forEach((t,i) => box('indicators', `${key==='dora'?'宝':'里'} → ${MJ.tileLabel(MJ.nextDora(t,S.players))}`, [t], () => S[key].splice(i,1)));
  }
  function context() { return { ...S, riichiSticks:S.sticks, doraIndicators:S.dora, uraIndicators:S.ura, rules:{kiriage:false,doubleYakuman:true,doubleWindFu:4} }; }
  function calculate() {
    if (S.method === 'quick') return MJ.quickScore(S.han,S.fu,context(),S.yakuman);
    if (S.winIndex < 0 || S.winIndex >= S.hand.length) throw Error('录入手牌后，点选最后和到的那张牌');
    const tiles = S.hand.filter((_,i) => i !== S.winIndex);
    const r = MJ.score({tiles,win:S.hand[S.winIndex],melds:S.melds},context());
    if (!r.ok) throw Error(r.reason); return r.best;
  }
  function paymentText(b) { return b.payments.map(p => `<div class="payline"><span>${esc(p.from)}${p.count>1?' × '+p.count:''}</span><strong>${fmt(p.amount)} 点${p.count>1?' / 人':''}</strong></div>`).join(''); }
  function renderResult() {
    result = null;
    try {
      result = calculate(); const b = result;
      $('result').innerHTML = `<h3>和牌收入${b.stickExtra ? ' · 含供托' : ''}</h3><div class="big">${fmt(b.grandTotal)}<small>点</small></div><div class="meta">${S.seatWind===0?'亲家':'子家'} · ${S.tsumo?'自摸':'荣和'} · ${b.yakuman ? '役满 ×'+b.yakumanCount : b.han+' 番 '+b.fu+' 符'}${b.limitName?' · '+esc(b.limitName):''}</div>${paymentText(b)}${b.stickExtra?`<div class="payline"><span>供托池</span><strong>${fmt(b.stickExtra)} 点</strong></div>`:''}<p class="hint">${b.honbaExtra?'上列支付已含本场 '+fmt(b.honbaExtra)+' 点。':''}${S.method==='quick'?'番符由你确认；宝牌不能单独和牌。':''}</p><div>${b.yaku.map(y=>`<span class="tag">${esc(y.name)}${y.han?' '+y.han+' 番':''}</span>`).join('')}${[['doraHan','宝牌'],['akaHan','赤宝牌'],['uraHan','里宝牌'],['nukiHan','拔北']].filter(([k])=>b[k]).map(([k,l])=>`<span class="tag">${l} ${b[k]} 番</span>`).join('')}</div>${b.fuItems.length?`<details><summary>查看符数明细</summary>${b.fuItems.map(f=>`<div class="payline"><span>${esc(f.label)}</span><span>${f.value}</span></div>`).join('')}</details>`:''}`;
    } catch(e) { $('result').innerHTML = `<h3>等待计算</h3><p>${esc(e.message)}</p>`; }
    $('bookResult').disabled = !result || !!(linked()&&R.current(game()).finished);
    $('bookResult').textContent = '选择支付玩家 · 确认本局加减分';
    miniResult.innerHTML = result ? `<strong>${fmt(result.grandTotal)} <small>点</small></strong><span>${S.seatWind===0?'亲家':'子家'} · ${S.tsumo?'自摸':'荣和'}<small>查看明细 ↑</small></span>` : '';
    miniResult.classList.toggle('hidden', view !== 'calc' || !result);
  }
  function nameOf(g, id) { return id === 'pot' ? '供托池' : g.names[id]; }
  function lines(g, transfers) { return transfers.map(t=>`<div class="transfer-line">${esc(nameOf(g,t.from))} → ${esc(nameOf(g,t.to))}<strong> ${fmt(t.amount)} 点</strong></div>`).join('') || '<p class="hint">本局不转点。</p>'; }
  function preview(next, callback, editable=false) {
    const e = next.events[next.events.length-1];
    const before=L.balances(game()).points,roundBefore=R.current(game()),roundAfter=R.current(next);
    function summary(candidate){const after=L.balances(candidate).points;return `<div class="record-deltas">${candidate.names.map((n,i)=>`<span>${esc(n)} <b class="delta ${after[i]<before[i]?'negative':''}">${signed(after[i]-before[i])}</b></span>`).join('')}</div>${lines(candidate,candidate.events[candidate.events.length-1].transfers)}`;}
    function adjusted(){if(!editable)return next;const transfers=e.transfers.map(t=>({...t}));let modified=false;$('dialogBody').querySelectorAll('[data-payment]').forEach(el=>{const i=+el.dataset.payment,n=+el.value;if(n!==transfers[i].amount)modified=true;transfers[i].amount=n;});return modified?L.add(game(),e.label+'（调整支付）',transfers,{...e.meta,customPayment:true}):next;}
    const edit=editable?`<details><summary>按现场约定调整这笔支付</summary><p class="hint">修改后的金额将作为手动调整记录。供托按现有池发放。</p>${e.transfers.map((t,i)=>t.from==='pot'?'':`<label>${esc(nameOf(next,t.from))} → ${esc(nameOf(next,t.to))}<input type="number" inputmode="numeric" min="100" step="100" data-payment="${i}" value="${t.amount}"></label>`).join('')}</details>`:'';
    dialog('确认本局加减分', `<p>${esc(e.label)}</p><div id="paymentPreview">${summary(next)}</div>${edit}<p id="paymentError" role="alert"></p>${roundBefore.serial!==roundAfter.serial?`<p class="guide-callout">结算后：${R.label(roundAfter)}<br>庄家：${esc(next.names[roundAfter.dealer])}</p>`:''}<p class="hint">确认后保存；撤销可同时恢复点数和局况。</p>`, () => {
      commit(adjusted());if(callback)callback();toast('已保存本笔记录');
    });
    $('dialogBody').querySelectorAll('[data-payment]').forEach(el=>el.oninput=()=>{try{$('paymentPreview').innerHTML=summary(adjusted());$('paymentError').textContent='';$('dialogConfirm').disabled=false;}catch(err){$('paymentError').textContent=err.message;$('dialogConfirm').disabled=true;}});
  }
  function renderGame() {
    const g = game(); $('emptyGame').classList.toggle('hidden',!!g); $('activeGame').classList.toggle('hidden',!g); if (!g) return;
    const b = L.balances(g);
    $('gameMode').textContent = `雀魂 ${g.names.length===3?'三麻':'四麻'} · ${g.names.length} 位玩家`;
    const r=R.current(g),declared=R.riichiPlayers(g);
    $('gameSummary').textContent = R.label(r);
    $('pot').textContent = fmt(b.pot); $('draw').disabled = $('abort').disabled = $('deposit').disabled = !!r.finished;
    $('roundStats').innerHTML=`<div><small>场风</small><strong>${['东','南','西','北'][r.roundWind]}</strong></div><div><small>本场 / 积棒</small><strong>${r.honba} 本</strong></div><div><small>已结算</small><strong>${g.events.filter(e=>['win','draw','abort'].includes(e.meta.type)).length} 局</strong></div>`;
    $('conservation').textContent=`各家持点 ${fmt(b.points.reduce((a,c)=>a+c,0))} ＋ 供托 ${fmt(b.pot)} ＝ ${fmt(g.initial*g.names.length)}`;
    $('roundNotice').textContent=g.migrated?'旧版记录已保留；首次使用请校正当前局数。之后会自动推进。':'和牌和流局后自动推进；终局、延长战及包牌等特殊情况请按现场规则确认。';
    $('scoreboard').innerHTML = g.names.map((n,i)=>`<div class="player-card ${i===r.dealer?'is-dealer':''}"><div class="name">${esc(n)} <small>${['东','南','西','北'][(i-r.dealer+g.names.length)%g.names.length]}${i===r.dealer?' · 庄':''}</small></div><strong>${fmt(b.points[i])}</strong><span class="delta ${b.points[i]<g.initial?'negative':''}">${signed(b.points[i]-g.initial)}</span><small> / 初始 ${fmt(g.initial)}</small><button class="riichi-chip ${declared.includes(i)?'declared':''}" data-riichi-player="${i}" ${declared.includes(i)||r.finished?'disabled':''}>${declared.includes(i)?'已立直':'立直 ＋'}</button></div>`).join('');
    for (const id of ['riichiPlayer','transferFrom','transferTo']) selectPlayers(id, undefined, id==='transferFrom'||id==='transferTo');
    if ($('transferFrom').value === $('transferTo').value) $('transferTo').value = '1';
    const checked = Array.from($('readyPlayers').querySelectorAll('input')).filter(e=>e.checked).map(e=>e.value);
    $('readyPlayers').innerHTML = g.names.map((n,i)=>`<label><input type="checkbox" value="${i}" ${checked.includes(String(i))?'checked':''}>${esc(n)}</label>`).join('');
    const pairs = new Map();
    g.events.forEach(e=>e.transfers.forEach(t=> { const key = t.from+':'+t.to; pairs.set(key,(pairs.get(key)||0)+t.amount); }));
    $('pairTotals').innerHTML = Array.from(pairs,([key,amount])=>{ const [from,to]=key.split(':').map(x=>x==='pot'?x:+x); return lines(g,[{from,to,amount}]); }).join('') || '<p class="hint">还没有支付记录</p>';
  }
  function renderHistory() {
    renderStorage();
    $('sessionSelect').innerHTML = db.games.length ? db.games.map((g,i)=>`<option value="${i}">${esc(g.names.join(' / '))} · ${new Date(g.created).toLocaleDateString('zh-CN')} · ${g.events.length} 笔</option>`).join('') : '<option>暂无对局</option>';
    $('sessionSelect').value = String(db.active);
    const g = game(); $('undoEvent').disabled = !g || !g.events.length;
    if (!g) { $('history').innerHTML = '<div class="card empty-state">建立牌桌后，记录会保存在这里。</div>'; return; }
    const running = g.names.map(()=>g.initial);
    const cards = g.events.map((e,i) => {
      const delta = g.names.map(()=>0);
      e.transfers.forEach(t=>{if(t.from!=='pot')delta[t.from]-=t.amount;if(t.to!=='pot')delta[t.to]+=t.amount;});
      delta.forEach((n,k)=>running[k]+=n);
      return `<div class="card"><div class="record-head"><h3>${i+1}. ${esc(e.label)}</h3><small>${new Date(e.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div><div class="record-deltas">${g.names.map((n,k)=>`<span>${esc(n)} <b class="delta ${delta[k]<0?'negative':''}">${signed(delta[k])}</b><br>总分 ${fmt(running[k])}</span>`).join('')}</div>${lines(g,e.transfers)}</div>`;
    });
    $('history').innerHTML = cards.reverse().join('') || '<div class="card"><p class="hint">对局已建立，等待第一笔记录。</p></div>';
  }
  function renderYaku() {
    const q = $('yakuSearch').value.trim();
    const extra=['国士无双十三面','四暗刻单骑','纯正九莲宝灯'].map(name=>({name,han:13,open:null,group:13,desc:'雀魂双倍役满。'}));
    const items=MJ.YAKU_TABLE.concat(extra).filter(y=>(y.name+y.desc).includes(q)&&(yakuGroup==='all'||yakuGroup==='double'?yakuGroup==='all'||['大四喜',...extra.map(y=>y.name)].includes(y.name):String(y.group)===yakuGroup));
    $('yakuList').innerHTML = items.map(y=>{const e=E.entries.find(e=>e.name===y.name);return `<div class="card yaku-card"><div class="yaku-item"><strong>${esc(y.name)}</strong><span>${['大四喜',...extra.map(y=>y.name)].includes(y.name)?'双倍役满':y.han===13?'役满':y.han+' 番'}${y.open===null?' · 门清':y.open<y.han?' / 副露 '+y.open+' 番':''}</span></div><p class="hint">${esc(y.desc)}</p>${e?exampleHtml(e):''}</div>`;}).join('') || '<p class="hint">没有匹配的役种</p>';
  }
  function exampleHtml(e){
    let marked=false;const win=E.parse(e.win)[0];
    const groups=e.groups.map(g=>{const meld=typeof g!=='string';const ids=E.parse(meld?g.tiles:g);return `<div class="example-group ${meld?'open-group':''}">${ids.map(t=>{const isWin=!meld&&!marked&&t===win;if(isWin)marked=true;return `<span class="tile ${isWin?'win':''}" aria-label="${esc(MJ.tileLabel(t))}${isWin?' 和了牌':''}">${MJTiles.svg(t)}</span>`;}).join('')}${meld?`<small>${{chi:'吃',pon:'碰',minkan:'明杠',ankan:'暗杠',kakan:'加杠'}[g.kind]}</small>`:''}</div>`;}).join('');
    return `<div class="example-tiles">${groups}</div><div class="example-caption">四麻示例 · ${e.ctx.seatWind===0?'东家':'南家'} · 东场 · ${e.ctx.tsumo?'自摸':'荣和'} ${esc(MJ.tileLabel(win))}${e.ctx.riichi!=='none'?' · '+(e.ctx.riichi==='double'?'双立直':'立直'):''}</div><p class="hint">${esc(e.note)}</p><button class="example-load" data-example="${esc(e.name)}">带入独立算点 →</button>`;
  }
  function loadExample(name){
    const e=E.entries.find(e=>e.name===name);if(!e)return;switchScope('solo');const input=E.input(e);S=Object.assign(fresh(),e.ctx,{method:'hand',hand:input.tiles.concat(input.win),winIndex:input.tiles.length,melds:input.melds});soloState=S;draft=[];target='hand';render();saveState();show('calc');toast('已载入示例，未修改对局记录');
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-example]');if(b)loadExample(b.dataset.example);});
  $('yakuFilters').onclick=e=>{const b=e.target.closest('[data-group]');if(!b)return;yakuGroup=b.dataset.group;$('yakuFilters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderYaku();};
  function renderGuide(){
    const q=$('guideSearch').value.trim(),G=window.MJGuide;
    $('guideProgress').textContent=`已读 ${guideRead.filter(id=>G.chapters.some(c=>c.id===id)).length}/${G.chapters.length}`;$('guideSource').textContent=G.source;
    $('guideChapters').innerHTML=G.chapters.filter(c=>(c.title+c.summary+c.body).includes(q)).map((c,i)=>`<details class="card guide-chapter"><summary><span class="chapter-num">${String(G.chapters.indexOf(c)+1).padStart(2,'0')}</span><span><b>${esc(c.title)}</b><small>${esc(c.summary)}</small></span><span>${guideRead.includes(c.id)?'✓':'＋'}</span></summary><div class="guide-body">${c.body}${c.tiles?`<div class="example-tiles">${E.parse(c.tiles).map(t=>`<span class="tile">${MJTiles.svg(t)}</span>`).join('')}</div>`:''}${c.example?exampleHtml(E.entries.find(e=>e.name===c.example)):''}<button data-read="${c.id}" class="full">${guideRead.includes(c.id)?'已学会 ✓':'标记为已学会'}</button></div></details>`).join('')||'<p class="hint">没有匹配章节。</p>';
    $('guideQuiz').innerHTML=G.quizzes.map((q,i)=>`<div class="quiz"><b>${i+1}. ${esc(q.q)}</b><div class="actions">${q.options.map((o,j)=>`<button data-quiz="${i}" data-answer="${j}" class="${quizAnswers[i]===j?'primary':''}">${esc(o)}</button>`).join('')}</div><p class="hint" id="quizFeedback${i}">${quizAnswers[i]===undefined?'':(quizAnswers[i]===q.answer?'答对了。':'再想一下。')+q.why}</p></div>`).join('');
  }
  $('guideChapters').onclick=e=>{const b=e.target.closest('[data-read]');if(b){if(!guideRead.includes(b.dataset.read))guideRead.push(b.dataset.read);b.textContent='已学会 ✓';$('guideProgress').textContent=`已读 ${guideRead.length}/${MJGuide.chapters.length}`;saveState();}};
  $('guideQuiz').onclick=e=>{const b=e.target.closest('[data-quiz]');if(!b)return;const i=+b.dataset.quiz,j=+b.dataset.answer;quizAnswers[i]=j;const q=MJGuide.quizzes[i];$('quizFeedback'+i).textContent=(j===q.answer?'答对了。':'再想一下。')+q.why;b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('primary',x===b));saveState();};
  $('guideSearch').oninput=renderGuide;
  function render() { sync(); renderHand(); renderResult(); renderGame(); renderHistory(); }
  function changed() { S.booked = false; sync(); renderHand(); renderResult(); saveState(); }
  function openSolo(){switchScope('solo');S.method='hand';render();saveState();show('calc');}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){if(b.dataset.view==='calc')openSolo();else show(b.dataset.view);}});
  $('openSolo').onclick=openSolo;
  $('entryTabs').onclick=e=>{const b=e.target.closest('[data-entry]');if(!b)return;target=b.dataset.entry==='meld'?(!['hand','dora','ura'].includes(target)?target:'pon'):b.dataset.entry;draft=[];sync();renderHand();};
  $('meldKinds').onclick=e=>{const b=e.target.closest('[data-meld]');if(!b)return;target=b.dataset.meld;draft=[];sync();renderHand();};
  $('scopeSeg').onclick=e=>{const b=e.target.closest('[data-value]');if(b)switchScope(b.dataset.value);};
  $('simpleSeg').onclick=e=>{const b=e.target.closest('[data-value]');if(b){simple=b.dataset.value==='simple';if(simple)S.method='hand';changed();}};
  $('newGame').onclick = $('firstGame').onclick = newGame;
  $('playersSeg').onclick = e => {
    const b=e.target.closest('button');if(!b)return; const n=+b.dataset.value;if(n===S.players)return;
    if(linked()){toast('当前牌桌人数固定；独立试算可自由切换人数');return;}
    dialog('切换人数', '<p>切换会清空当前手牌与算点设置。</p>', ()=>{S=fresh();S.players=n;draft=[];target='hand';changed();});
  };
  $('methodSeg').onclick=e=>{const b=e.target.closest('button');if(b){S.method=b.dataset.value;changed();}};
  $('winSeg').onclick=e=>{const b=e.target.closest('button');if(b){S.tsumo=b.dataset.value==='tsumo';changed();}};
  for(const id of ['han','fu','yakuman','seatWind','roundWind','honba','sticks','nuki','riichi']) $(id).addEventListener($(id).tagName==='SELECT'?'change':'input',()=>{S[id]=id==='riichi'?$(id).value:$(id).value.trim()===''?NaN:Number($(id).value);changed();});
  for(const id of ['winner','dealer','loser']) $(id).onchange=()=>{S[id]=+$(id).value;if(id==='winner'&&linked())S.riichi=R.riichiPlayers(game()).includes(S.winner)?'riichi':'none';changed();renderGame();};
  $('roundLabel').oninput=()=>{S.roundLabel=$('roundLabel').value;saveState();};
  $('extras').onchange=e=>{S[e.target.dataset.key]=e.target.checked;changed();};
  $('tileTarget').onchange=()=>{target=$('tileTarget').value;draft=[];renderHand();if(linked()&&simple)openPicker(target);};
  $('deleteMode').onclick=()=>{deleting=!deleting;sync();renderHand();};
  $('clearDraft').onclick=()=>{draft=[];renderHand();};
  $('undoTile').onclick=()=>{if(draft.length)draft.pop();else{S.hand.pop();if(S.winIndex>=S.hand.length)S.winIndex=-1;}changed();};
  function clearHand(){S.hand=[];S.melds=[];S.winIndex=-1;S.dora=[];S.ura=[];S.nuki=0;S.riichi='none';for(const k of ['ippatsu','rinshan','chankan','haitei','houtei','tenhou','chiihou'])S[k]=false;draft=[];target='hand';}
  $('clearHand').onclick=()=>dialog('清空手牌','<p>清除手牌、副露、宝牌和附加役；对局记录保留。</p>',()=>{clearHand();changed();});
  $('nextHand').onclick=()=>{clearHand();S.han=1;S.fu=30;S.yakuman=0;changed();toast('已清空本次录入，局况没有推进');};
  $('demo').onclick=()=>{if(linked()){toast('示例在独立算点中打开，不影响真实对局');loadExample('立直');return;}clearHand();S.hand=S.players===4?[1,2,3,1,2,3,13,14,15,23,24,25,25,25]:[10,11,12,10,11,12,13,14,15,23,24,25,25,25];S.winIndex=0;S.riichi='riichi';S.tsumo=false;S.honba=0;changed();};
  function openSettlement(useSimple){if(!game()){newGame();return;}simple=useSimple;switchScope('table');if(simple)S.method='hand';S.riichi=R.riichiPlayers(game()).includes(S.winner)?'riichi':'none';render();saveState();show('calc');}
  $('goCalc').onclick=()=>openSettlement(false);$('openSimple').onclick=()=>openSettlement(true);
  $('openDraw').onclick=()=>$('draw').closest('.card').scrollIntoView({behavior:'smooth',block:'center'});
  $('tableUndo').onclick=()=>$('undoEvent').click();
  $('bookResult').onclick=()=>{
    if(!linked()||!result)return;
    try{const title=R.label(R.current(game()))+' · '+game().names[S.winner]+(S.tsumo?'自摸':'荣和');const next=L.settle(game(),result,S.winner,S.dealer,S.loser,S.tsumo,title);preview(next,()=>{show('game');},true);}catch(e){toast(e.message);}
  };
  function deposit(i){
    try{const g=game();if(R.current(g).finished)throw Error('本桌已结束，请新建对局');if(L.balances(g).points[i]<1000)throw Error('该玩家不足 1000 点，不能立直');
      if(R.riichiPlayers(g).includes(i))throw Error('该玩家本局已登记立直');
      preview(L.add(g,R.label(R.current(g))+' · '+g.names[i]+'立直',[{from:i,to:'pot',amount:1000}],{type:'riichi',player:i,roundSerial:R.current(g).serial}));
    }catch(e){toast(e.message);}
  }
  $('deposit').onclick=()=>deposit(+$('riichiPlayer').value);
  $('scoreboard').onclick=e=>{const b=e.target.closest('[data-riichi-player]');if(b)deposit(+b.dataset.riichiPlayer);};
  $('transfer').onclick=()=>{try{const id=v=>v==='pot'?v:+v;const from=id($('transferFrom').value),to=id($('transferTo').value),amount=+$('transferAmount').value;if((from==='pot'||to==='pot')&&amount%1000!==0)throw Error('供托池按 1000 点整根调整');preview(L.add(game(),R.label(R.current(game()))+' · '+($('transferNote').value.trim()||'手动转点'),[{from,to,amount}],{type:'manual'}));}catch(e){toast(e.message);}};
  $('draw').onclick=()=>{try{const ready=Array.from($('readyPlayers').querySelectorAll('input')).map(e=>e.checked);preview(L.draw(game(),ready,R.label(R.current(game()))+' · 荒牌流局'),()=>{$('readyPlayers').querySelectorAll('input').forEach(e=>e.checked=false);show('game');});}catch(e){toast(e.message);}};
  $('abort').onclick=()=>{try{preview(L.add(game(),R.label(R.current(game()))+' · 途中流局',[],{type:'abort'}),()=>show('game'));}catch(e){toast(e.message);}};
  $('adjustRound').onclick=()=>{
    const g=game(),r=R.current(g);dialog('校正当前局况',`<p class="hint">只校正局次，不改变玩家点数；也会记录到牌谱，可撤销。终局与延长战按现场规则确认。</p><div class="fields"><label>场风<select id="fixWind">${['东','南','西','北'].map((w,i)=>`<option value="${i}">${w}</option>`).join('')}</select></label><label>第几局<input id="fixHand" type="number" min="1" max="${g.names.length}" value="${r.hand}"></label><label>庄家<select id="fixDealer">${g.names.map((n,i)=>`<option value="${i}">${esc(n)}</option>`).join('')}</select></label><label>本场<input id="fixHonba" type="number" min="0" max="999" value="${r.honba}"></label></div>`,()=>{const state=R.validate({dealer:+$('fixDealer').value,roundWind:+$('fixWind').value,hand:+$('fixHand').value,honba:+$('fixHonba').value,serial:r.serial},g.names.length);const next=L.add(g,'校正局况 → '+R.label(state),[],{type:'round-adjust',roundState:state});next.migrated=false;commit(next);});$('fixWind').value=String(r.roundWind);$('fixDealer').value=String(r.dealer);
  };
  $('undoEvent').onclick=()=>{const g=game();if(!g||!g.events.length)return;const last=g.events[g.events.length-1];dialog('撤销上一笔',`<p>${esc(last.label)}</p>${lines(g,last.transfers)}<p class="hint">将恢复这笔记录前的余额和供托。</p>`,()=>{const next=JSON.parse(JSON.stringify(g));next.events.pop();next.roundBaseIndex=Math.min(next.roundBaseIndex||0,next.events.length);commit(next);S.booked=false;saveState();render();toast('已撤销');});};
  $('sessionSelect').onchange=()=>{activate(+$('sessionSelect').value);toast('已恢复这桌的点数与局况');};
  function renderStorage(){
    const bytes=[KEY,KEY+'.recovery','queyou.practice.v1'].reduce((n,key)=>n+2*(localStorage.getItem(key)||'').length,0);
    $('storageUsage').textContent=`${db.games.length} 个对局 · ${db.games.reduce((n,g)=>n+g.events.length,0)} 笔记录 · 本地记录约 ${bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB'}`;
    $('deleteGame').disabled=!game();$('clearHistory').disabled=db.games.length-(game()?1:0)===0;
  }
  function cleanData(kind){
    const previous={db,S,soloState,tableState,scope,simple,guideRead,quizAnswers,recoveryRaw};
    const selected=game();
    if(kind==='all'){
      db={version:1,active:-1,games:[]};soloState=fresh();tableState=fresh();scope='solo';S=soloState;simple=true;guideRead=[];quizAnswers={};
    }else{
      const games=kind==='history'?db.games.filter(g=>g===selected):db.games.filter(g=>g!==selected);
      const active=kind==='history'&&selected?0:games.length-1;db={...db,games,active};
      if(kind==='single'){
        tableState=fresh();if(game())tableState.players=game().names.length;
        if(scope==='table'){if(game())S=tableState;else{scope='solo';S=soloState;}}
      }
    }
    recoveryRaw=null;
    try{persist();}catch(err){({db,S,soloState,tableState,scope,simple,guideRead,quizAnswers,recoveryRaw}=previous);throw Error('清除未保存，原记录已保留，请重试');}
    localStorage.removeItem(KEY+'.recovery');
    if(kind==='all'&&window.MJPracticeUI)window.MJPracticeUI.reset();
    draft=[];target='hand';deleting=false;
    if(kind==='all'&&window.Android&&Android.clearLocalCache)Android.clearLocalCache();
    render();renderGuide();renderStorage();show('history');toast(kind==='all'?'本地数据已清空':kind==='history'?'历史对局已清除，当前对局保留':'所选对局已删除');
  }
  $('deleteGame').onclick=()=>{
    const g=game();if(!g)return;
    dialog('删除所选对局',`<p>将删除 <strong>${esc(g.names.join(' / '))}</strong> 这桌的全部 ${g.events.length} 笔记录、玩家分数和局况。</p><p class="warning">删除后不能撤销，需要保留时请先备份。其他对局不受影响。</p>`,()=>cleanData('single'));
  };
  $('clearHistory').onclick=()=>{
    const g=game(),count=db.games.length-(g?1:0);if(!count)return;
    dialog('清除历史对局',`<p>将删除除当前所选对局外的 <strong>${count} 个对局</strong>。</p>${g?`<p>保留：${esc(g.names.join(' / '))}，及其分数和局况。</p>`:''}<p class="warning">删除后不能撤销，需要保留时请先备份。</p>`,()=>cleanData('history'));
  };
  $('clearLocalData').onclick=()=>dialog('清空全部本地数据',`<p>将删除全部 ${db.games.length} 个对局、每笔支付、算点输入、学习进度、练习成绩和本地恢复副本，并清理应用网页缓存。</p><p>软件功能和已导出的备份文件会保留。</p><p class="warning">此操作不能撤销，需要保留记录时请先备份。</p>`,()=>cleanData('all'));
  $('practiceReset').onclick=()=>dialog('清除练习成绩','<p>清除点数与符数两种练习的全部汇总成绩。对局、算点输入和指南进度保留；不能撤销。</p>',()=>{window.MJPracticeUI.reset();renderStorage();toast('练习成绩已清除');});
  $('yakuSearch').oninput=renderYaku;
  function download(filename,mime,text){if(window.Android&&Android.saveFile){Android.saveFile(filename,mime,text);return;}const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  $('exportCsv').onclick=()=>{if(!game()){toast('还没有对局');return;}download('雀友计点-'+game().id+'.csv','text/csv',L.csv(game()));};
  $('backup').onclick=()=>{download(recoveryRaw?'雀友计点-原始恢复记录.json':'雀友计点-全部备份.json','application/json',recoveryRaw||JSON.stringify({version:1,games:db.games},null,2));};
  $('restore').onclick=()=>{if(window.Android&&Android.openBackup)Android.openBackup();else $('importFile').click();};
  function importBackup(text){try{const data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.games)||data.games.length>200)throw Error('备份格式不支持');const games=data.games.map(L.validate).map(g=>{if(!g.roundBase){g.roundBase=R.initial();g.roundBaseIndex=g.events.length;g.migrated=true;}return g;});dialog('恢复备份',`<p>将导入 ${games.length} 个对局，保留现有记录。同一对局只导入一次。</p>`,()=>{const old=JSON.parse(JSON.stringify(db));let added=0;for(const g of games)if(!db.games.some(x=>x.id===g.id)){db.games.push(g);added++;}try{persist();}catch(e){db=old;throw Error('空间不足，导入未保存');}if(!game()&&db.games.length)activate(db.games.length-1);render();toast(`已导入 ${added} 个对局`);});}catch(e){toast('无法恢复：'+e.message);}}
  window.importBackup=importBackup;
  $('importFile').onchange=async()=>{const f=$('importFile').files[0];if(!f)return;if(f.size>10*1024*1024){toast('备份文件不能超过 10 MB');return;}importBackup(await f.text());$('importFile').value='';};
  window.addEventListener('pagehide',saveState); document.addEventListener('visibilitychange',()=>{if(document.hidden)saveState();});
  openSolo();renderYaku();renderGuide();
})();
