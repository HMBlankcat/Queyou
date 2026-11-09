const test=require('node:test'),assert=require('node:assert/strict'),R=require('../references');
test('reference tables preserve Mahjong Soul rounding and invalid combinations',()=>{
  assert.equal(R.scoreCell(4,false,false,4,30).grandTotal,7700);
  assert.equal(R.scoreCell(4,true,false,4,30).grandTotal,11600);
  assert.equal(R.scoreCell(4,false,false,3,60).grandTotal,7700);
  for(const args of [[4,false,false,2,20],[4,false,true,1,20],[4,false,false,1,25],[4,false,true,2,25],[4,false,true,1,110]])assert.equal(R.scoreCell(...args),null);
  assert.equal(R.scoreCell(4,false,false,1,110).grandTotal,3600);
});
test('limit tables show correct yakuman payer amounts and sanma loss',()=>{
  assert.equal(R.scoreCell(4,false,false,13,30,1).grandTotal,32000);
  assert.equal(R.scoreCell(4,true,false,13,30,1).grandTotal,48000);
  assert.deepEqual(R.scoreCell(4,false,true,13,30,1).payments.map(p=>[p.amount,p.count]),[[16000,1],[8000,2]]);
  assert.equal(R.scoreCell(3,false,true,13,30,1).grandTotal,24000);
  assert.equal(R.scoreCell(3,true,true,13,30,1).grandTotal,32000);
  assert.equal(R.scoreCell(4,false,false,13,30,2).grandTotal,64000);
  assert.equal(R.scoreCell(4,false,false,26,30).grandTotal,32000);
});
test('yaku reference includes split yakuhai and Mahjong Soul double yakuman',()=>{
  assert.equal(new Set(R.yakuRows.map(y=>y.name)).size,R.yakuRows.length);
  assert.equal(R.yakuRows.filter(y=>y.name.startsWith('役牌：')).length,3);
  for(const name of ['大四喜','国士无双十三面','四暗刻单骑','纯正九莲宝灯'])assert.equal(R.yakuRows.find(y=>y.name===name).hanText,'双倍役满');
  assert.equal(R.yakuRows.find(y=>y.name==='三色同顺').openText,'副露 1 番');
});
test('tutorial best interpretation example has independently expected score',()=>{
  const M=require('../engine'),E=require('../examples');
  const r=M.score(E.input({groups:['111p','222p','333p','678s','55s'],win:'8s'}),{players:4,seatWind:1,roundWind:0,tsumo:true,riichi:'none'}).best;
  assert.equal(r.han,3);assert.equal(r.fu,40);assert.equal(r.grandTotal,5200);
});
