importScripts('engine.js','efficiency.js');
self.onmessage=function(event){
  const {id,kind,input,options,row}=event.data;
  try{
    let result;
    if(kind==='analyze')result=MJEfficiency.analyze(input);
    else if(kind==='details')result={quality:MJEfficiency.quality(input,row),ev:MJEfficiency.ev(input,row,options)};
    else if(kind==='pure')result=MJEfficiency.pureQuestion(options.level,options.suit,Math.random,options.previous);
    else throw Error('未知分析请求');
    self.postMessage({id,ok:true,result});
  }catch(error){self.postMessage({id,ok:false,error:error.message});}
};
