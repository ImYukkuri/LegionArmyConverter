"""Legion HQ Stat Reference layout adapter. No network and no fixture-specific rows."""
import hashlib
import io
import json
import re
import pdfplumber
from catalog import enrich,norm

VERSION='legion-hq-stat-reference/v2.1'
def clean(s):return re.sub(r'\s+',' ',s or '').strip()
def bounds(page,min_height):
    return sorted(set(tuple(round(c[k],3)for k in ('x0','top','x1','bottom'))for c in page.curves
                      if c['width']>page.width*.4 and c['height']>min_height),key=lambda b:(b[1],b[0]))
def split_keywords(text):
    result=[]
    for chunk in text.split(','):
        chunk=chunk.strip()
        if not chunk:continue
        if result and result[-1].startswith('Mercenary')and chunk in ('Empire','Rebels','Republic','Separatists'):
            result[-1]+=', '+chunk
        elif result and result[-1].startswith('Equip ')and chunk in ('Hunter','Wrecker','Echo','Tech','Crosshair','Omega'):
            result[-1]+=', '+chunk
        else:result.append(chunk)
    return result

def normalize_group_points(units,diagnostics):
    """This exporter repeats a configuration's combined price on numbered copies.

    Only a complete #1..#N group with identical configuration and printed price
    can be divided. Keep the literal PDF price separately for traceability.
    """
    groups={}
    for unit in units:
        unit['provenance'].setdefault('printedPoints',unit['points'])
        match=re.fullmatch(r'(.+?)\s*\(#(\d+)\)',unit['name'])
        if match:
            groups.setdefault((match[1].strip(),unit['rank']),[]).append((int(match[2]),unit))
    configuration_fields=('subtitle','stats','weapons','keywords','fromUpgrades','upgrades')
    for (name,rank),members in groups.items():
        if all(u.get('pointsInterpretation',{}).get('mode')=='numbered_configuration_group'for _,u in members):
            continue
        numbers=sorted(n for n,_ in members)
        signatures={json.dumps({k:u[k]for k in configuration_fields},sort_keys=True,ensure_ascii=False)for _,u in members}
        prices={u['provenance']['printedPoints']for _,u in members}
        count=len(members)
        complete=count>=2 and numbers==list(range(1,count+1))
        divisible=len(prices)==1 and next(iter(prices))%count==0
        if not complete or len(signatures)!=1 or not divisible:
            diagnostics.append({'level':'warning','code':'numbered_points_unresolved',
                                'unitIds':[u['id']for _,u in members],
                                'message':f'{name} 的编号组不完整、配置/标价不同或费用无法整除；暂保留印刷费用，请核对。'})
            continue
        group_points=next(iter(prices));each=group_points//count
        for number,unit in members:
            unit['points']=each
            unit['pointsInterpretation']={'mode':'numbered_configuration_group','groupName':name,
                                         'groupPoints':group_points,'quantity':count,'copyNumber':number,
                                         'unitPoints':each,'rule':'complete-numbered-identical-configuration/v1'}
        diagnostics.append({'level':'info','code':'group_points_distributed','unitIds':[u['id']for _,u in members],
                            'message':f'{name}（#1–#{count}）的{group_points}分为同配置组合计；已分配为每支{each}分。'})

def unit_panel(page,box,page_no,index):
    panel=page.crop((box[0]+2,box[1]+2,box[2]-2,box[3]-2))
    tables=[t for t in panel.find_tables()if t.extract()[0][0]=='Mini']
    if not tables:return None
    table=tables[0];rows=[[clean(v)for v in row if v is not None]for row in table.extract()]
    split=box[0]+(box[2]-box[0])*.66
    title=clean(page.crop((box[0]+5,box[1]+4,split,table.bbox[1])).extract_text())
    meta=clean(page.crop((split,box[1]+4,box[2]-5,table.bbox[1])).extract_text())
    points=re.search(r'(\d+)\s*pts',meta);rank=re.search(r'COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY',meta)
    if not points or len(rows[1])!=7:raise ValueError(f'第{page_no}页单位标题或7列属性表不完整。')
    name,subtitle=(title.split(' — ',1)if ' — 'in title else (title.removesuffix(' (counterpart)'),'counterpart')if title.endswith(' (counterpart)')else (title,''))
    weapons=[]
    for row in rows[3:]:
        if len(row)!=4:raise ValueError(f'{name} 的武器列数异常。')
        wn,distance,dice,kws=row;origin=re.search(r'\s*\(from (.+)\)$',wn)
        weapons.append({'name':wn[:origin.start()]if origin else wn,'source':origin[1]if origin else None,'range':distance,'dice':dice,'keywords':split_keywords(kws)})
    tail=clean(page.crop((box[0]+5,table.bbox[3]+1,box[2]-5,box[3]-3)).extract_text())
    sections=re.search(r'Keywords:\s*(.*?)(?:From upgrades:\s*(.*?))?(?:Upgrades:\s*(.*))?$',tail)
    if not sections:raise ValueError(f'{name} 缺少 Keywords 字段。')
    vals=[int(v)if v.isdigit()else None if v=='—'else v for v in rows[1]]
    return {'id':f'unit-{index}','name':name,'subtitle':subtitle,'rank':rank[0].title()if rank else None,'points':int(points[1]),
            'stats':dict(zip(('mini','hp','defense','courage','speed','attackSurge','defenseSurge'),vals)),
            'weapons':weapons,'keywords':split_keywords(sections[1]),'fromUpgrades':split_keywords(sections[2]or ''),'upgrades':split_keywords(sections[3]or ''),
            'provenance':{'page':page_no,'bbox':box,'title':title,'meta':meta,'table':rows,'tail':tail}}

