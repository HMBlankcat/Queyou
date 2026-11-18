"""Compile the user's complete courses into offline, inert reader content.

Python dependencies: markdown-it-py, mdit-py-plugins, beautifulsoup4, Pillow.
Poppler's pdftoppm renders the unchanged initial PDF. No source scripts execute.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import html
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
from urllib.parse import unquote

from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin
from PIL import Image


def digest(data):
    return hashlib.sha256(data).hexdigest()


def escape(value):
    return html.escape(str(value), quote=True)


def plain(value):
    return BeautifulSoup(value, 'html.parser').get_text(' ', strip=True)


class TexReader:
    """Strict converter for the initial course's finite macro vocabulary.

    Unknown commands/environments abort instead of silently losing content.
    Only typesetting controls are discarded. All tiles, prose and table cells
    become visible HTML; original PDF pages remain a second reading format.
    """
    counts = Counter()
    ignored = {'sffamily', 'small', 'bfseries', 'selectfont', 'large', 'noindent',
               'vfill', 'toprule', 'midrule', 'bottomrule'}
    one_arg = {'thispagestyle', 'color', 'vspace'}

    def __init__(self, source, labels):
        self.s = source
        self.i = 0
        self.labels = labels

    def group(self):
        while self.i < len(self.s) and self.s[self.i].isspace():
            self.i += 1
        if self.i >= len(self.s) or self.s[self.i] != '{':
            raise ValueError('Expected TeX group: ' + self.s[self.i:self.i + 80])
        self.i += 1
        start, depth = self.i, 1
        while self.i < len(self.s):
            char = self.s[self.i]
            if char == '\\':
                self.i += 2
                continue
            if char == '{':
                depth += 1
            if char == '}':
                depth -= 1
                if not depth:
                    result = self.s[start:self.i]
                    self.i += 1
                    return result
            self.i += 1
        raise ValueError('Unclosed TeX group')

    def sub(self, text):
        return TexReader(text, self.labels).render()

    def environment(self, name):
        if name == 'tabularx':
            self.group()  # width
            self.group()  # column layout
        title = self.group() if name in {'note', 'alert', 'example'} else ''
        end = '\\end{' + name + '}'
        end_at = self.s.find(end, self.i)
        if end_at < 0:
            raise ValueError('Unclosed environment: ' + name)
        body = self.s[self.i:end_at]
        self.i = end_at + len(end)
        if name in {'note', 'alert', 'example'}:
            return '<aside class="learn-callout learn-' + name + '"><h3>' + self.sub(title) + '</h3>' + self.sub(body) + '</aside>'
        if name in {'itemize', 'enumerate'}:
            tag = 'ul' if name == 'itemize' else 'ol'
            items = re.split(r'\\item\b', body)
            if items.pop(0).strip():
                raise ValueError('Unexpected text before list')
            return '<' + tag + '>' + ''.join('<li>' + self.sub(x) + '</li>' for x in items) + '</' + tag + '>'
        if name == 'tabularx':
            rows = []
            has_header = '\\toprule' in body
            for index, row in enumerate(re.split(r'\\\\(?:\[[^\]]*\])?', body)):
                row = re.sub(r'\\(?:toprule|midrule|bottomrule)\b', '', row).strip()
                if not row:
                    continue
                cells = re.split(r'(?<!\\)&', row)
                tag = 'th' if has_header and index == 0 else 'td'
                rows.append('<tr>' + ''.join('<' + tag + '>' + self.sub(c) + '</' + tag + '>' for c in cells) + '</tr>')
            return '<div class="learn-table" tabindex="0" aria-label="表格，可左右滑动"><table>' + ''.join(rows) + '</table></div>'
        raise ValueError('Unsupported TeX environment: ' + name)

    def render(self):
        out = []
        while self.i < len(self.s):
            c = self.s[self.i]
            if c == '{':
                out.append(self.sub(self.group()))
                continue
            if c == '}':
                raise ValueError('Unexpected closing brace')
            if c == '\n':
                at = self.i
                while self.i < len(self.s) and self.s[self.i].isspace():
                    self.i += 1
                out.append('<div class="learn-parbreak"></div>' if self.s[at:self.i].count('\n') > 1 else ' ')
                continue
            if c != '\\':
                out.append('&nbsp;' if c == '~' else escape(c))
                self.i += 1
                continue
            self.i += 1
            m = re.match(r'[A-Za-z]+|.', self.s[self.i:])
            if not m:
                raise ValueError('Incomplete TeX command')
            cmd = m.group()
            self.i += len(cmd)
            TexReader.counts[cmd] += 1
            if cmd in self.ignored:
                continue
            if cmd in self.one_arg:
                if self.s[self.i:self.i + 1] == '*':
                    self.i += 1
                self.group()
                continue
            if cmd == 'fontsize':
                self.group()
                self.group()
                continue
            if cmd == 'begin':
                out.append(self.environment(self.group()))
                continue
            if cmd == 'subsection':
                out.append('<h3>' + self.sub(self.group()) + '</h3>')
                continue
            if cmd in {'textbf', 'key', 'notation', 'smalltext', 'text', 'boxed'}:
                wrappers = {'textbf': ('strong', ''), 'key': ('strong', 'learn-key'),
                            'notation': ('code', ''), 'smalltext': ('span', 'learn-muted'),
                            'text': ('span', ''), 'boxed': ('strong', 'learn-boxed')}
                tag, cls = wrappers[cmd]
                out.append('<' + tag + (' class="' + cls + '"' if cls else '') + '>' + self.sub(self.group()) + '</' + tag + '>')
                continue
            if cmd == 'hand':
                out.append('<div class="learn-hand">' + self.sub(self.group()) + '</div>')
                continue
            if cmd in {'mt', 'pt', 'st', 'zt', 'greenzt', 'redzt', 'whitezt'}:
                value = '' if cmd == 'whitezt' else self.group()
                if cmd in {'mt', 'pt', 'st'}:
                    tile = {'mt': 0, 'pt': 9, 'st': 18}[cmd] + int(value) - 1
                    label = value + {'mt': '万', 'pt': '筒', 'st': '索'}[cmd]
                else:
                    glyph = '白' if cmd == 'whitezt' else value
                    tile = {'東': 27, '东': 27, '南': 28, '西': 29, '北': 30, '白': 31, '發': 32, '发': 32, '中': 33}[glyph]
                    label = glyph
                out.append('<span class="learn-tile" role="img" aria-label="' + label + '" data-learning-tile="' + str(tile) + '">' + label + '</span>')
                continue
            if cmd == 'flowbox':
                title, body = self.group(), self.group()
                out.append('<div class="learn-flow"><strong>' + self.sub(title) + '</strong> ' + self.sub(body) + '</div>')
                continue
            if cmd == 'href':
                url, label = self.group(), self.group()
                if not re.match(r'^https?://', url):
                    raise ValueError('Unsupported URL')
                out.append('<a href="' + escape(url) + '" data-learn-external>' + self.sub(label) + '</a>')
                continue
            if cmd == 'pageref':
                label = self.group()
                chapter, page = self.labels[label]
                out.append('<button class="learn-inline-link" data-learn-open="' + chapter + '">' + str(page) + '</button>')
                continue
            if cmd == '[':
                end_at = self.s.index('\\]', self.i)
                out.append('<div class="learn-equation">' + self.sub(self.s[self.i:end_at]) + '</div>')
                self.i = end_at + 2
                continue
            if cmd == '\\':
                if self.s[self.i:self.i + 1] == '[':
                    self.i = self.s.index(']', self.i) + 1
                out.append('<br>')
                continue
            if cmd in {'quad', 'qquad', 'sep', 'gap', ','}:
                out.append('<span class="learn-tile-gap"></span>' if cmd in {'sep', 'gap'} else '\u2009' if cmd == ',' else '\u2003')
                continue
            if cmd == 'par':
                out.append('<div class="learn-parbreak"></div>')
                continue
            if cmd in {'&', '%', '_', '#', '$', '{', '}'}:
                out.append(escape(cmd))
                continue
            raise ValueError('Unsupported TeX command: ' + cmd)
        return ''.join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--beginner', required=True, type=Path)
    ap.add_argument('--advanced', required=True, type=Path)
    ap.add_argument('--supplement', required=True, type=Path, help='Matching StudyMate subject folder, for linked workbooks and sources')
    ap.add_argument('--project', type=Path, default=Path(__file__).resolve().parent.parent)
    args = ap.parse_args()
    root = args.project
    snapshots = root / 'docs/learning-sources'
    snapshots.mkdir(parents=True, exist_ok=True)
    source_audit, questions, image_map, link_map, chapters = [], {}, {}, {}, []
    md = MarkdownIt('commonmark', {'html': False, 'breaks': False}).enable(['table', 'strikethrough'])
    md.use(dollarmath_plugin, renderer=lambda text, options: '<span class="learn-math" data-latex="' + escape(text) + '" data-display="' + ('1' if options.get('display_mode') else '0') + '">' + escape(text) + '</span>')

    def snapshot(path, relative):
        dest = snapshots / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)
        raw = path.read_bytes()
        source_audit.append({'path': relative, 'bytes': len(raw), 'sha256': digest(raw)})

    def finish(chapter):
        soup = BeautifulSoup(chapter['html'], 'html.parser')
        toc = []
        for i, heading in enumerate(soup.find_all(re.compile('^h[1-6]$'))):
            heading['id'] = 'learn-anchor-' + str(i + 1)
            toc.append({'id': heading['id'], 'title': heading.get_text(' ', strip=True), 'level': int(heading.name[1])})
        for table in soup.find_all('table'):
            if not table.parent.get('class') or 'learn-table' not in table.parent.get('class'):
                wrapper = soup.new_tag('div', attrs={'class': 'learn-table', 'tabindex': '0', 'aria-label': '表格，可左右滑动'})
                table.wrap(wrapper)
        for link in soup.find_all('a'):
            url = link.get('href', '')
            if re.match(r'^https?://', url):
                link['data-learn-external'] = ''
                link['rel'] = 'noopener noreferrer'
            elif url.startswith('#'):
                continue
            else:
                base = PurePosixPath(chapter.get('source', ''))
                import posixpath
                target = posixpath.normpath(str(base.parent / unquote(url))).split('#')[0]
                if target not in link_map:
                    raise ValueError('Missing local course target: ' + target + ' in ' + chapter['id'])
                link['data-learn-open'] = link_map[target]
                del link['href']
                link['role'] = 'button'
                link['tabindex'] = '0'
        for image in soup.find_all('img'):
            if not re.fullmatch(r'learn-[a-z0-9.-]+\.png', image.get('src', '')):
                raise ValueError('Unexpected course image: ' + str(image))
        chapter['html'] = str(soup)
        chapter['text'] = plain(chapter['html'])
        chapter['toc'] = toc
        chapters.append(chapter)

    # Preserve the exact supplied originals in the source distribution.
    tex_path = args.beginner / 'main.tex'
    pdf_path = args.beginner / '日本立直麻将新手入门.pdf'
    snapshot(tex_path, 'initial/main.tex')
    snapshot(pdf_path, 'initial/original.pdf')
    tex = tex_path.read_text(encoding='utf-8-sig')
    body = tex.split('\\begin{document}', 1)[1].split('\\end{document}', 1)[0]
    body = re.sub(r'(?<!\\)%[^\n]*', '', body)
    headings = list(re.finditer(r'\\pageintro\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}', body))
    labels = {m[1]: ('initial-' + m[1], i + 2) for i, m in enumerate(headings)}
    chunks = [('initial-cover', '扉页 · 这本指南怎么读', '阅读说明', body[:headings[0].start()])]
    chunks += [('initial-' + m[1], m[3], m[2], body[m.end():headings[i + 1].start() if i + 1 < len(headings) else len(body)]) for i, m in enumerate(headings)]
    for page, (cid, title, number, text) in enumerate(chunks, 1):
        finish({'id': cid, 'course': 'initial', 'group': '正文', 'title': title, 'number': number,
                'source': 'initial/main.tex', 'page': page, 'html': TexReader(text, labels).render()})
    assert len(chunks) == 15

    # pdftoppm leaves the source PDF untouched, preserving all 15 page layouts.
    renderer = shutil.which('pdftoppm')
    if not renderer:
        raise RuntimeError('Poppler pdftoppm is required to preserve original pages')
    subprocess.run([renderer, '-scale-to-x', '1600', '-scale-to-y', '-1', '-png', str(pdf_path), str(root / 'learn-page')], check=True, capture_output=True)
    pages = []
    for chapter in chapters:
        file = root / ('learn-page-' + str(chapter['page']).zfill(2) + '.png')
        assert file.is_file(), file
        w, h = Image.open(file).size
        chapter['original'] = {'src': file.name, 'width': w, 'height': h}
        pages.append(file.name)

    data_path = args.advanced / 'data.js'
    snapshot(data_path, 'advanced/export-data.js')
    raw = data_path.read_text(encoding='utf-8-sig')
    data = json.loads(raw[raw.index('=') + 1:].strip().rstrip(';'))
    subjects = data['library']['subjects']
    assert len(subjects) == 1 and subjects[0]['slug'] == 'mahjong-soul'
    subject = subjects[0]
    nodes = sorted(subject['nodes'], key=lambda n: subject['order'][n['id']])
    for node in nodes:
        source = 'lessons/' + Path(node['lesson']).name
        assert node['lesson_md'] == (args.supplement / source).read_text(encoding='utf-8-sig'), 'Supplement differs from export: ' + source
        link_map[source] = 'advanced-' + node['id']
        snapshot(args.supplement / source, 'advanced/' + source)
        qp = (args.supplement / source).with_suffix('.quiz.json')
        if qp.exists():
            snapshot(qp, 'advanced/lessons/' + qp.name)

    appendices = [('resources', '资料来源与适用范围', subject['resources_md'], 'RESOURCES.md', '资料附录'),
                  ('glossary', '完整术语表', '', 'GLOSSARY.md', '术语表')]
    for folder in ['lab', 'sources']:
        for path in sorted((args.supplement / folder).rglob('*.md')):
            source = path.relative_to(args.supplement).as_posix()
            text = path.read_text(encoding='utf-8-sig')
            title_match = re.search(r'^#\s+(.+)$', text, re.M)
            title = title_match[1] if title_match else path.stem
            if folder == 'lab':
                # Keep similarly named task/answer pages distinguishable in the TOC.
                title = source.removeprefix('lab/').removesuffix('.md').replace('/', ' / ') + ' · ' + title
            group = '参考答案' if '/solutions/' in '/' + source else '练习册' if folder == 'lab' else '资料附录'
            appendices.append(('appendix-' + str(len(appendices)), title, text, source, group))
    for key, title, text, source, group in appendices:
        link_map[source] = 'advanced-' + key
        p = args.supplement / source
        if p.is_file():
            snapshot(p, 'advanced/' + source)

    images = sorted((args.advanced / 'assets/mahjong-soul/assets/img/pool').glob('*.png'))
    for i, path in enumerate(images, 1):
        name = 'learn-diagram-' + str(i).zfill(2) + '.png'
        shutil.copyfile(path, root / name)
        image_map[path.name] = name
        snapshot(path, 'advanced/assets/img/pool/' + path.name)
    assert len(images) == 14

    def figure(path, fields):
        name = image_map[PurePosixPath(path).name]
        meta = dict(line.split(':', 1) for line in fields.splitlines() if ':' in line)
        alt, caption = meta.get('alt', '').strip(), meta.get('caption', '').strip()
        w, h = Image.open(root / name).size
        return '<figure><button class="learn-image-button" data-learn-image="' + name + '" aria-label="放大：' + escape(alt) + '"><img src="' + name + '" alt="' + escape(alt) + '" width="' + str(w) + '" height="' + str(h) + '" loading="lazy"></button><figcaption>' + escape(caption) + ' <span>（点图放大）</span></figcaption></figure>'

    def quiz_html(qid, q):
        objective = 'opts' in q
        answer = (chr(65 + q['ans']) + '. ' + q['opts'][q['ans']]) if objective else q.get('answer', '')
        choice = '<fieldset><legend class="sr-only">选择答案</legend>' + ''.join('<label><input type="radio" name="' + qid + '" value="' + str(i) + '"><span>' + chr(65 + i) + '. ' + md.renderInline(x) + '</span></label>' for i, x in enumerate(q['opts'])) + '</fieldset><button type="button" data-learn-check="' + qid + '">核对答案</button><p class="learn-check-result" role="status"></p>' if objective else '<p class="learn-muted">请先在纸笔上作答，再展开参考答案。</p>'
        return '<section class="learn-question" data-question="' + qid + '"><h4>' + escape(q['kind']) + '</h4>' + md.render(q['q']) + choice + '<details class="learn-solution"><summary>参考答案与判分依据</summary>' + md.render(answer) + (md.render(q['why']) if q.get('why') else '') + '<h5>判分依据</h5>' + md.render(q.get('criteria', '')) + '</details></section>'

    def render_markdown(text, node=None):
        # Front matter is rendered separately as title/goal, never used as instructions.
        if text.startswith('---\n'):
            _, front, text = text.split('---', 2)
            goal = re.search(r'^goal:\s*(.+)$', front, re.M)
            prefix = '<p class="learn-goal">' + escape(goal[1]) + '</p>' if goal else ''
        else:
            prefix = ''
        lines, output, normal, i = text.splitlines(), [prefix], [], 0
        used = set()

        def flush():
            if normal:
                output.append(md.render('\n'.join(normal)))
                normal.clear()

        fenced = False
        while i < len(lines):
            line = lines[i]
            if line.startswith('```'):
                fenced = not fenced
            match = None if fenced else re.fullmatch(r':::\s*(\w+)(?:\s+(.*))?', line)
            if not match:
                if line.strip() == ':::' and not fenced:
                    raise ValueError('Unexpected directive closer')
                normal.append(line)
                i += 1
                continue
            flush()
            kind, title = match[1], match[2] or ''
            i += 1
            inside = []
            while i < len(lines) and lines[i].strip() != ':::':
                inside.append(lines[i])
                i += 1
            if i == len(lines):
                raise ValueError('Unclosed directive: ' + kind)
            i += 1
            content = '\n'.join(inside)
            if kind == 'figure':
                output.append(figure(title, content))
            elif kind == 'quiz':
                assert node is not None
                key = re.split(r'锚点[:：]', title, maxsplit=1)[1].strip()
                if key not in node['pool']:
                    raise ValueError('Missing quiz anchor: ' + key)
                used.add(key)
                visible_title = re.sub(r'锚点[:：]\s*', '· ', title)
                output.append('<aside class="learn-self-check"><h3>课内自测 · ' + escape(visible_title) + '</h3>')
                for index, q in enumerate(node['pool'][key]):
                    qid = 'lq-' + node['number'] + '-' + str(list(node['pool']).index(key) + 1) + '-' + str(index + 1)
                    assert qid not in questions
                    questions[qid] = q
                    output.append(quiz_html(qid, q))
                output.append('</aside>')
            elif kind in {'note', 'practice', 'resources'}:
                label = title or {'note': '提示', 'practice': '跟做练习', 'resources': '本课来源'}[kind]
                output.append('<aside class="learn-callout learn-' + kind + '"><h3>' + md.renderInline(label) + '</h3>' + md.render(content) + '</aside>')
            else:
                raise ValueError('Unsupported directive: ' + kind)
        flush()
        if node and set(node['pool']) != used:
            raise ValueError('Unrendered question pools: ' + str(set(node['pool']) - used))
        return ''.join(output)

    for node in nodes:
        goal = '<details class="learn-original-outline"><summary>本课目标与学习提示（课程原文）</summary>'
        for k, name in [('objective', '目标'), ('problem', '本课问题'), ('concepts', '核心概念'), ('pitfalls', '常见误区'), ('realworld', '用途'), ('practice', '练习安排')]:
            value = node.get(k)
            if value:
                goal += '<h4>' + name + '</h4>' + (md.render('\n'.join('- ' + x for x in value)) if isinstance(value, list) else md.render(value))
        if node.get('resources'):
            goal += '<h4>课程资源索引</h4><ul>' + ''.join('<li><a href="' + escape(r['url']) + '">' + escape(r['title']) + '</a></li>' for r in node['resources']) + '</ul>'
        goal += '</details>'
        content = render_markdown(node['lesson_md'], node) + goal
        if node.get('lab'):
            assert node['lab']['readme'] == (args.supplement / 'lab/README.md').read_text(encoding='utf-8-sig')
        finish({'id': 'advanced-' + node['id'], 'course': 'advanced', 'group': '正文', 'title': node['title'], 'number': node['number'],
                'source': 'lessons/' + Path(node['lesson']).name, 'html': content})
    for key, title, text, source, group in appendices:
        if key == 'glossary':
            content = ''
            for group_data in subject['glossary']:
                # Group names preserved, but the original "待掌握" is not a diagnosis.
                content += '<h3>' + escape(group_data['title']) + '（原稿分组）</h3><dl class="learn-glossary">'
                for term in group_data['terms']:
                    content += '<dt>' + escape(term['term']) + '</dt><dd>' + md.render(term['def'])
                    if term.get('avoid'):
                        content += '<p>注意：' + escape(term['avoid']) + '</p>'
                    content += '</dd>'
                content += '</dl>'
        else:
            content = render_markdown(text)
        finish({'id': 'advanced-' + key, 'course': 'advanced', 'group': group, 'title': title, 'number': '', 'source': source, 'html': content})

    # Bundle only the KaTeX runtime and WOFF2 fonts, with original licenses.
    katex = args.advanced / 'assets/katex'
    shutil.copyfile(katex / 'katex.min.js', root / 'learning-katex.js')
    css = (katex / 'katex.min.css').read_text(encoding='utf-8-sig')
    # Drop alternate formats absent from the export; all Android targets support WOFF2.
    css = re.sub(r',url\([^)]*\.(?:woff|ttf)\) format\([^)]*\)', '', css)
    css = css.replace('url(fonts/', 'url(')
    (root / 'learning-katex.css').write_text(css, encoding='utf-8')
    fonts = []
    for p in (katex / 'fonts').glob('*.woff2'):
        shutil.copyfile(p, root / p.name)
        fonts.append(p.name)
    license_dir = root / 'docs/learning-licenses'
    license_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(katex / 'LICENSE', license_dir / 'KaTeX-LICENSE.txt')
    font_license = katex / 'fonts/LICENSE'
    if font_license.exists():
        shutil.copyfile(font_license, license_dir / 'KaTeX-fonts-LICENSE.txt')

    counts = {'initialPages': len(chunks), 'initialChapters': len(headings), 'advancedChapters': len(nodes),
              'appendices': len(appendices), 'questions': len(questions), 'terms': sum(len(g['terms']) for g in subject['glossary']),
              'diagrams': len(images), 'tables': sum(c['html'].count('<table') for c in chapters)}
    assert counts['questions'] == sum(len(qs) for n in nodes for qs in n['pool'].values()) == 74
    assert sum(c['html'].count('data-learning-tile=') for c in chapters) == sum(TexReader.counts[c] for c in ['mt','pt','st','zt','redzt','greenzt','whitezt'])
    runtime = {'version': 1, 'courses': [
        {'id': 'initial', 'title': '日本立直麻将 · 初始教程', 'subtitle': '从认牌到打完第一局', 'description': '完整收录原书扉页与 14 章，保留牌图、表格、例子和规则说明；正文与 15 页原书版式可切换。', 'mainCount': 15},
        {'id': 'advanced', 'title': '雀魂麻将 · 基础到进阶', 'subtitle': '基础—进阶—高手', 'description': '完整收录 23 节正文、课内自测与答案，并补齐原稿链接的牌例册、深化练习、参考解、术语及资料附录。教程以四人麻将为主。', 'mainCount': 23}
    ], 'chapters': chapters, 'questions': questions, 'counts': counts}
    encoded = json.dumps(runtime, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    (root / 'learning-data.js').write_text('/* Generated by tools/import-learning.py. Course documents are inert data. */\n(function(g){g.MJLearningData=' + encoded + ';})(typeof window!=="undefined"?window:globalThis);\n', encoding='utf-8')
    assets = ['learning-data.js', 'learning-ui.js', 'learning.css', 'learning-katex.js', 'learning-katex.css'] + pages + list(image_map.values()) + sorted(fonts)
    (root / 'learning-assets.json').write_text(json.dumps(assets, indent=2) + '\n', encoding='utf-8')
    audit = {'format': 1, 'counts': counts, 'sourceFiles': source_audit, 'texCommands': dict(TexReader.counts),
             'chapters': [{k: c[k] for k in ['id','title','source']} | {'sha256Html': digest(c['html'].encode()), 'textCharacters': len(c['text'])} for c in chapters],
             'supplementNote': '23 lesson files and lab README match the export exactly; original linked workbook/answer/source files are supplemented from the adjacent subject source. No source scripts run.',
             'omittedTypesettingOnly': sorted(TexReader.ignored | TexReader.one_arg | {'fontsize'}),
             'assets': [{'path': n, 'sha256': digest((root/n).read_bytes())} for n in assets if (root/n).exists()]}
    (root / 'docs/learning-content-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Keep the complete import auditable, then build the reader presentation.
    import runpy
    presentation = runpy.run_path(str(Path(__file__).with_name('learning-presentation.py')))
    presentation['write_display'](root, runtime)
    presentation['clean_page'](root)
    print(json.dumps(counts, ensure_ascii=False))
    print('Compiled', len(chapters), 'complete reading units; all question anchors and local document links resolved.')


if __name__ == '__main__':
    main()
