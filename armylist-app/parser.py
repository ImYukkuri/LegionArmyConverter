"""Legion HQ Stat Reference layout adapter. No network and no fixture-specific rows."""
import hashlib
import io
import json
import re
import pdfplumber
from catalog import enrich,norm

VERSION='legion-hq-stat-reference/v2.3'
def clean(s):return re.sub(r'\s+',' ',s or '').strip()
def glossary_heading(line,heading_fonts):
    label,separator,_=line['text'].partition('.')
    if not separator or not 1<=len(label)<=90 or not label[0].isalpha()or any(not(c.isalnum()or c.isspace()or c in ":’'()/+-–")for c in label):return None
    letters=styled=0
    for char in line['chars']:
        if char['text']=='.':break
        if char['text'].isalpha():
            letters+=1
            if char['fontname']in heading_fonts:styled+=1
    return label.strip()if letters and letters==styled else None

def unit_header(page,box,bottom):
    header=page.crop((box[0]+2,box[1]+2,box[2]-2,bottom))
    size=max((c['size']for c in header.chars),default=0)
    def role(large):return clean(header.filter(lambda c:c.get('object_type')=='char'and(c.get('size',0)>=size*.85)==large).extract_text())
    title,meta=role(True),role(False)
    if re.search(r'\d+\s*pts',meta):return title,meta
    split=box[0]+(box[2]-box[0])*.66
    return clean(page.crop((box[0]+2,box[1]+2,split,bottom)).extract_text()),clean(page.crop((split,box[1]+2,box[2]-2,bottom)).extract_text())
def comma_parts(text):
    parts=[];start=0;depth=0
    for i,c in enumerate(text):
        if c in '([':depth+=1
        elif c in ')]':depth=max(0,depth-1)
        elif c==','and depth==0:parts.append(text[start:i]);start=i+1
    return parts+[text[start:]]
def bounds(page,min_height):
    return sorted(set(tuple(round(c[k],3)for k in ('x0','top','x1','bottom'))for c in page.curves
                      if c['width']>page.width*.4 and c['height']>min_height),key=lambda b:(b[1],b[0]))
def split_keywords(text):
    result=[]
    for chunk in comma_parts(text):
        chunk=chunk.strip()
        if not chunk:continue
        if result and re.match(r'^Mercenary(?:\s|:)',result[-1],re.I)and chunk in ('Empire','Rebels','Republic','Separatists'):
            result[-1]+=', '+chunk
        elif result and result[-1].startswith('Equip ')and chunk in ('Hunter','Wrecker','Echo','Tech','Crosshair','Omega'):
            result[-1]+=', '+chunk
        elif result and re.match(r'^Equip(?:\s|:)',result[-1],re.I)and chunk in ('Armament','Doctrine','Hunter','Wrecker','Echo','Tech','Crosshair','Omega'):
            result[-1]+=', '+chunk
        else:result.append(chunk)
    return result

def parse_unit_sections(tail):
    fields={'keywords':'','fromUpgrades':'','upgrades':''}
    labels={'Keywords:':'keywords','From upgrades:':'fromUpgrades','Upgrades:':'upgrades'}
    matches=list(re.finditer(r'Keywords:|From upgrades:|Upgrades:',tail))
    for i,match in enumerate(matches):
        fields[labels[match[0]]]=tail[match.end():matches[i+1].start()if i+1<len(matches)else len(tail)].strip()
    return {key:split_keywords(value)for key,value in fields.items()}

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
        divisible=len(prices)==1 and isinstance(next(iter(prices)),(int,float))and next(iter(prices))%count==0 and not any(u.get('parseStatus')=='partial'for _,u in members)
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
    title,meta=unit_header(page,box,table.bbox[1])
    points=re.search(r'(\d+)\s*pts',meta);rank=re.search(r'COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY',meta)
    if not points or len(rows[1])!=7:raise ValueError(f'第{page_no}页单位标题或7列属性表不完整。')
    name,subtitle=(title.split(' — ',1)if ' — 'in title else (title.removesuffix(' (counterpart)'),'counterpart')if title.endswith(' (counterpart)')else (title,''))
    weapons=[]
    for row in rows[3:]:
        if len(row)!=4:raise ValueError(f'{name} 的武器列数异常。')
        wn,distance,dice,kws=row;origin=re.search(r'\s*\(from (.+)\)$',wn)
        weapons.append({'name':wn[:origin.start()]if origin else wn,'source':origin[1]if origin else None,'range':distance,'dice':dice,'keywords':split_keywords(kws)})
    tail=clean(page.crop((box[0]+5,table.bbox[3]+1,box[2]-5,box[3]-3)).extract_text())
    sections=parse_unit_sections(tail)
    vals=[int(v)if v.isdigit()else None if v=='—'else v for v in rows[1]]
    return {'id':f'unit-{index}','name':name,'subtitle':subtitle,'rank':rank[0].title()if rank else None,'points':int(points[1]),
            'stats':dict(zip(('mini','hp','defense','courage','speed','attackSurge','defenseSurge'),vals)),
            'weapons':weapons,**sections,
            'provenance':{'page':page_no,'bbox':box,'title':title,'meta':meta,'table':rows,'tail':tail}}

