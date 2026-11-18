const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'learning-data.js'), 'utf8'), context);
const data = JSON.parse(JSON.stringify(context.MJLearningData));
const original = fs.readFileSync(path.join(root, 'docs/learning-sources/advanced/export-data.js'), 'utf8');
const subject = JSON.parse(original.slice(original.indexOf('=') + 1).trim().replace(/;$/, '')).library.subjects[0];
const audit = JSON.parse(fs.readFileSync(path.join(root, 'docs/learning-content-audit.json'), 'utf8'));
const fullImport = JSON.parse(fs.readFileSync(path.join(root, 'docs/learning-original-data.json'), 'utf8'));
const displayAudit = JSON.parse(fs.readFileSync(path.join(root, 'docs/learning-display-audit.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('reader retains every course, workbook, answer, page, diagram and term while source-only archives stay out of the reader', () => {
  assert.deepEqual(data.counts, {initialPages:15,initialChapters:14,advancedChapters:23,appendices:36,questions:74,terms:60,diagrams:14,tables:122});
  assert.equal(data.chapters.length, 74);
  assert.equal(new Set(data.chapters.map(c => c.id)).size, 74);
  for (const chapter of fullImport.chapters.filter(c => c.group !== '资料附录')) {
    assert.ok(data.chapters.some(c => c.id === chapter.id), chapter.id);
  }
  const nodes = subject.nodes.slice().sort((a,b) => subject.order[a.id] - subject.order[b.id]);
  const chapters = data.chapters.filter(c => c.course === 'advanced' && c.group === '正文');
  assert.deepEqual(chapters.map(c => c.title), nodes.map(n => n.title));
  const initial = data.chapters.filter(c => c.course === 'initial');
  assert.deepEqual(initial.map(c => c.page), Array.from({length:15}, (_,i) => i+1));
  initial.forEach(c => assert.ok(fs.statSync(path.join(root,c.original.src)).size > 20000));
  const glossary = data.chapters.find(c => c.id === 'advanced-glossary');
  for (const group of subject.glossary) for (const term of group.terms) {
    assert.ok(glossary.text.includes(term.term),term.term);
    assert.ok(glossary.text.includes(term.def),term.term+' definition');
  }
});

test('all 74 questions, choices, exact reference answers and criteria match the supplied export', () => {
  const expected = {};
  for (const node of subject.nodes) {
    Object.entries(node.pool).forEach(([key, questions],group) => questions.forEach((q,i) => {
      const id = 'lq-'+node.number+'-'+(group+1)+'-'+(i+1);
      expected[id]=q;
      const chapter=data.chapters.find(c => c.id==='advanced-'+node.id);
      assert.ok(chapter.html.includes('data-question="'+id+'"'),id);
    }));
  }
  assert.deepEqual(data.questions,expected);
  assert.equal(Object.keys(expected).length,74);
});

test('unchanged source archives and original import match the original completeness manifest', () => {
  for (const source of audit.sourceFiles) {
    const bytes=fs.readFileSync(path.join(root,'docs/learning-sources',source.path));
    assert.equal(bytes.length,source.bytes,source.path);
    assert.equal(sha(bytes),source.sha256,source.path);
  }
  for (const row of audit.chapters) {
    const c=fullImport.chapters.find(c=>c.id===row.id);
    assert.equal(sha(Buffer.from(c.html)),row.sha256Html,c.id);
    assert.equal(c.text.length,row.textCharacters,c.id);
  }
});

test('reader content matches its separate presentation manifest', () => {
  assert.deepEqual(data.counts, displayAudit.counts);
  assert.equal(data.chapters.length, displayAudit.chapters.length);
  for (const row of displayAudit.chapters) {
    const c=data.chapters.find(c=>c.id===row.id);
    assert.equal(sha(Buffer.from(c.html)),row.sha256Html,c.id);
    assert.equal(c.text.length,row.textCharacters,c.id);
  }
});

test('project names and source notices cannot appear in text, table of contents, search or course descriptions', () => {
  const sources=/Xpilot|github|bilibili|StudyMate|Riichi Book|Daina|平泽|平澤|小林刚|_NYA_|天[鳳凤]|WRC|本课来源|课程资源索引|来源与适用|资料来源|核对来源|来源网页|参考图|作者入口|作者源稿/i;
  for (const c of data.chapters) {
    assert.doesNotMatch(c.title+' '+c.text+' '+JSON.stringify(c.toc), sources, c.id);
    assert.doesNotMatch(c.html, /data-learn-external|class="[^"]*learn-resources|https?:\/\//i, c.id);
  }
  assert.doesNotMatch(JSON.stringify(data.courses), sources);
  for (const id of displayAudit.removedSourceOnlyChapters) assert.ok(!data.chapters.some(c=>c.id===id),id);
  for (const name of ['index.html','guide.js','tutorial.js']) assert.doesNotMatch(fs.readFileSync(path.join(root,name),'utf8'),sources,name);
});

test('all teaching tables, tile examples, equations and quiz anchors retain their full contents', () => {
  for (const original of fullImport.chapters.filter(c=>c.group!=='资料附录')) {
    const c=data.chapters.find(c=>c.id===original.id);
    for (const pattern of [/<table[\s\S]*?<\/table>/g, /<pre[\s\S]*?<\/pre>/g, /data-learning-tile="[^"]+"/g, /data-latex="[^"]+"/g, /data-question="[^"]+"/g]) {
      assert.deepEqual(c.html.match(pattern),original.html.match(pattern),original.id+' '+pattern);
    }
  }
  const payment=data.chapters.find(c=>c.id==='advanced-mj.score');
  assert.ok(payment.text.includes('符来源'));
  assert.ok(data.chapters.some(c=>c.text.includes('振听的不同来源')));
  assert.ok(data.chapters.some(c=>c.text.includes('参考答案')));
});

test('every local document link resolves and no active source markup or remote asset is embedded', () => {
  const ids=new Set(data.chapters.map(c=>c.id));
  let images=new Set(), links=0;
  for (const c of data.chapters) {
    for (const link of c.html.matchAll(/data-learn-open="([^"]+)"/g)) {assert.ok(ids.has(link[1]),c.id+' -> '+link[1]);links++;}
    for (const image of c.html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      assert.match(image[1],/^learn-diagram-\d{2}\.png$/);images.add(image[1]);assert.ok(fs.existsSync(path.join(root,image[1])));
    }
    assert.doesNotMatch(c.html,/<(?:script|iframe|object|embed)\b/i,c.id);
    assert.doesNotMatch(c.html,/\son(?:click|error|load)\s*=/i,c.id);
    assert.doesNotMatch(c.html,/(?:href|src)="(?:javascript|data):/i,c.id);
    assert.ok(c.text.length>20,c.id);
  }
  assert.equal(images.size,14);
  assert.ok(links>=40);
});

test('all offline assets and KaTeX fonts fit the Android flat asset policy', () => {
  const assets=JSON.parse(fs.readFileSync(path.join(root,'learning-assets.json'),'utf8'));
  for(const name of assets) {assert.match(name,/^[a-zA-Z0-9._-]+$/);assert.ok(fs.existsSync(path.join(root,name)),name);}
  const css=fs.readFileSync(path.join(root,'learning-katex.css'),'utf8');
  for(const match of css.matchAll(/url\(([^)]+)\)/g)) {
    assert.ok(assets.includes(match[1]),match[1]);
    assert.match(match[1],/\.woff2$/);
  }
  assert.equal(data.chapters.reduce((n,c)=>n+(c.html.match(/data-learning-tile=/g)||[]).length,0),89);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/data-view="learning"><span>▤<\/span>学习/);
  assert.match(html,/id="view-guide"/);
  assert.ok(fs.existsSync(path.join(root,'docs/learning-licenses/KaTeX-LICENSE.txt')));
});
