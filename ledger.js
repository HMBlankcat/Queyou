/* Local, zero-sum game ledger. No network dependencies. */
(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  function check(condition, message) { if (!condition) throw Error(message); }
  function create(names, initial) {
    check([3, 4].includes(names.length), '需要三名或四名玩家');
    names = names.map(n => String(n).trim());
    check(names.every(n => n && n.length <= 20) && new Set(names).size === names.length, '玩家姓名须不同，且为 1–20 字');
    check(Number.isInteger(initial) && initial >= 0 && initial <= 1000000 && initial % 100 === 0, '初始点数须为 0–1000000 内的整百数');
    return { version: 1, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8), created: new Date().toISOString(), names, initial, events: [] };
  }
  function balances(game) {
    const points = game.names.map(() => game.initial); let pot = 0;
    for (const e of game.events) for (const t of e.transfers) {
      if (t.from === 'pot') pot -= t.amount; else points[t.from] -= t.amount;
      if (t.to === 'pot') pot += t.amount; else points[t.to] += t.amount;
    }
    return { points, pot };
  }
  function add(game, label, transfers, meta = {}) {
    check(typeof label === 'string' && label.length > 0 && label.length <= 200, '记录标题无效');
    check(Array.isArray(transfers), '转点格式错误');
    const b = balances(game);
    const valid = x => x === 'pot' || Number.isInteger(x) && x >= 0 && x < game.names.length;
    for (const t of transfers) {
      check(valid(t.from) && valid(t.to) && t.from !== t.to, '请选择不同的支付与收取方');
      check(Number.isInteger(t.amount) && t.amount > 0 && t.amount <= 10000000 && t.amount % 100 === 0, '点数须为正整百数，且不超过一千万');
      check(t.from !== 'pot' && t.to !== 'pot' || t.amount % 1000 === 0, '供托按 1000 点整根记录');
      if (t.from === 'pot') b.pot -= t.amount;
      if (t.to === 'pot') b.pot += t.amount;
      check(b.pot >= 0, '供托池不足，请先登记立直');
    }
    const next = clone(game);
    next.events.push({ id: Date.now().toString(36) + '-' + next.events.length, time: new Date().toISOString(), label, transfers: clone(transfers), meta: clone(meta) });
    return next;
  }
  function settle(game, result, winner, dealer, loser, tsumo, label) {
    check(Number.isInteger(winner) && winner >= 0 && winner < game.names.length && Number.isInteger(dealer) && dealer >= 0 && dealer < game.names.length, '玩家无效');
    check(result && Array.isArray(result.payments) && result.payments.length, '请先完成算点');
    const transfers = [];
    if (tsumo) {
      game.names.forEach((_, i) => {
        if (i === winner) return;
        const p = result.payments.find(p => p.from === (winner === dealer ? '每家' : i === dealer ? '亲家' : '子家'));
        check(p, '算点座位与当前庄家不一致');
        transfers.push({ from: i, to: winner, amount: p.amount });
      });
    } else {
      check(Number.isInteger(loser) && loser >= 0 && loser < game.names.length && loser !== winner, '放铳者不能是和牌者');
      transfers.push({ from: loser, to: winner, amount: result.payments[0].amount });
    }
    const pot = balances(game).pot;
    check(result.stickExtra === pot, '供托数与账本不一致，请重新算点');
    if (pot) transfers.push({ from: 'pot', to: winner, amount: pot });
    check(transfers.reduce((s, t) => s + t.amount, 0) === result.grandTotal, '支付合计与算点不一致');
    return add(game, label, transfers, { type: 'win', winner, dealer, tsumo, han: result.han, fu: result.fu });
  }
  function draw(game, ready, label) {
    const count = ready.filter(Boolean).length, n = game.names.length;
    check(ready.length === n, '听牌玩家数错误');
    const pool = n === 3 ? 2000 : 3000, transfers = [];
    if (count > 0 && count < n) {
      for (let i = 0; i < n; i++) if (!ready[i]) {
        for (let j = 0; j < n; j++) if (ready[j]) transfers.push({ from: i, to: j, amount: pool / ((n - count) * count) });
      }
    }
    // Four-player 2-vs-2 needs 750-point edges. Net settlement is 1500 each.
    if (n === 4 && count === 2) {
      transfers.length = 0;
      const yes = [0,1,2,3].filter(i => ready[i]), no = [0,1,2,3].filter(i => !ready[i]);
      no.forEach((i, k) => transfers.push({ from: i, to: yes[k], amount: 1500 }));
    }
    return add(game, label, transfers, { type: 'draw', ready });
  }
  function validate(game) {
    check(game && game.version === 1 && Array.isArray(game.names) && Array.isArray(game.events) && game.events.length <= 10000, '备份格式不支持');
    let checked = create(game.names, game.initial);
    for (const e of game.events) {
      checked = add(checked, e.label, e.transfers, e.meta || {});
      const last = checked.events[checked.events.length-1];
      if (typeof e.time === 'string' && Number.isFinite(Date.parse(e.time))) last.time = e.time;
      if (typeof e.id === 'string') last.id = e.id;
    }
    if (game.roundBase) {
      const R = typeof module !== 'undefined' && module.exports ? require('./rounds.js') : root.MJRounds;
      checked.roundBase = R.validate(game.roundBase, game.names.length);
      check(Number.isInteger(game.roundBaseIndex) && game.roundBaseIndex>=0 && game.roundBaseIndex<=game.events.length, '起始局况位置无效');
      checked.roundBaseIndex = game.roundBaseIndex;
      if(game.migrated===true)checked.migrated=true;
      R.current(checked);
    }
    return { ...checked, id: String(game.id || checked.id), created: String(game.created || checked.created) };
  }
  function csv(game) {
    const quote = value => '"' + String(value).replace(/^[=+@\-]/, "'$&").replace(/"/g, '""') + '"';
    const rows = [['记录', '时间', '说明', ...game.names.map(n => n + ' 本笔'), ...game.names.map(n => n + ' 总分'), '供托池', '支付明细']];
    const points = game.names.map(() => game.initial); let pot = 0;
    rows.push(['初始', game.created, '', ...points.map(() => 0), ...points, 0, '']);
    game.events.forEach((e, index) => {
      const delta = points.map(() => 0);
      e.transfers.forEach(t => { if (t.from === 'pot') pot -= t.amount; else { points[t.from] -= t.amount; delta[t.from] -= t.amount; } if (t.to === 'pot') pot += t.amount; else { points[t.to] += t.amount; delta[t.to] += t.amount; } });
      const name = i => i === 'pot' ? '供托池' : game.names[i];
      rows.push([index + 1, e.time, e.label, ...delta, ...points, pot, e.transfers.map(t => `${name(t.from)} → ${name(t.to)}：${t.amount}`).join('；')]);
    });
    return '\uFEFF' + rows.map(r => r.map(quote).join(',')).join('\r\n');
  }
  const api = { create, balances, add, settle, draw, validate, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MJLedger = api;
})(typeof window === 'undefined' ? globalThis : window);
