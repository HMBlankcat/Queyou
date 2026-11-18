const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../settings.js'),'utf8');
function environment(raw,native=false){
 const values=new Map(raw?[['queyou.appearance.v1',raw]]:[]),calls=[],dataset={},styles={},events=[];
 const context={navigator:{},CustomEvent:class{constructor(name,data){this.type=name;this.detail=data.detail;}},
   document:{documentElement:{dataset,style:{setProperty:(k,v)=>styles[k]=v}},getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{},dispatchEvent:e=>events.push(e)},
   localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},matchMedia:()=>({matches:false,addEventListener:()=>{}})};
 context.window=context;if(native)context.Android={applyPreferences:value=>calls.push(JSON.parse(value))};
 vm.runInNewContext(source,context);
 return {context,A:context.MJSettings,values,calls,dataset,styles,events};
}
test('appearance restoration validates types, clamps display values and rejects CSS payloads',()=>{
 const {A,dataset,styles}=environment(JSON.stringify({theme:'ink',backgroundColor:'url(https://invalid.example)',panelOpacity:0,brightness:999,tileStyle:'soul',fontScale:120,keepAwake:'true'}));
 assert.equal(A.get().theme,'ink');assert.equal(A.get().panelOpacity,55);assert.equal(A.get().brightness,100);assert.equal(A.get().fontScale,120);assert.equal(A.get().keepAwake,false);assert.equal(A.get().backgroundColor,'#dce9df');assert.equal(dataset.theme,'ink');assert.equal(styles['--panel-alpha'],.55);
});
test('corrupt preferences and unavailable image storage do not block app startup',async()=>{
 const {A}=environment('{bad json');await A.ready;assert.equal(A.get().theme,'jade');assert.equal(A.hasImage(),false);
 const missing=environment(JSON.stringify({background:'image',backgroundKey:'image-old'}));await missing.A.ready;assert.equal(missing.A.hasImage(),false);
});
test('a failed preference write preserves the displayed and saved state',()=>{
 const {A,context,dataset,values}=environment();A.set({theme:'blue'});const before=values.get(A.KEY);
 context.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>A.set({theme:'ink'}),/未保存/);
 assert.equal(A.get().theme,'blue');assert.equal(dataset.theme,'blue');assert.equal(values.get(A.KEY),before);
});
test('appearance writes leave game and learning records intact and native brightness stays scoped',()=>{
 const {A,values,calls}=environment(null,true);values.set('queyou.v1','game sentinel');values.set('queyou.learning.v1','learning sentinel');
 A.set({systemBrightness:false,brightness:60,keepAwake:true,haptics:true,theme:'ink'});
 assert.equal(calls.at(-1).brightness,.6);assert.equal(calls.at(-1).keepAwake,true);assert.equal(calls.at(-1).dark,true);
 A.set({systemBrightness:true});assert.equal(calls.at(-1).brightness,-1);assert.equal(values.get('queyou.v1'),'game sentinel');assert.equal(values.get('queyou.learning.v1'),'learning sentinel');
});
test('invalid schemes and active image URLs are rejected before any appearance mutation',async()=>{
 const {A}=environment();A.set({theme:'paper'});
 for(const text of ['[]','{"version":1}','{"format":"queyou-appearance","version":2,"settings":{}}',JSON.stringify({format:'queyou-appearance',version:1,settings:{theme:'ink'},backgroundImage:'data:image/svg+xml,<svg onload="alert(1)"/>'})])await assert.rejects(A.importScheme(text));
 assert.equal(A.get().theme,'paper');
});
test('all 37 reference tiles map to the correct suit, honor and red-five sprite cell',()=>{
 const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tiles.js'),'utf8'),context);const T=context.MJTiles;
 for(let id=0;id<37;id++){
   const t=id<34?id:[4,13,22][id-34],row=t<9?1:t<18?2:t<27?0:3,col=id>=34?9:t<9?t:t<18?t-9:t<27?t-18:t-27;
   const svg=T.svg(id);assert.ok(svg.includes('data-tile-id="'+id+'"'));assert.ok(svg.includes('x="'+(-col*100)+'" y="'+(-row*130)+'"'),T.label(id));
   assert.ok(!T.svg(id,'','classic').includes('<image'));assert.ok(T.svg(id,'','clear').includes('<text'));
 }
});
