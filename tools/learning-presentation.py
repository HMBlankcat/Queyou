"""Prepare the offline reader without project credits or research-source UI.

The supplied documents and the full pre-edit import remain in docs for audit.
Only reading content is shipped; raw external source code and bibliographies
are not reader chapters. Mahjong meanings of 来源 and 参考答案 are retained.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

from bs4 import BeautifulSoup, NavigableString


REMOVED_IDS = {'advanced-appendix-34'} | {'advanced-appendix-' + str(i) for i in range(37, 46)}
SCOPE = {
    'advanced-mj.opening': '处理字牌要比较手牌速度、能保留多久、成对成役的用途，以及将来必须舍出的时机。牌例中的策略均依赖具体条件，不能把舍牌顺序记成固定口诀。',
    'advanced-mj.pairs': '对子路线需要分别核对结构、残枚和鸣牌后果。特定中张对子数量、死对子与鸣牌的判断都应回到当前手牌，不能当作固定概率或决策阈值。',
    'advanced-mj.flush': '染手要比较五块潜力、实际价值、舍牌与鸣牌代价。特定情境下的点数门槛不能作为固定决策线。',
    'advanced-mj.value': '比较同次鸣牌的不同吃法时，应分别列出当前价值、未来加值条件和保留分支的成本。某种序数牌的平均风险不能作为任何局面下的安全定律。',
    'advanced-mj.endgame': '本章讨论明确题设下的基础形听与账目，不提供固定巡目押引阈值。判听、连庄和终局按实际房间规则核对，不能自行假定平台允许人工宣告不听。',
    'advanced-mj.meldreading': '鸣前好形、三副露和吃后舍牌只能作为带有前提的推断，不能写成现物保证。客户端按钮和卡顿也不能作为暗牌证据。',
}
REPLACEMENTS = {
    '本轮推荐资料中，小林刚手顺1—3节的已读文字提醒：比较孤张要看邻近牌是否仍可调用。': '比较孤张要看邻近牌是否仍可调用。',
    '小林刚手顺已读文字强调邻近牌是否可调用；': '邻近牌能否调用取决于当前结构；',
    '本轮已读小林刚手顺文字提出条件化处理字牌：': '处理字牌需要结合具体条件：',
    '本轮已读小林刚手顺文字支持条件化处理字牌。': '处理字牌需要结合具体条件。',
    '本轮已读平泽元气牌谱研究文字强调按宣告时的信息评价。': '评价立直应依据宣告时的信息。',
    '推荐的平泽元气文字中的七成、三成也是说明假设，不是嵌张立直统计。': '举例中的七成、三成属于说明假设，不是嵌张立直统计。',
    '本轮已读的平泽元气牌谱研究文字支持按决策信息评价，并提醒不要仅以一局结果下结论。本课用冻结信息、候选表和四格将这一原则变成记录步骤；未核对的原牌图不作为本例依据。': '复盘应按决策时的信息评价，不要仅以一局结果下结论。本课用冻结信息、候选表和四格将这一原则变成记录步骤。',
    '题目是自主编写的教学材料；未读推荐牌图不作为牌例来源。': '',
    '新题自主编写，依据已读的文字原则与开放作者教材，不还原未读图片里的牌例。': '',
    '推荐资料深化补充': '深化练习',
    '（课程原文）': '',
    '（原稿分组）': '',
}

RESOURCE_HELP = '''<h2>规则范围与学习提示</h2>
<p>教程以四人立直麻将为主。练习中的支付、切上满贯、赤牌、连庄、终局和多家和牌等条件，以题设及实际房间设置为准。</p>
<p>三人麻将的用牌、拔北、自摸支付和不听罚符有不同设置，不能直接套用四人练习的数字。</p>
<p>规则保证、数学计算和策略判断应分别核对。例子中的概率若标为假设，只用于解释计算，不能当成雀魂房间的实测数据；固定巡目或点数也不能替代完整局况。</p>
<p>先读正文，再做课内自测与练习册；对照答案时写清候选动作、等待或进张、逐家收支及适用条件。阅读和练习记录保存在本机。</p>'''

TOPIC_HELP = '''<h2>专题要点与适用边界</h2>
<h3>起手计划：先选路线，再安排字牌</h3>
<p>起手牌不完整时，先给每张牌分配暂时职责：补面子、候补雀头、支持役路线、将来防守。手牌散乱且能长期保留的役牌，与手牌已经接近完成、很快必须舍出的役牌，应比较不同的处理时机。</p>
<p>先列当前块数、选择的役路线、未来要替换的牌，以及摸牌后的计划变化。已接近完成的手可能优先处理将来难舍的牌；散乱手中可长留的役牌仍可能通过成对发挥作用。</p>
<p>这些比较依赖具体手牌、残枚和威胁，不能推出役牌永远越早舍越安全，也不能强制散牌预定某一役。</p>
<h3>对子路线：七对、对对和与普通形并行比较</h3>
<p>比较标准形、七对子与对对和各自的向听、未见枚数、死对子、手役价值，以及鸣牌后失去的七对和门前路线。对子较多时仍需逐条验证；不能因看到三个对子就决定做七对，也不能仅因能碰就决定对对和。</p>
<p>七对子需要七种对子，四枚同牌不能当成两个不同对子。标准形近听或已有多组搭子时，不能只数对子就保证另一条路线更快。</p>
<h3>染手管理：同色五块与外色退路</h3>
<p>先核对目标花色与字牌能否组成五块，再比较染手与普通形的可实现价值。大量同色牌仍可能缺雀头或第五块；原路线已有足够价值时，拆外色两面的速度成本需要单列。</p>
<p>鸣牌次序会保留或关闭役牌、一气通贯、混全带幺等分支。外色退路占用牌位，舍掉后就不能继续把原先的进张当作当下已有资源。</p>
<p>含赤和无赤的价值排序可能不同，具体点数门槛不能当成总准则。隐蔽染手的舍牌顺序仍要服从役保证、实际残枚和对手威胁。</p>
<h3>宝牌增值：保留未来价值的接口</h3>
<p>对同一张牌的不同吃法，分别记录当前已保证价值、需要后续摸牌才成立的条件价值，以及保留分支失去的等待、时间、门前或安全选择。加一翻并不总是线性加点。</p>
<p>宝牌不是役；未来里宝牌、一发和自摸不能提前计为必然收入。平均放铳价值也不能推出某种序数牌永远比另一种安全。</p>
<h3>终盘形听：剩余机会与流局收支</h3>
<p>区分有役和牌、无役形听和弃和的目标。先数剩余可行动次数，再核对保听所需舍牌及风险，逐家计算流局支付和排名变化。</p>
<p>四人不听罚符总额为 3000 点的题设下，应分别推导一、二、三人听牌的收支；两人之间最多 4000 点的点差变化不等于单家收入 4000 点。</p>
<p>基础形听和账目不能替代完整押引判断。判听、连庄和终局按实际房间核对，不能自行假定可以人工宣告不听。</p>
<h3>副露推断：公开结构限制与未知信息</h3>
<p>用公开顺子或刻子筛选可行的役，再区分可能听牌、已保证价值、未定价值和候选等待。役牌、宝牌和赤五提供已知加值，未见牌仍保留其他可能。</p>
<p>三副露、摸切、染手者开始舍本色都只是警戒线索。吃后舍牌的相对安全推断依赖鸣前结构；对手也可能从其他形、无役形或改良过程鸣牌，不能把它升级为现物保证。</p>
<p>全碰不能自动确定对对和；筋主要约束两面等待。客户端卡顿或自动按钮不能作为暗牌证据。</p>'''

TRAINING_HELP = '''<h2>训练方法与复盘要点</h2>
<h3>字牌处理与受入覆盖</h3>
<p>役牌价值取决于速度、预定处理时机、成对成役机会、他家鸣牌后果和当前点况。手牌整齐且终究要舍的牌，与散乱并可能长期保留的牌，应采用不同判断，不能无条件先舍或扣住役牌。</p>
<p>比较孤张时，扣除其他牌已经覆盖的受入。邻近牌若仍可重新拆分，与已固定在公开面子中，作用不同；不能只因两张牌相邻就得出统一舍牌结论。</p>
<p>反玄学不意味着忽略连续存在的点棒、本场、供托与排名状态，规则仍按实际房间核对。</p>
<h3>进攻、防守与攻守判断</h3>
<p>先训练构造快速的合法和牌路线，再比较价值与防守；读牌用于改进风险判断。基础牌效和安全边界应先于复杂牌河推断。</p>
<p>速度价值不能扩展为任何点况都无条件追求最快和牌，末局仍由明确的排名目标约束。</p>
<h3>按当时信息复盘</h3>
<p>先固定决策时的公开信息，再比较可选动作。后来是否放铳、下一张摸牌或全开暗牌后的结果，不能代替当时的依据；同一等待在普通中盘与末局大幅领先时，目标可能不同。</p>
<p>用“决策理由可靠或不可靠 × 当局结果好或坏”四格记录。能从当时信息评估的未见牌范围可以影响选择，事后才看到的牌山排列不能回填为临场知识。</p>
<p>举例中的七成、三成属于说明假设，不是嵌张立直统计或房间放铳率。期望值要写明目标是点数还是排名效用，局部点数均值不能直接等同整场排名最优。</p>'''


def text(value):
    return BeautifulSoup(value, 'html.parser').get_text(' ', strip=True)


def sanitize_chapter(chapter):
    c = deepcopy(chapter)
    special = {
        'advanced-resources': ('规则范围与学习提示', '学习提示', RESOURCE_HELP),
        'advanced-appendix-35': ('专题要点与适用边界', '技术补充', TOPIC_HELP),
        'advanced-appendix-36': ('训练方法与复盘要点', '技术补充', TRAINING_HELP),
    }
    if c['id'] in special:
        c['title'], c['group'], c['html'] = special[c['id']]
    soup = BeautifulSoup(c['html'], 'html.parser')
    for node in soup.select('.learn-resources'):
        node.decompose()
    for heading in list(soup.find_all(re.compile('^h[1-6]$'))):
        title = heading.get_text(' ', strip=True)
        if title == '课程资源索引':
            following = heading.find_next_sibling('ul')
            if following is not None:
                following.decompose()
            heading.decompose()
        elif title == '本课依据与规则范围':
            aside = heading.parent
            aside.clear()
            aside.append(BeautifulSoup('<h3>规则范围</h3><p>平台赤牌、终局、多人和牌及段位结算细项须按实际房间核对。</p>', 'html.parser'))
        elif title == '来源与适用范围':
            following = heading.find_next_sibling('p')
            if following is not None:
                following.clear()
                following.append(SCOPE[c['id']])
            heading.string = '适用范围'
    if c['id'] == 'initial-cheat':
        start = next(n for n in soup.find_all('strong') if n.get_text().startswith('规则核对来源'))
        node = start.next_sibling
        while node is not None and not (getattr(node, 'name', '') == 'aside'):
            following = node.next_sibling
            node.extract()
            node = following
        start.replace_with(BeautifulSoup('<p>本教程点数表不启用切上满贯，番数表不收地方役。立直牌山限制、人和等细项应按实际房间规则核对。</p>', 'html.parser'))
        for h in soup.find_all('h3'):
            if h.get_text() == '规则范围与延伸阅读':
                h.string = '规则范围'
    for node in list(soup.find_all(string=True)):
        value = str(node)
        for before, after in REPLACEMENTS.items():
            value = value.replace(before, after)
        if value != str(node):
            node.replace_with(NavigableString(value))
    for link in list(soup.find_all('a')):
        if link.get('data-learn-open') in REMOVED_IDS or link.has_attr('data-learn-external'):
            link.unwrap()
    toc = []
    for i, heading in enumerate(soup.find_all(re.compile('^h[1-6]$')), 1):
        heading['id'] = 'learn-anchor-' + str(i)
        toc.append({'id': heading['id'], 'title': heading.get_text(' ', strip=True), 'level': int(heading.name[1])})
    c['html'], c['text'], c['toc'] = str(soup), text(str(soup)), toc
    return c


def prepare(data):
    clean = deepcopy(data)
    clean['chapters'] = [sanitize_chapter(c) for c in data['chapters'] if c['id'] not in REMOVED_IDS]
    clean['courses'][0]['description'] = '从认牌到打完第一局，共 14 章，含牌型示意、表格、例子和规则说明；支持正文与 15 页整页版式切换。'
    clean['courses'][1]['description'] = '23 节进阶正文，配合课内自测、牌例册、深化练习、参考答案、术语和技术补充。教程以四人麻将为主。'
    clean['counts']['appendices'] = sum(c['course'] == 'advanced' and c['group'] != '正文' for c in clean['chapters'])
    clean['counts']['tables'] = sum(c['html'].count('<table') for c in clean['chapters'])
    ids = {c['id'] for c in clean['chapters']}
    for c in clean['chapters']:
        for target in re.findall(r'data-learn-open="([^"]+)"', c['html']):
            assert target in ids, (c['id'], target)
    return clean


def write_display(root, original):
    (root / 'docs/learning-original-data.json').write_text(json.dumps(original, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    clean = prepare(original)
    encoded = json.dumps(clean, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    (root / 'learning-data.js').write_text('/* Generated by tools/import-learning.py with learning-presentation.py. */\n(function(g){g.MJLearningData=' + encoded + ';})(typeof window!=="undefined"?window:globalThis);\n', encoding='utf8')
    rows = []
    for c in clean['chapters']:
        rows.append({'id': c['id'], 'sha256Html': hashlib.sha256(c['html'].encode()).hexdigest(), 'textCharacters': len(c['text'])})
    manifest = {'format': 1, 'counts': clean['counts'], 'removedSourceOnlyChapters': sorted(REMOVED_IDS), 'chapters': rows}
    (root / 'docs/learning-display-audit.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    return clean


def clean_page(root):
    """Remove the source panel from the display page; the archived PDF is intact."""
    import pymupdf as fitz
    document = fitz.open(root / 'docs/learning-sources/initial/original.pdf')
    page = document[-1]
    source = page.search_for('规则核对来源')
    boundary = page.search_for('推荐练习顺序')
    assert source and boundary
    first = source[0].y0 - 3
    last = boundary[0].y0 - 5
    # Include the complete source panel, leaving the following exercise box intact.
    page.add_redact_annot(fitz.Rect(40, first, page.rect.width - 40, last), fill=(1, 1, 1))
    for rect in page.search_for('规则范围与延伸阅读'):
        page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()
    page.insert_text((64, 457), '规则范围', fontname='china-s', fontsize=11, color=(0.05, .48, .5))
    note = '本教程点数表不启用切上满贯，番数表不收地方役。\n立直牌山限制、人和等细项，应按实际房间规则核对。'
    page.insert_textbox(fitz.Rect(54, first + 4, page.rect.width - 54, last - 4), note, fontname='china-s', fontsize=9, color=(.12, .26, .28))
    pix = page.get_pixmap(matrix=fitz.Matrix(1600 / page.rect.width, 1600 / page.rect.width), alpha=False)
    pix.save(root / 'learn-page-15.png')


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    saved = root / 'docs/learning-original-data.json'
    if saved.exists():
        original = json.loads(saved.read_text(encoding='utf8'))
    else:
        raw = (root / 'learning-data.js').read_text(encoding='utf8')
        original = json.loads(raw.split('g.MJLearningData=', 1)[1].rsplit(';})(', 1)[0].replace('<\\/', '</'))
    clean = write_display(root, original)
    clean_page(root)
    print(json.dumps({'units': len(clean['chapters']), 'counts': clean['counts']}, ensure_ascii=False))