def command_panel(page,box,page_no,index):
    panel=page.crop((box[0]+3,box[1]+3,box[2]-3,box[3]-3))
    lines=panel.extract_text_lines()
    if not lines:return None
    first=lines[0]['text'];pip=re.search(r'\((\d+)-pip\)',first)
    description_start=1
    # The exporter wraps the title/pip and the smaller owner column independently.
    bars=[r for r in page.rects if r['x0']>=box[0]and r['x1']<=box[2]
          and r['width']>(box[2]-box[0])*.8 and r['top']>box[1]+2
          and r['bottom']<box[3]and r['height']<(box[3]-box[1])*.35]
    if bars:
        header_bottom=min(r['top']for r in bars)
        header=panel.crop((panel.bbox[0],panel.bbox[1],panel.bbox[2],header_bottom))
        title_size=max((c['size']for c in header.chars),default=0)
        title=clean(header.filter(lambda c:c.get('object_type')=='char'and c.get('size',0)>=title_size*.85).extract_text())
        wrapped_pip=re.search(r'\((\d+)\s*-\s*pip\)',title,re.I)
        if wrapped_pip:
            owner=clean(header.filter(lambda c:c.get('object_type')=='char'and c.get('size',0)<title_size*.85).extract_text())
            first=title+(' '+owner if owner else '');pip=re.search(r'\((\d+)\s*-\s*pip\)',first,re.I)
            description_start=next((i for i,line in enumerate(lines)if line['top']>=header_bottom),len(lines))
    if pip:
        name=first[:pip.start()].strip();owner=first[pip.end():].strip()
    else:name,owner=first,''
    raw='\n'.join(x['text']for x in lines)
    return {'id':f'command-{index}','name':name,'owner':owner,'pips':int(pip[1])if pip else None,
            'rawText':raw,'pdfDescription':'\n'.join(x['text']for x in lines[description_start:]),
            'textQuality':'missing'if '(no card text available)'in raw else 'extracted-unreviewed',
            'provenance':{'page':page_no,'bbox':box}}

def parse_pdf(content,filename):
    if not content.startswith(b'%PDF-'):raise ValueError('请选择有效的 PDF 文件。')
    army={'schema':'legion-army/v2','source':{'pdf':filename,'sha256':hashlib.sha256(content).hexdigest(),'parserMode':VERSION},
          'title':'未命名军表','units':[],'commandCards':[],'pdfGlossary':{},'diagnostics':[]}
    with pdfplumber.open(io.BytesIO(content))as doc:
        if len(doc.pages)>50:raise ValueError('当前仅支持50页以内的军表。')
        army['source']['pageCount']=len(doc.pages)
        for number,page in enumerate(doc.pages,1):
            text=page.extract_text()or ''
            if number==1:army['title']=clean(page.crop((0,0,page.width,30)).extract_text())or army['title']
            if 'COMMAND CARDS'in text:
                for box in bounds(page,30):
                    card=command_panel(page,box,number,len(army['commandCards'])+1)
                    if card:army['commandCards'].append(card)
            elif 'Keyword Glossary'in text:
                for x0,x1 in ((0,page.width/2),(page.width/2,page.width)):
                    col=page.crop((x0,0,x1,page.height));current=None
                    for line in col.extract_text_lines(return_chars=True):
                        chars=line['chars'];prefix=''
                        for c in chars:
                            if 'Bold'not in c['fontname']:break
                            prefix+=c['text']
                        if '.'in prefix and len(prefix)>2:
                            label=line['text'].split('.',1)[0];current=norm(label)
                            army['pdfGlossary'][current]=line['text'].split('.',1)[1].strip()
                        elif current:army['pdfGlossary'][current]+=' '+line['text']
            else:
                for box in bounds(page,100):
                    unit=unit_panel(page,box,number,len(army['units'])+1)
                    if unit:army['units'].append(unit)
        if not army['units']:raise ValueError('未识别到 Legion HQ 属性表。当前不支持扫描军表或其他导出版式。')
    normalize_group_points(army['units'],army['diagnostics'])
    if not army['commandCards']:army['diagnostics'].append({'level':'warning','code':'commands_absent','message':'未识别到文字命令卡面板；军表其他内容仍可使用。'})
    for unit in army['units']:
        if unit['stats']['mini']==0:army['diagnostics'].append({'level':'warning','code':'zero_models','unitId':unit['id'],'message':f'{unit["name"]} 的 PDF 模型数为0；按原值保留，未根据升级重新计算。'})
    return enrich(army)
