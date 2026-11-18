/* Offline complete-course library. Reading and self-checks never change a game. */
(function () {
  'use strict';
  const D = window.MJLearningData, A = window.MJApp;
  if (!D || !A) return;
  const $ = id => document.getElementById(id);
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const KEY = 'queyou.learning.v1';
  const chapterMap = new Map(D.chapters.map(c => [c.id, c]));
  const courseMap = new Map(D.courses.map(c => [c.id, c]));
  const fresh = () => ({version:1, last:'', read:[], positions:{}, answers:{}, font:17, format:'text'});
  let state = fresh(), current = null, selectedCourse = 'initial', active = false, pending = null;
  let saveTimer = 0, searchTimer = 0, zoom = 1, scrollFrame = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.version === 1) {
      state.last = chapterMap.has(saved.last) ? saved.last : '';
      state.read = Array.isArray(saved.read) ? [...new Set(saved.read.filter(id => chapterMap.has(id)))] : [];
      state.font = Math.max(15, Math.min(23, Number(saved.font) || 17));
      state.format = saved.format === 'original' ? 'original' : 'text';
      if (saved.positions && typeof saved.positions === 'object') {
        for (const [id, pos] of Object.entries(saved.positions)) {
          if (chapterMap.has(id) && pos && Number.isFinite(pos.y) && pos.y >= 0) {
            state.positions[id] = {y:Math.min(pos.y, 1e7), width:Number(pos.width)||0, format:pos.format==='original'?'original':'text'};
          }
        }
      }
      if (saved.answers && typeof saved.answers === 'object') {
        for (const [id, answer] of Object.entries(saved.answers)) {
          if (D.questions[id] && D.questions[id].opts && answer && Number.isInteger(answer.choice) && answer.choice >= 0 && answer.choice < D.questions[id].opts.length) {
            state.answers[id] = {choice:answer.choice, checked:answer.checked===true};
          }
        }
      }
    }
  } catch (_) { /* A corrupt reading record does not affect ledgers. */ }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('learnSaveStatus').textContent='阅读位置保存在本机'; }
    catch (_) { $('learnSaveStatus').textContent='空间不足，阅读位置未能保存'; }
  }
  function savePosition() {
    clearTimeout(saveTimer);
    if (!active || !current) return;
    state.positions[current.id] = {y:Math.round(window.scrollY), width:window.innerWidth, format:state.format};
    state.last = current.id;
    persist();
  }
  function progress(course) {
    const main = D.chapters.filter(c => c.course === course && c.group === '正文');
    return {done:main.filter(c => state.read.includes(c.id)).length, total:main.length};
  }
  function renderLibrary() {
    $('learningCourses').innerHTML = D.courses.map(c => {
      const p = progress(c.id);
      return `<button class="learn-course-card learn-course-${c.id}" data-learn-course="${c.id}"><span class="learn-book-symbol" aria-hidden="true">${c.id==='initial'?'初':'进'}</span><span class="learn-course-copy"><small>${esc(c.subtitle)}</small><strong>${esc(c.title)}</strong><span>${esc(c.description)}</span><span class="learn-course-progress">已读 ${p.done} / ${p.total} 篇正文 <b aria-hidden="true">→</b></span><progress value="${p.done}" max="${p.total}" aria-label="正文阅读进度"></progress></span></button>`;
    }).join('');
    const last = chapterMap.get(state.last);
    $('learnResume').hidden = !last;
    if (last) $('learnResume').innerHTML = `<div><small>上次读到</small><strong>${esc(last.title)}</strong><span>${esc(courseMap.get(last.course).title)}</span></div><button class="primary" data-learn-open="${last.id}">继续阅读 →</button>`;
    $('learnCollectionStats').textContent = `完整收录 · ${D.counts.initialChapters} 章入门 + ${D.counts.advancedChapters} 节进阶 · ${D.counts.questions} 道课内自测 · ${D.counts.appendices} 篇附录`;
    search();
  }
  function chapterButton(c, number) {
    return `<button class="learn-chapter-row" data-learn-open="${c.id}"><span class="learn-chapter-num">${number || (c.number ? String(Number(c.number)).padStart(2,'0') : '附')}</span><span><strong>${esc(c.title)}</strong><small>${c.page ? '整页第 '+c.page+' 页 · ' : ''}${Math.max(1,Math.ceil(c.text.length/450))} 分钟阅读${state.positions[c.id]?' · 有阅读记录':''}</small></span><span class="learn-read-mark" aria-label="${state.read.includes(c.id)?'已读':'未读'}">${state.read.includes(c.id)?'✓':'›'}</span></button>`;
  }
  function renderCourse() {
    const course = courseMap.get(selectedCourse) || D.courses[0], p = progress(course.id);
    $('learnCourseTitle').textContent = course.title;
    $('learnCourseDescription').textContent = course.description;
    $('learnCourseProgress').textContent = `${p.done} / ${p.total} 篇正文已读`;
    const list = D.chapters.filter(c => c.course === course.id);
    const groups = [...new Set(list.map(c => c.group))];
    $('learnCourseChapters').innerHTML = groups.map(group => `<details class="learn-toc-group" ${group==='正文'?'open':''}><summary>${esc(group)} <span>${list.filter(c=>c.group===group).length} 篇</span></summary>${list.filter(c=>c.group===group).map((c,i)=>chapterButton(c,group==='正文'?String(course.id==='initial'?i:i+1).padStart(2,'0'):null)).join('')}</details>`).join('');
    $('learnCourseStart').dataset.learnOpen = list.find(c => !state.read.includes(c.id) && c.group==='正文')?.id || list[0].id;
  }
  function search() {
    const query = $('learningSearch').value.trim(), scope = $('learningScope').value;
    const results = $('learningSearchResults');
    results.hidden = !query;
    if (!query) { results.innerHTML=''; return; }
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = D.chapters.filter(c => (!scope || c.course === scope) && terms.every(t => (c.title+' '+c.text).toLocaleLowerCase().includes(t)));
    results.innerHTML = `<p class="learn-search-count" role="status">找到 ${matches.length} 篇 · 点击打开完整章节</p>` + (matches.length ? matches.map(c => {
      const at = Math.max(0,c.text.toLocaleLowerCase().indexOf(terms[0])), start = Math.max(0,at-32);
      const excerpt = (start?'…':'') + c.text.slice(start,start+130) + (start+130<c.text.length?'…':'');
      return `<button class="learn-search-hit" data-learn-open="${c.id}"><small>${esc(courseMap.get(c.course).title)} · ${esc(c.group)}</small><strong>${esc(c.title)}</strong><span>${highlight(excerpt,terms)}</span></button>`;
    }).join('') : '<p>试试缩短关键词，或选择「全部教程」。</p>');
  }
  function highlight(text, terms) {
    // Slice original strings first; escape each fragment before adding our own markup.
    const term = terms[0], at = text.toLocaleLowerCase().indexOf(term);
    return at < 0 ? esc(text) : esc(text.slice(0,at))+'<mark>'+esc(text.slice(at,at+term.length))+'</mark>'+esc(text.slice(at+term.length));
  }
  function openChapter(id, restore=true, anchor='') {
    if (!chapterMap.has(id)) return;
    pending={id,restore,anchor};
    A.go('reader');
  }
  function readerChapters() { return D.chapters.filter(c => c.course === current.course); }
  function hydrateArticle() {
    $('learnArticle').querySelectorAll('[data-learning-tile]').forEach(e => { e.innerHTML=window.MJTiles.svg(Number(e.dataset.learningTile)); });
    $('learnArticle').querySelectorAll('.learn-math').forEach(e => {
      if (window.katex) {
        try { window.katex.render(e.dataset.latex,e,{displayMode:e.dataset.display==='1',throwOnError:true,trust:false,strict:'ignore'}); }
        catch (_) { e.textContent=e.dataset.latex; e.classList.add('learn-math-fallback'); }
      }
    });
    $('learnArticle').querySelectorAll('[data-question]').forEach(form => {
      const answer = state.answers[form.dataset.question];
      if (!answer) return;
      const input = form.querySelector(`input[value="${answer.choice}"]`);
      if (input) input.checked = true;
      if (answer.checked) showCheck(form,answer.choice,false);
    });
  }
  function renderReader() {
    if (pending) {
      current=chapterMap.get(pending.id);
      selectedCourse=current.course;
    } else if (!current) current=chapterMap.get(state.last) || D.chapters[0];
    const request = pending || {restore:true,anchor:''};
    pending=null;
    state.last=current.id;
    $('learnReaderCourse').textContent=courseMap.get(current.course).title+' · '+current.group;
    $('learnReaderTitle').textContent=current.title;
    const list=readerChapters(), index=list.indexOf(current);
    $('learnReaderCount').textContent=`${index+1} / ${list.length} 篇${current.page?' · 整页第 '+current.page+' 页':''}`;
    $('learnChapterSelect').innerHTML = [...new Set(list.map(c=>c.group))].map(group=>`<optgroup label="${esc(group)}">${list.filter(c=>c.group===group).map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('')}</optgroup>`).join('');
    $('learnChapterSelect').value=current.id;
    $('learnHeadingSelect').innerHTML='<option value="">跳到本篇小节…</option>'+current.toc.map(h=>`<option value="${h.id}">${esc(h.title)}</option>`).join('');
    $('learnHeadingSelect').disabled=!current.toc.length;
    $('learnArticle').innerHTML=current.html;
    $('learnArticle').style.setProperty('--learn-font',state.font+'px');
    $('learnFontSize').textContent=state.font+' px';
    $('learnSmaller').disabled=state.font<=15;
    $('learnLarger').disabled=state.font>=23;
    $('learnOriginalToggle').hidden=!current.original;
    $('learnOriginalToggle').textContent=state.format==='original'?'切换正文阅读':'查看整页版式';
    const original=current.original;
    $('learnOriginalPage').innerHTML=original?`<p class="hint">整页第 ${current.page} / 15 页 · 点图放大，再用＋／－调整</p><button class="learn-image-button" data-learn-image="${original.src}" aria-label="放大整页第 ${current.page} 页"><img src="${original.src}" width="${original.width}" height="${original.height}" alt="整页第 ${current.page} 页：${esc(current.title)}"></button>`:'';
    $('learnArticle').hidden=!!original&&state.format==='original';
    $('learnOriginalPage').hidden=!original||state.format!=='original';
    hydrateArticle();
    renderReadButton();
    $('learnPrevious').disabled=index===0;
    $('learnNext').disabled=index===list.length-1;
    $('learnNextLabel').textContent=index<list.length-1?'下一篇：'+list[index+1].title:'已到本教程最后一篇';
    active=true;
    persist();
    cancelAnimationFrame(scrollFrame);
    scrollFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if (!active) return;
      if (request.anchor && $(request.anchor)) $(request.anchor).scrollIntoView();
      else {
        const pos=state.positions[current.id];
        window.scrollTo(0,request.restore&&pos&&pos.width===window.innerWidth&&pos.format===state.format?pos.y:0);
      }
    }));
  }
  function renderReadButton() {
    const read=state.read.includes(current.id);
    $('learnRead').textContent=read?'✓ 已读 · 取消标记':'标记本篇已读';
    $('learnRead').setAttribute('aria-pressed',String(read));
  }
  function showCheck(form, choice, reveal=true) {
    const q=D.questions[form.dataset.question], correct=choice===q.ans;
    const status=form.querySelector('.learn-check-result');
    status.textContent=correct?'答对了，可展开理由核对。':`本次选择 ${String.fromCharCode(65+choice)}；参考答案是 ${String.fromCharCode(65+q.ans)}，请核对下面的依据。`;
    status.className='learn-check-result '+(correct?'learn-correct':'learn-incorrect');
    if (reveal) form.querySelector('.learn-solution').open=true;
  }
  function imageOpen(src, alt) {
    // Only known packaged images can enter the viewer.
    if (!/^learn-(diagram|page)-\d{2}\.png$/.test(src)) return;
    zoom=1;
    $('learnImageTitle').textContent=alt||'教程插图';
    $('learnZoomImage').src=src;
    $('learnZoomImage').alt=alt||'教程插图';
    applyZoom();
    $('learningImage').showModal();
    $('learnImageScroll').scrollTop=0;
    $('learnImageScroll').scrollLeft=0;
  }
  function applyZoom() {
    $('learnZoomImage').style.width=(zoom*100)+'%';
    $('learnZoomLabel').textContent=Math.round(zoom*100)+'%';
    $('learnZoomOut').disabled=zoom<=1;
    $('learnZoomIn').disabled=zoom>=4;
  }
  function goCourse(id) {
    if (!courseMap.has(id)) return;
    selectedCourse=id;
    A.go('course');
  }
  $('learningSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,120);});
  $('learningScope').addEventListener('change',search);
  $('learnChapterSelect').addEventListener('change',e=>openChapter(e.target.value));
  $('learnHeadingSelect').addEventListener('change',e=>{
    if (state.format==='original' && current.original) {
      const anchor=e.target.value;
      state.format='text';pending={id:current.id,restore:false,anchor};renderReader();return;
    }
    const target=$(e.target.value);
    if (target) { target.scrollIntoView({block:'start'}); savePosition(); }
  });
  $('learnBackToCourse').onclick=()=>goCourse(current?.course||selectedCourse);
  $('learnPrevious').onclick=()=>{const list=readerChapters(), i=list.indexOf(current);if(i>0)openChapter(list[i-1].id,false);};
  $('learnNext').onclick=()=>{const list=readerChapters(), i=list.indexOf(current);if(i<list.length-1)openChapter(list[i+1].id,false);};
  $('learnRead').onclick=()=>{if(!current)return;state.read=state.read.includes(current.id)?state.read.filter(id=>id!==current.id):state.read.concat(current.id);persist();renderReadButton();};
  $('learnSmaller').onclick=()=>fontChange(-1);
  $('learnLarger').onclick=()=>fontChange(1);
  function fontChange(step) {
    state.font=Math.max(15,Math.min(23,state.font+step));
    $('learnArticle').style.setProperty('--learn-font',state.font+'px');
    $('learnFontSize').textContent=state.font+' px';
    $('learnSmaller').disabled=state.font<=15;
    $('learnLarger').disabled=state.font>=23;
    savePosition();
  }
  $('learnOriginalToggle').onclick=()=>{
    savePosition();
    state.format=state.format==='original'?'text':'original';
    pending={id:current.id,restore:false,anchor:''};
    renderReader();
  };
  $('learnZoomIn').onclick=()=>{zoom=Math.min(4,zoom+.5);applyZoom();};
  $('learnZoomOut').onclick=()=>{zoom=Math.max(1,zoom-.5);applyZoom();};
  $('learnImageClose').onclick=()=>$('learningImage').close();
  $('learnResetProgress').onclick=()=>A.confirm('清除完整教程的阅读记录','<p>将清除学习书架的已读标记、阅读位置和课内选择题记录。教程正文与插图仍可离线阅读；对局和其他练习成绩保留。</p>',()=>reset());
  function reset() {
    clearTimeout(saveTimer);
    cancelAnimationFrame(scrollFrame);
    state=fresh();
    active=false;current=null;pending=null;
    localStorage.removeItem(KEY);
    renderLibrary();
    if ($('view-course').classList.contains('active')) renderCourse();
    if ($('view-reader').classList.contains('active')) A.go('learning');
  }
  document.addEventListener('click',e=>{
    const course=e.target.closest('[data-learn-course]');
    const open=e.target.closest('[data-learn-open]');
    const check=e.target.closest('[data-learn-check]');
    const image=e.target.closest('[data-learn-image]');
    const external=e.target.closest('[data-learn-external]');
    if (course) goCourse(course.dataset.learnCourse);
    else if (open) {e.preventDefault();openChapter(open.dataset.learnOpen);}
    else if (check) {
      const form=check.closest('[data-question]'), input=form.querySelector('input:checked');
      if (!input) {form.querySelector('.learn-check-result').textContent='请先选择一个答案。';return;}
      state.answers[form.dataset.question]={choice:Number(input.value),checked:true};
      showCheck(form,Number(input.value));persist();
    } else if (image) imageOpen(image.dataset.learnImage,image.querySelector('img')?.alt);
    else if (external && window.Android?.openExternal) {
      e.preventDefault(); window.Android.openExternal(external.href);
    }
  });
  document.addEventListener('keydown',e=>{
    const link=e.target.closest('[data-learn-open][role="button"]');
    if (link&&(e.key==='Enter'||e.key===' ')) {e.preventDefault();openChapter(link.dataset.learnOpen);}
  });
  document.addEventListener('queyou:view',e=>{
    if (e.detail==='learning') renderLibrary();
    if (e.detail==='course') renderCourse();
    if (e.detail==='reader') renderReader();
  });
  window.addEventListener('scroll',()=>{if(active){clearTimeout(saveTimer);saveTimer=setTimeout(savePosition,200);}}, {passive:true});
  window.addEventListener('pagehide',savePosition);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition();});
  window.MJLearningUI = {
    beforeNavigate(next) {
      savePosition();
      if(next!=='reader') {active=false;cancelAnimationFrame(scrollFrame);}
    },
    back() {
      if($('learningImage').open){$('learningImage').close();return true;}
      if($('view-reader').classList.contains('active')){goCourse(current?.course||selectedCourse);return true;}
      if($('view-course').classList.contains('active')){A.go('learning');return true;}
      return false;
    },
    reset,
    open:openChapter
  };
  renderLibrary();
})();
