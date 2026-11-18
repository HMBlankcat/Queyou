(function () {
  'use strict';
  const A=window.MJSettings, $=id=>document.getElementById(id), view=$('view-settings');
  const names={jade:'青竹',paper:'暖纸',ink:'夜墨',blue:'晴空',sakura:'樱霞',system:'随系统'};
  let previousView='calc', busy=false, saveTimer;
  function notice(message) { const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(saveTimer);saveTimer=setTimeout(()=>el.classList.remove('show'),3200); }
  document.addEventListener('queyou:notice',e=>notice(e.detail));
  function safe(action) { return async()=>{try{await action();}catch(e){notice(e.message||'操作失败，请重试。');}}; }
  function saved() { $('appearanceStatus').textContent='✓ 已自动保存'; }
  function refresh() {
    const s=A.get();
    view.querySelectorAll('[data-setting]').forEach(el=>{
      const key=el.dataset.setting;
      if(el.type==='checkbox')el.checked=s[key];
      else if(document.activeElement!==el)el.value=String(s[key]);
    });
    view.querySelectorAll('[data-theme-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.themeChoice===s.theme)));
    view.querySelectorAll('[data-backdrop]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.backdrop===s.background)));
    view.querySelectorAll('[data-tile-style]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tileStyle===s.tileStyle)));
    for(const key of ['backgroundOpacity','panelOpacity','brightness'])$(key+'Value').textContent=s[key]+'%';
    $('backgroundBlurValue').textContent=s.backgroundBlur===0?'无':s.backgroundBlur+' px';
    $('backgroundColorValue').textContent=s.backgroundColor.toUpperCase();
    $('themeCurrent').textContent=names[s.theme];
    $('brightness').disabled=s.systemBrightness;
    $('brightnessRow').classList.toggle('is-disabled',s.systemBrightness);
    $('brightnessHint').textContent=window.Android?'关闭后只调整本 App，退出后恢复系统亮度':'浏览器中调节页面明暗；安装版可调节 App 亮度';
    $('imageOptions').classList.toggle('hidden',s.background!=='image'||!A.hasImage());
    $('imagePositionPreset').value=String(s.imagePosition);
    $('removeBackground').disabled=!A.hasImage()||busy;
    $('chooseBackground').disabled=busy;
    $('customBackgroundThumb').style.backgroundImage=A.hasImage()?'url("'+A.image()+'")':'';
    $('customBackgroundThumb').textContent=A.hasImage()?'':'＋';
    $('backgroundStatus').textContent=busy?'正在压缩并保存背景图片…':A.hasImage()?'✓ 图片已保存在本机，关闭 App 后仍可使用。':s.background==='image'?'请重新选择背景图片。':'图片仅保存在本机，可随外观方案一起导出。';
    const hapticAvailable=!!(window.Android&&Android.applyPreferences);
    $('haptics').disabled=!hapticAvailable;
    $('hapticsHint').textContent=hapticAvailable?'点击按钮时轻微振动':'安装版支持轻触振动反馈';
    const awakeAvailable=!!window.Android||!!navigator.wakeLock;
    $('keepAwake').disabled=!awakeAvailable;
    $('keepAwakeHint').textContent=awakeAvailable?'在本 App 使用期间保持屏幕亮起':'当前浏览器不支持；安装版可用';
  }
  function refreshTiles() {
    const ids=[0,4,34,9,13,35,18,22,36,27,31,32,33];
    $('appearanceTilePreview').innerHTML=ids.map(id=>'<button type="button" class="tile" data-preview-tile="'+id+'" aria-label="预览 '+MJTiles.label(id)+'">'+MJTiles.svg(id)+'</button>').join('');
    $('settingsHeroTiles').innerHTML=[27,31,33].map(id=>'<span class="tile">'+MJTiles.svg(id)+'</span>').join('');
    view.querySelectorAll('[data-preview-style]').forEach(el=>{
      const style=el.dataset.previewStyle;
      el.innerHTML=[4,13,22].map(id=>'<span class="tile" data-skin="'+style+'">'+MJTiles.svg(id,'',style)+'</span>').join('');
    });
  }
  function change(patch) {try{A.set(patch);saved();}catch(e){refresh();notice(e.message);} }
  view.addEventListener('input',e=>{
    const el=e.target,key=el.dataset.setting;
    if(!key||!['range','color'].includes(el.type))return;
    change(el.type==='color'?{backgroundColor:el.value,background:'solid'}:{[key]:Number(el.value)});
  });
  view.addEventListener('change',e=>{
    const el=e.target,key=el.dataset.setting;if(!key||['range','color'].includes(el.type))return;
    change({[key]:el.type==='checkbox'?el.checked:key==='fontScale'?Number(el.value):el.value});
  });
  view.addEventListener('click',e=>{
    const theme=e.target.closest('button[data-theme-choice]'),backdrop=e.target.closest('button[data-backdrop]'),tiles=e.target.closest('button[data-tile-style]'),tile=e.target.closest('button[data-preview-tile]');
    if(theme)change({theme:theme.dataset.themeChoice});
    if(backdrop) {if(backdrop.dataset.backdrop==='image'&&!A.hasImage())chooseBackground();else change({background:backdrop.dataset.backdrop});}
    if(tiles)change({tileStyle:tiles.dataset.tileStyle});
    if(tile){$('previewTileName').textContent='这张是 '+MJTiles.label(Number(tile.dataset.previewTile));view.querySelectorAll('[data-preview-tile]').forEach(el=>el.classList.toggle('preview-selected',el===tile));}
  });
  $('imagePositionPreset').onchange=()=>change({imagePosition:Number($('imagePositionPreset').value)});
  async function acceptBackground(data) {
    if(busy)return;busy=true;refresh();
    try{await A.setBackground(data);saved();notice('背景已保存');}
    finally{busy=false;refresh();}
  }
  async function fileData(file) {
    if(file.size>20*1024*1024)throw Error('请选择小于 20 MB 的图片。');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片。');
    // Decode large originals via a blob URL before making the bounded data URL.
    const url=URL.createObjectURL(file);
    try {
      const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('无法读取这张图片。'));i.src=url;});
      if(img.naturalWidth*img.naturalHeight>80000000)throw Error('图片分辨率过大，请换一张图片。');
      const scale=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=c.getContext('2d');ctx.fillStyle='#f1f1ec';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
      const data=c.toDataURL('image/jpeg',.8);c.width=c.height=1;return data;
    } finally{URL.revokeObjectURL(url);}
  }
  function chooseBackground() { if(busy)return;if(window.Android&&Android.pickBackground)Android.pickBackground();else $('backgroundFile').click(); }
  $('chooseBackground').onclick=chooseBackground;
  $('backgroundFile').onchange=safe(async()=>{const file=$('backgroundFile').files[0];$('backgroundFile').value='';if(file)await acceptBackground(await fileData(file));});
  window.importBackground=data=>acceptBackground(data).catch(e=>notice(e.message));
  window.appearanceNativeError=message=>notice(message);
  $('removeBackground').onclick=safe(async()=>{await A.clearBackground();saved();refresh();notice('背景图片已移除');});
  $('exportAppearance').onclick=safe(async()=>{
    const text=await A.exportScheme(),name='雀友-外观方案.json';
    if(window.Android&&Android.saveFile)Android.saveFile(name,'application/json',text);
    else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  });
  async function importAppearance(text) {await A.importScheme(text);saved();refresh();notice('外观方案已应用');}
  window.importAppearance=text=>importAppearance(text).catch(e=>notice(e.message));
  $('importAppearance').onclick=()=>{if(window.Android&&Android.openAppearance)Android.openAppearance();else $('appearanceFile').click();};
  $('appearanceFile').onchange=safe(async()=>{const file=$('appearanceFile').files[0];$('appearanceFile').value='';if(!file)return;if(file.size>3000000)throw Error('外观方案不能超过 3 MB。');await importAppearance(await file.text());});
  $('resetAppearance').onclick=()=>MJApp.confirm('恢复默认外观','<p>恢复青竹主题、默认牌面及显示偏好，并移除自定义背景图片。</p><p class="hint">牌谱、练习成绩和学习进度保留。</p>',async()=>{await A.reset();refresh();refreshTiles();notice('已恢复默认外观');});
  $('settingsBack').onclick=()=>MJApp.go(previousView);
  window.MJSettingsUI={back:()=>MJApp.go(previousView)};
  document.addEventListener('queyou:view',e=>{
    if(e.detail==='settings'){refresh();refreshTiles();}
    else previousView=e.detail;
  });
  document.addEventListener('queyou:appearance',refresh);
  document.addEventListener('queyou:background',refresh);
  document.addEventListener('click',e=>{
    if(e.isTrusted&&e.target.closest('button,input[type="checkbox"]')&&A.get().haptics&&window.Android&&Android.touchFeedback)Android.touchFeedback();
  });
  refresh();refreshTiles();
  A.ready.then(()=>{refresh();A.updateWakeLock();});
  // All feature modules have mounted by this point; the old calc startup is preserved by default.
  if(A.get().startView!=='calc')MJApp.go(A.get().startView);
})();
