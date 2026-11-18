"""Independently check the complete import against the retained source MD.

This uses a separate Markdown token walk, not the importer renderer. It checks
each inline run and complete code block, including the original source appendices.
"""
import html
import json
from pathlib import Path
import re
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin

root = Path(__file__).resolve().parent.parent
# The complete import remains auditable even when source notices and raw-source
# appendices are excluded from the reader. tests/learning.test.js additionally
# checks that reader tables, equations, tiles, questions and answers survive.
data = json.loads((root/'docs/learning-original-data.json').read_text(encoding='utf-8'))
md = MarkdownIt('commonmark', {'html': False}).enable('table').use(dollarmath_plugin)
normalize = lambda s: re.sub(r'\s+', '', s)
checks = 0
for chapter in data['chapters']:
    if chapter['course'] != 'advanced' or chapter['id'] == 'advanced-glossary':
        continue
    path = root/'docs/learning-sources/advanced'/chapter['source']
    text = path.read_text(encoding='utf-8-sig')
    if text.startswith('---\n'):
        text = text.split('---', 2)[2]
    # Only directive labels and image file metadata are not prose paragraphs.
    lines = [line for line in text.splitlines() if not line.startswith(':::') and not re.match(r'^(alt|caption):',line)]
    actual = normalize(chapter['text'])
    for token in md.parse('\n'.join(lines)):
        if token.type in {'fence','code_block','math_block'}:
            expected = token.content
        elif token.type == 'inline':
            expected = ''.join(t.content for t in token.children if t.type in {'text','code_inline','math_inline'})
        else:
            continue
        expected = normalize(expected)
        if expected:
            assert expected in actual, (chapter['id'], expected[:130])
            checks += 1

# Independent literal-run check for the initial TeX, in addition to strict import
# and all original PDF pages. Formatting control arguments contain no prose.
tex = (root/'docs/learning-sources/initial/main.tex').read_text(encoding='utf-8-sig')
body = tex.split('\\begin{document}',1)[1].split('\\end{document}',1)[0]
visible = normalize(''.join(c['title']+c['text'] for c in data['chapters'] if c['course']=='initial'))
for run in re.findall(r'[\u3400-\u9fff][\u3400-\u9fff，。！？；：“”‘’、（）／—→＋\s]{3,}',body):
    expected=normalize(run)
    if expected:
        assert expected in visible, ('initial', expected)
        checks += 1
print('PASS:', checks, 'source prose/code/math runs retained, including complete appendix code blocks.')
