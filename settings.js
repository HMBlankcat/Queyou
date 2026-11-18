/* Appearance preferences are separate from game, training and learning records. */
(function (global) {
  'use strict';
  const KEY = 'queyou.appearance.v1';
  const defaults = Object.freeze({
    theme: 'jade', background: 'soft', backgroundColor: '#dce9df',
    backgroundOpacity: 85, panelOpacity: 96, backgroundBlur: 0,
    imageFit: 'cover', imagePosition: 50, backgroundKey: '',
    tileStyle: 'soul', tileSize: 'standard', tileLabels: false,
    fontScale: 100, reduceMotion: false, brightness: 80, systemBrightness: true,
    keepAwake: false, haptics: false, startView: 'calc'
  });
  const choices = {
    theme: ['jade', 'paper', 'ink', 'blue', 'sakura', 'system'],
    background: ['soft', 'forest', 'dusk', 'solid', 'image'],
    tileStyle: ['soul', 'classic', 'clear'], tileSize: ['compact', 'standard', 'large'],
    imageFit: ['cover', 'contain'], startView: ['calc', 'game', 'learning', 'practice']
  };
  const limits = {backgroundOpacity:[0,100], panelOpacity:[55,100], backgroundBlur:[0,16], imagePosition:[0,100], fontScale:[100,120], brightness:[20,100]};
  function normalize(input) {
    const value = {...defaults};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return value;
    Object.keys(choices).forEach(k => { if (choices[k].includes(input[k])) value[k] = input[k]; });
    Object.keys(limits).forEach(k => {
      if (typeof input[k] === 'number' && Number.isFinite(input[k])) value[k] = Math.round(Math.max(limits[k][0], Math.min(limits[k][1], input[k])));
    });
    Object.keys(defaults).filter(k => typeof defaults[k] === 'boolean').forEach(k => { if (typeof input[k] === 'boolean') value[k] = input[k]; });
    if (typeof input.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.backgroundColor)) value.backgroundColor = input.backgroundColor;
    if (typeof input.backgroundKey === 'string' && /^[a-z0-9-]{1,80}$/.test(input.backgroundKey)) value.backgroundKey = input.backgroundKey;
    return value;
  }
  let state = {...defaults}, imageData = '', dbPromise, nativeSnapshot = '', imageBusy = false, wakeLock;
  try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch (_) { /* A bad preference never prevents opening the app. */ }
  const root = document.documentElement, systemDark = global.matchMedia('(prefers-color-scheme: dark)');
  const colors = {jade:'#f4f7f2', paper:'#faf5eb', ink:'#151e23', blue:'#f1f5fa', sakura:'#fbf3f5'};
  function resolvedTheme() { return state.theme === 'system' ? (systemDark.matches ? 'ink' : 'jade') : state.theme; }
  function notify(name, detail) { document.dispatchEvent(new CustomEvent(name, {detail})); }
  function apply() {
    const theme = resolvedTheme();
    root.dataset.theme = theme;
    root.dataset.tileStyle = state.tileStyle;
    root.dataset.tileSize = state.tileSize;
    root.dataset.tileLabels = String(state.tileLabels);
    root.dataset.reduceMotion = String(state.reduceMotion);
    root.style.setProperty('--font-scale', state.fontScale / 100);
    root.style.setProperty('--panel-alpha', state.panelOpacity / 100);
    root.style.setProperty('--backdrop-alpha', state.backgroundOpacity / 100);
    root.style.setProperty('--backdrop-blur', state.backgroundBlur + 'px');
    root.style.setProperty('--custom-bg', state.backgroundColor);
    root.style.setProperty('--image-position', state.imagePosition + '%');
    root.style.setProperty('--image-fit', state.imageFit);
    const backdrop = document.getElementById('appBackdrop');
    if (backdrop) {
      backdrop.dataset.mode = state.background;
      backdrop.style.backgroundImage = state.background === 'image' && imageData ? 'url("' + imageData + '")' : '';
    }
    const dimmer = document.getElementById('appDimmer');
    if (dimmer) dimmer.style.opacity = global.Android || state.systemBrightness ? '0' : String((100 - state.brightness) / 130);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = colors[theme];
    const nativeValues = JSON.stringify({brightness:state.systemBrightness ? -1 : state.brightness / 100, keepAwake:state.keepAwake, haptics:state.haptics, color:colors[theme], dark:theme === 'ink'});
    if (nativeSnapshot !== nativeValues && global.Android && Android.applyPreferences) {
      try { Android.applyPreferences(nativeValues); nativeSnapshot = nativeValues; } catch (_) { /* Web fallback remains usable. */ }
    }
    if (global.MJTiles && MJTiles.setStyle) MJTiles.setStyle(state.tileStyle);
  }
  function set(patch) {
    const next = normalize({...state, ...patch});
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch (_) { throw Error('设置未保存，存储空间可能不足。'); }
    state = next; apply(); notify('queyou:appearance', {...state});
    return {...state};
  }
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(Error('当前环境不支持保存背景图片。'));
      const request = indexedDB.open('queyou-appearance', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images');
      request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();dbPromise=undefined;}; resolve(db); };
      request.onerror = () => { dbPromise=undefined; reject(Error('无法打开图片存储，请重试。')); };
      request.onblocked = () => { dbPromise=undefined; reject(Error('图片存储被另一个页面占用，请关闭其他页面后重试。')); };
    });
    return dbPromise;
  }
  async function imageStore(action, key, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('images');
      const request = action === 'get' ? store.get(key) : action === 'put' ? store.put(value,key) : action === 'clear' ? store.clear() : store.delete(key);
      let result;
      request.onsuccess = () => { result=request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(Error('背景图片未保存，存储空间可能不足。'));
    });
  }
  function validImage(value) { return typeof value === 'string' && value.length < 2800000 && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value); }
  function loadImage(data) {
    return new Promise((resolve,reject) => {
      const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(Error('无法读取图片，请选择 JPG、PNG 或 WebP 图片。')); img.src=data;
    });
  }
  async function prepareImage(data) {
    if (!validImage(data)) throw Error('背景图片格式无效或体积过大。');
    const img = await loadImage(data);
    if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 80000000) throw Error('图片分辨率过大，请换一张图片。');
    const scale=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#f1f1ec';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let output;
    for (const quality of [.88,.74,.58,.42]) { output=canvas.toDataURL('image/jpeg',quality); if(output.length<1300000)break; }
    canvas.width=canvas.height=1;
    if (output.length>1800000) throw Error('图片压缩后仍过大，请换一张图片。');
    return output;
  }
  async function commitAppearance(patch, data) {
    if (imageBusy) throw Error('正在保存图片，请稍后。');
    imageBusy=true;
    const oldKey=state.backgroundKey;
    let key='';
    try {
      if (data) {
        key='image-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
        await imageStore('put',key,data);
      }
      set({...patch,backgroundKey:key});
      imageData=data; apply();
      if(oldKey) await imageStore('delete',oldKey).catch(()=>{});
      notify('queyou:background', {hasImage:!!data});
    } catch(e) {
      if(key) await imageStore('delete',key).catch(()=>{});
      throw e;
    } finally { imageBusy=false; }
  }
  async function setBackground(data) { await ready; const prepared=await prepareImage(data); await commitAppearance({background:'image'},prepared); }
  async function clearBackground() { await ready; await commitAppearance({background:state.background==='image'?'soft':state.background},''); }
  async function reset() {
    await ready;
    if(imageBusy)throw Error('正在保存图片，请稍后重置。');
    set({...defaults}); imageData=''; apply();
    await imageStore('clear').catch(()=>{});
    notify('queyou:background',{hasImage:false});
  }
  async function exportScheme() {
    await ready;
    const settings={...state}; delete settings.backgroundKey;
    return JSON.stringify({format:'queyou-appearance',version:1,settings,backgroundImage:imageData},null,2);
  }
  async function importScheme(text) {
    if(typeof text!=='string'||text.length>3000000)throw Error('外观方案不能超过 3 MB。');
    let value;try{value=JSON.parse(text);}catch(_){throw Error('这不是有效的外观方案文件。');}
    if(!value||value.format!=='queyou-appearance'||value.version!==1||!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings))throw Error('请选择雀友导出的外观方案。');
    await ready;
    const next=normalize(value.settings);
    let data='';if(value.backgroundImage)data=await prepareImage(value.backgroundImage);
    if(next.background==='image'&&!data)next.background='soft';
    await commitAppearance(next,data);
  }
  async function updateWakeLock() {
    if (!navigator.wakeLock || global.Android) return;
    if (wakeLock && (!state.keepAwake || document.hidden)) { await wakeLock.release().catch(()=>{}); wakeLock=undefined; }
    if (state.keepAwake && !document.hidden && !wakeLock) {
      try { wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>{wakeLock=undefined;}); }
      catch (_) { notify('queyou:notice','当前浏览器暂时无法保持常亮。'); }
    }
  }
  const ready=(async()=>{
    if(state.backgroundKey) {
      try { const data=await imageStore('get',state.backgroundKey); if(validImage(data))imageData=data; }
      catch (_) { /* Missing images fall back to the theme background. */ }
    }
    apply();notify('queyou:background',{hasImage:!!imageData});
  })();
  global.MJSettings={KEY,defaults,normalize,get:()=>({...state}),set,apply,ready,setBackground,clearBackground,reset,exportScheme,importScheme,hasImage:()=>!!imageData, image:()=>imageData, resolvedTheme, updateWakeLock};
  apply();
  if(systemDark.addEventListener)systemDark.addEventListener('change',()=>{apply();notify('queyou:appearance',{...state});});
  document.addEventListener('DOMContentLoaded',apply);
  document.addEventListener('visibilitychange',updateWakeLock);
  document.addEventListener('queyou:appearance',updateWakeLock);
})(window);