def parse_unit_panel(page,box,page_no,index,review_items):
    panel=page.crop((box[0]+2,box[1]+2,box[2]-2,box[3]-2));raw=panel.extract_text()or ''
    if not re.search(r'\bMini\b|\d+\s*pts',raw):
        if raw.strip():review_items.append({'category':'parsing','code':'panel_unparsed','title':f'第 {page_no} 页面板',
            'message':'面板缺少可识别的单位表头与费用，已保留原文。','rawText':raw,'locations':[{'page':page_no,'context':'未识别面板'}]})
        return None
    try:
        unit=unit_panel(page,box,page_no,index)
        if unit:return unit
        message='未能识别单位属性表。'
    except (ValueError,IndexError,TypeError)as error:message=str(error)
    mini=next((c for c in panel.extract_words()if c['text']=='Mini'),None)
    bottom=mini['top']if mini else min(box[3]-2,box[1]+32)
    title,meta=unit_header(page,box,bottom);title=title or f'未完整解析的单位 {index}'
    name,subtitle=title.split(' — ',1)if ' — 'in title else (title,'')
    points=re.search(r'(\d+)\s*pts',meta);rank=re.search(r'COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY',meta)
    start=re.search(r'Keywords:|From upgrades:|Upgrades:',raw);tail=clean(raw[start.start():])if start else '';uid=f'unit-{index}'
    review_items.append({'category':'parsing','code':'unit_partial','title':name,'message':message,'rawText':raw,
                         'locations':[{'page':page_no,'unitId':uid,'unitName':name,'context':'单位面板'}]})
    return {'id':uid,'name':name,'subtitle':subtitle,'rank':rank[0].title()if rank else None,'points':int(points[1])if points else None,
            'stats':{},'weapons':[],**parse_unit_sections(tail),'parseStatus':'partial',
            'provenance':{'page':page_no,'bbox':box,'title':title,'meta':meta,'tail':tail,'rawText':raw}}

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
          'title':'未命名军表','units':[],'commandCards':[],'pdfGlossary':{},'diagnostics':[],'reviewItems':[]}
    with pdfplumber.open(io.BytesIO(content))as doc:
        if len(doc.pages)>50:raise ValueError('当前仅支持50页以内的军表。')
        army['source']['pageCount']=len(doc.pages)
        previous_glossary=False;heading_fonts=set()
        for number,page in enumerate(doc.pages,1):
            text=page.extract_text()or ''
            columns=[page.crop((x0,0,x1,page.height)).extract_text_lines(return_chars=True)for x0,x1 in ((0,page.width/2),(page.width/2,page.width))]
            glossary_title=next((line for col in columns for line in col if line['text']=='Keyword Glossary'),None)
            if glossary_title:heading_fonts={c['fontname']for c in glossary_title['chars']}
            def heading(line):return glossary_heading(line,heading_fonts)
            is_glossary=bool(glossary_title)or previous_glossary and sum(bool(heading(line))for col in columns for line in col)>=2 and 'Mini'not in text and 'COMMAND CARDS'not in text
            previous_glossary=is_glossary
            if number==1:army['title']=clean(page.crop((0,0,page.width,30)).extract_text())or army['title']
            if 'COMMAND CARDS'in text:
                for box in bounds(page,30):
                    card=command_panel(page,box,number,len(army['commandCards'])+1)
                    if card:army['commandCards'].append(card)
            elif is_glossary:
                for col in columns:
                    current=None
                    for line in col:
                        if heading(line):
                            label=line['text'].split('.',1)[0];current=norm(label)
                            army['pdfGlossary'][current]=line['text'].split('.',1)[1].strip()
                        elif current:army['pdfGlossary'][current]+=' '+line['text']
            else:
                before=len(army['units']);review_before=len(army['reviewItems'])
                for box in bounds(page,100):
                    unit=parse_unit_panel(page,box,number,len(army['units'])+1,army['reviewItems'])
                    if unit:army['units'].append(unit)
                if len(army['units'])==before and len(army['reviewItems'])==review_before:
                    army['reviewItems'].append({'category':'parsing','code':'page_unparsed','title':f'第 {number} 页',
                        'message':'此页未能识别为单位、战术卡或词条表，已保留可提取的文字。','rawText':text or '此页没有可提取的文字，可能为扫描页。','locations':[{'page':number,'context':'整页'}]})
        if not army['units']:raise ValueError('未识别到 Legion HQ 属性表。当前不支持扫描军表或其他导出版式。')
    normalize_group_points(army['units'],army['diagnostics'])
    if army['reviewItems']:army['diagnostics'].append({'level':'warning','code':'partial_import','message':'部分面板无法完整解析，已保留可读单位与原文；请查看待核对内容，费用合计可能不完整。'})
    if not army['commandCards']:army['diagnostics'].append({'level':'warning','code':'commands_absent','message':'未识别到文字命令卡面板；军表其他内容仍可使用。'})
    for unit in army['units']:
        if unit['stats'].get('mini')==0:army['diagnostics'].append({'level':'warning','code':'zero_models','unitId':unit['id'],'message':f'{unit["name"]} 的 PDF 模型数为0；按原值保留，未根据升级重新计算。'})
    return enrich(army)
