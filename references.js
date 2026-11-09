(function(root){
  'use strict';
  const M=typeof module!=='undefined'&&module.exports?require('./engine'):root.MJ;
  const doubles=['大四喜','国士无双十三面','四暗刻单骑','纯正九莲宝灯'];
  const extra=[
    {name:'国士无双十三面',han:13,open:null,desc:'和牌前十三种幺九各一张，十三面等待。'},
    {name:'四暗刻单骑',han:13,open:null,desc:'四组暗刻已经完成，单骑等待雀头，荣和也可。'},
    {name:'纯正九莲宝灯',han:13,open:null,desc:'门前同色，和牌前为 1112345678999，九面等待。'}
  ];
  const yakuRows=M.YAKU_TABLE.filter(y=>y.name!=='役牌').concat([
    {name:'役牌：自风',han:1,open:1,desc:'自己风位的刻子或杠子，1 番。'},
    {name:'役牌：场风',han:1,open:1,desc:'当前场风的刻子或杠子，1 番；与自风相同可叠加。'},
    {name:'役牌：三元牌',han:1,open:1,desc:'白、发、中每一组刻子或杠子各 1 番。'}
  ],extra).map(y=>({...y,rank:doubles.includes(y.name)?26:y.han,hanText:doubles.includes(y.name)?'双倍役满':y.han===13?'役满':y.han+' 番',openText:y.open===null?'门前限定':y.open<y.han?'副露 '+y.open+' 番':'可副露'})).sort((a,b)=>a.rank-b.rank);
  const otherRows=[
    ['宝牌／里宝牌／赤宝牌','每张加 1 番','不是役；里宝牌仅立直和牌计入。赤五可与宝牌叠加。'],
    ['拔北（三麻）','每张加 1 番','不是役，不破坏门前；北为宝牌时可叠加。不自动产生岭上。'],
    ['流局满贯','按满贯自摸','荒牌流局时，舍牌全为幺九且未被鸣走，并符合门前等成立条件。属于特殊结算，不计普通役。'],
    ['四风连打','途中流局','四麻第一巡无人鸣牌，四家打出同一种风牌。'],
    ['四杠散了','途中流局','两人以上共开四杠，第四杠后的舍牌无人和牌时判定。一个人四杠不因此流局。'],
    ['九种九牌','可宣告流局','自己的第一巡、无人鸣牌打断，起手与摸牌中有至少九种不同幺九牌。'],
    ['四家立直','途中流局','四麻四人均成功立直；第四家宣言牌未被荣和，立直成立后判定。']
  ];
  const fuValues=[20,25,30,40,50,60,70,80,90,100,110];
  function scoreCell(players,dealer,tsumo,han,fu,yakuman=0){
    if(!yakuman&&fu===110&&han===1&&tsumo)return null;
    try{return M.quickScore(han,fu,{players,seatWind:dealer?0:1,tsumo,honba:0,riichiSticks:0},yakuman);}catch(_){return null;}
  }
  const limits=[
    {name:'满贯',condition:'5 番，或 4 番 40 符起／3 番 70 符起',han:5},
    {name:'跳满',condition:'6–7 番',han:6},{name:'倍满',condition:'8–10 番',han:8},
    {name:'三倍满',condition:'11–12 番',han:11},{name:'累计役满',condition:'13 番及以上（普通役累计）',han:13},
    {name:'单倍役满',condition:'一个单倍役满役',han:13,yakuman:1},
    {name:'双倍役满',condition:'双倍役满役或役满复合',han:13,yakuman:2},
    {name:'三倍役满',condition:'合计 3 倍役满',han:13,yakuman:3}
  ];
  const api={yakuRows,otherRows,fuValues,scoreCell,limits};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.MJReferences=api;
})(typeof window==='undefined'?globalThis:window);
