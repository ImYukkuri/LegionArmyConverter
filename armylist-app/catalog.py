"""Local catalog resolution. English PDF values stay authoritative for statistics."""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
def load_json(path):return json.loads(path.read_text(encoding='utf8'))
KEYWORDS=load_json(ROOT/'keyword/legion_keyword_dictionary_summary_reviewed.json')
UPGRADES=load_json(ROOT/'upgradecards/upgrades-slim.json')['cards']
COMMANDS=load_json(ROOT/'tacticalcards/tactical-cards.bilingual.json')['cards']
UNIT_NAMES=load_json(ROOT/'mappings/unit-names.zh.json')['units']
ALIASES={'mandalorians_are_stronger_together':'mandalorian_are_stronger_together',
         'we_re_not_regs':'were_not_regs','we_are_not_regs':'were_not_regs','prepared_positions':'prepared_position',
         'anti_material':'anti_materiel','fixed':'fixed_front','hover':'hover_ground'}
def norm(s):return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')
def canonical_rule_id(raw):
    key=re.sub(r'_x$','',norm(raw))
    return ALIASES.get(key,key)
PARAMETER_RULES={'Direct':('direct','unit'),'Entourage':('entourage','unit'),'Retinue':('retinue','unit'),
 'Detachment':('detachment','unit'),'Associate':('associate','unit'),'Teamwork':('teamwork','unit'),
 'Coordinate':('coordinate','unit'),'Aid':('aid','unit'),'Compel':('compel','unit'),
 'Equip':('equip','equipment'),'Mercenary':('mercenary','faction'),'Independent':('independent','token'),
 'Hover':('hover_ground','mode'),'Fixed':('fixed_front','arc'),'Sidearm':('sidearm','mode'),
 'AI':('ai','action'),'Advanced Targeting':('advanced_targeting','unit'),'Eyes on the Prize':('eyes_on_the_prize','keyword')}
def keyword_parameter(raw):
    for prefix,(key,kind)in PARAMETER_RULES.items():
        match=re.match(r'^'+re.escape(prefix)+r'(?:\s*[:：]\s*|\s+)(.+)$',raw.strip(),re.I)
        if match:return {'id':key,'parameter':match[1].strip(),'parameterKind':kind}
    return None
def parameter_label(heading,parameter):return re.split(r'[:：]',heading)[0].strip()+'：'+parameter
DISPLAY_HEADINGS={'one_step_ahead':'领先一步','immune_range_1_weapons':'免疫：射程1武器'}
BY_RULE={k['identifier']:k for k in KEYWORDS}
SUPPLEMENT={k['identifier']:k for path in ('keyword/legion_keyword_dictionary_supplement_zh.json','keyword/tactical_keyword_supplement_zh.json')for k in load_json(ROOT/path)}
DISPLAY={
 'Grand Admiral Thrawn':'索龙元帅','Imperial High Command':'帝国最高统帅部',
 'Moff Gideon':'吉迪恩总督','Long Live the Empire':'帝国万岁',
 'Mandalorian Hunter':'曼达洛猎人','Mandalorian Initiates':'曼达洛学徒',
 'Stormtrooper Riot Squad':'冲锋队防暴小队','Stormtroopers':'冲锋队士兵',
 'Imperial Dark Troopers':'帝国黑暗士兵','LAAT/le Patrol Transport':'LAAT/le巡逻运输艇',
 'Bo-Katan Kryze':'博-卡坦·克里兹','Savior of Mandalore':'曼达洛的救星','Din Djarin':'丁·贾林','The Mandalorian':'曼达洛人',
 'Grogu':'格罗古','counterpart':'搭档','Mandalorian Warriors':'曼达洛战士','Super Commandos':'超级突击队',
 'Clone Captain Rex':'克隆人上尉雷克斯','Honorable Soldier':'荣誉士兵','The Bad Batch':'异等小队','Clone Force 99':'克隆人99号部队',
 'Clone Trooper Infantry':'克隆人步兵','ARC Troopers':'ARC士兵','Advanced Combat Training':'进阶战斗训练','Unarmed':'徒手',
 'Dual Blaster Pistols':'双持爆能手枪','Vibro Knife':'振动匕首',"Din's IB-94 Pistol":'丁的IB-94手枪','Vibro Blades':'振动刀刃',
 'Blaster Rifles':'爆能步枪','Combat Expertise':'战斗专长','Dual DC-17 Hand Blasters':'双持DC-17手持爆能枪',
 'DC-17 Hand Blaster':'DC-17手持爆能枪','DC-15A Blaster Carbine':'DC-15A爆能卡宾枪','DC-17 Hand Blasters':'DC-17手持爆能枪',
 'DC-15 Blaster Rifles':'DC-15爆能步枪','Crosshair':'准星','Wrecker':'破坏者','Echo':'回声','Hunter':'猎人','Tech':'技师',
 'Untitled':'未命名军表','Republic':'共和国','Rebels':'义军','Empire':'帝国','Aim':'瞄准','Dodge':'闪避','Surge':'激增'}
for card in UPGRADES:
    if card.get('zh'):
        DISPLAY.setdefault(card['name'],card['zh']['name'])
        for en,zh in zip(card['weapons'],card['zh']['weapons']):DISPLAY.setdefault(en['name'],zh['name'])

# Publish only unambiguous global labels; unit/weapon context is resolved below.
name_values={}
for unit in UNIT_NAMES:
    for pair in [unit['name'],unit['title'],*unit['weapons']]:
        if pair['en']and pair['zh']:name_values.setdefault(pair['en'],set()).add(pair['zh'])
for en,values in name_values.items():
    if len(values)==1:DISPLAY[en]=next(iter(values))

def unit_labels(name,subtitle='',weapon=None):
    base=unit_basename(name);choices=[u for u in UNIT_NAMES if norm(u['name']['en'])==norm(base)]
    exact=[u for u in choices if norm(u['title']['en'])==norm(subtitle)]
    if exact:choices=exact
    def unique(pairs,fallback):
        values={p['zh']for p in pairs if p['zh']}
        return next(iter(values))if len(values)==1 else display(fallback)
    if weapon is not None:return unique([w for u in choices for w in u['weapons']if norm(w['en'])==norm(weapon)],weapon)
    return {'name':unique([u['name']for u in choices],base)+name[len(base):],
            'subtitle':unique([u['title']for u in exact],subtitle)if exact else display(subtitle)}

def display(s):
    if not s:return ''
    base=re.sub(r'\s*\(#\d+\)$','',s)
    return DISPLAY.get(base,base)+s[len(base):]

def keyword(raw,glossary):
    parameter=keyword_parameter(raw)
    base=re.sub(r'\s+\d+$','',raw).strip()
    direct=re.match(r'^Direct(?:\s|:|$)',raw,re.I)
    if direct:base='Direct'
    parameterized=re.match(r'^(Arm|Detonate)\s+(?:\d+|X)(?:\s*:|$)',raw,re.I)
    if parameterized:base=parameterized[1]
    key=parameter['id']if parameter else canonical_rule_id(base)
    item=BY_RULE.get(key)or SUPPLEMENT.get(key)
    if item:
        title=DISPLAY_HEADINGS.get(key,item['rulebook_heading']).replace('完 成 任 务','完成任务')
        match=re.search(r'\s+(\d+)$',raw)
        if match:title=title.replace('X',match[1])
        if parameter:title=parameter_label(title,parameter['parameter'])
        elif key in ('arm','detonate'):
            count_type=re.match(r'^(?:Arm|Detonate)\s+(\d+|X)(?:\s*:\s*(.+))?$',raw,re.I)
            if count_type:
                title=item['rulebook_heading'].split('：')[0].replace('X',count_type[1])
                if count_type[2]:title+='：'+count_type[2]
        extra=raw[len(base):].strip(' :')
        if not parameter and base in ('Mercenary','Independent','Equip'):
            main=re.split('：|X',title)[0]
            for en,zh in sorted(DISPLAY.items(),key=lambda kv:len(kv[0]),reverse=True):extra=extra.replace(en,zh)
            extra=extra.replace(' and ','及').replace(' or ','或')
            title=main+('：'+extra if extra else '')
        return {'raw':raw,'id':key,'label':title,'summary':item['summary'],'full':item['rulebook_quote'],
                'timing':item['timing'],'source':'reviewed_dictionary'if key in BY_RULE else 'local_supplement',**(parameter or {})}
    if key in SUPPLEMENT:
        entry=SUPPLEMENT[key]
        return {'raw':raw,'id':key,'label':entry['rulebook_heading'],'summary':entry['summary'],'full':entry['rulebook_quote'],
                'timing':entry['timing'],'source':'local_supplement'}
    quote=glossary.get(key,'')
    if not quote and parameter:quote=glossary.get(norm(raw).split('_',1)[0],'')
    return {'raw':raw,'id':key,'label':DISPLAY.get(raw,raw),'summary':quote or '此词条暂缺规则文本。',
            'full':quote or '此词条暂缺规则文本。','timing':[],'source':'pdf_glossary'if quote else 'unresolved'}

def unit_basename(name):return re.sub(r'\s*\(#\d+\)$','',name)
def normalize_card_parameters(card):
    for group in [card,*card.get('weapons',[])]:
        for k in group.get('zh',{}).get('keywords',[]):
            parameter=keyword_parameter(k.get('raw')or k.get('label',''))
            if parameter:
                item=BY_RULE.get(parameter['id'])or SUPPLEMENT.get(parameter['id'])
                if item:k.update(parameter);k['ruleId']=parameter['id'];k['label']=parameter_label(item['rulebook_heading'],parameter['parameter'])
    return card
def upgrade(name,unit,diagnostics):
    candidates=[c for c in UPGRADES if norm(name)in {norm(c['name']),*(norm(n)for n in c['names'])}]
    base=unit_basename(unit['name'])
    if len(candidates)>1:
        exact=[c for c in candidates if any(norm(base)==norm(r)for r in c.get('requiredUnitNames',[]))]
        restricted=exact if len(exact)==1 else [c for c in candidates if any(norm(base)in norm(r)or norm(r)in norm(base)for r in c.get('requiredUnitNames',[]))]
        if len(restricted)==1:candidates=restricted
        else:
            scoped=[c for c in candidates if any(norm(base)in norm(r)for r in c.get('names',[]))]
            if len(scoped)==1:candidates=scoped
    # Legacy exports use shortened names for Bad Batch personnel.
    if not candidates or len(candidates)>1:
        if base=='The Bad Batch':
            personnel={'Echo':'echo-bb','Crosshair':'crosshair','Hunter':'hunter','Tech':'tech','Wrecker':'wrecker'}
            chosen=next((c for c in UPGRADES if c['id']==personnel.get(name)),None)
            if chosen:candidates=[chosen]
    if len(candidates)!=1:
        diagnostics.append({'level':'warning','code':'upgrade_unresolved','unitId':unit['id'],'message':f'升级卡“{name}”未能唯一匹配，保留英文。','candidates':[c['id']for c in candidates]})
        return {'name':name,'zh':{'name':display(name)},'match':'unresolved'}
    card=copy.deepcopy(candidates[0]);card['match']='local_catalog'
    return normalize_card_parameters(card)

def command(card,diagnostics):
    candidates=[c for c in COMMANDS if norm(c['name'])==norm(card['name'])]
    # Match printed pips first; do not silently overwrite PDF pips.
    same=[c for c in candidates if c['pips']==card['pips']]
    if same:candidates=same
    if len(candidates)==1:
        result=copy.deepcopy(card);match=candidates[0]
        result['catalogId']=match['id'];result['zh']=copy.deepcopy(match['zh'])
        result['catalogPips']=match['pips']
        result['catalogDescription']=match['description'];result['weapons']=match['weapons']
        result['catalogSources']=match.get('provenance',[]);result['match']='local_catalog'
        result['keywords']=copy.deepcopy(match.get('keywords',[]))
        result['textPolicy']='Displayed rules use the local catalog; raw PDF card text is retained separately.'
        if card['pips']is not None and card['pips']!=match['pips']:
            diagnostics.append({'level':'warning','code':'command_pips_difference','message':f'{card["name"]} 的 PDF 点数与本地卡库不同；保留 PDF 数值。'})
        return normalize_card_parameters(result)
    diagnostics.append({'level':'warning','code':'command_unresolved','message':f'命令卡“{card["name"]}”尚未唯一匹配，保留 PDF 原文。'})
    return {**card,'zh':{'name':card['name'],'description':card.get('pdfDescription')or card.get('rawText')or ''},'match':'unresolved'}

def collect_review_items(army):
    grouped={}
    def add(item):
        key=json.dumps([item['category'],item['code'],item['title'],item.get('rawText','')],ensure_ascii=False)
        if key not in grouped:grouped[key]=copy.deepcopy(item);return
        for loc in item.get('locations',[]):
            if loc not in grouped[key]['locations']:grouped[key]['locations'].append(loc)
    for item in army.get('reviewItems',[]):add(item)
    def rules(items,loc):
        for k in items or []:
            if k.get('source')not in ('unresolved','pdf_glossary'):continue
            title=k.get('raw')or k.get('label')or k.get('id')
            add({'category':'keyword','code':k['source'],'title':title,
                 'message':'未匹配中文词典，已显示 PDF 英文释义。'if k['source']=='pdf_glossary'else '本地词典与 PDF 词条表均无对应释义，已保留原名。',
                 'rawText':k['full']if k['source']=='pdf_glossary'else title,'locations':[loc]})
    for u in army['units']:
        loc={'page':u['provenance']['page'],'unitId':u['id'],'unitName':u['name'],'context':'单位词条'}
        rules(u['keywords'],loc);rules(u['fromUpgrades'],{**loc,'context':'来自升级卡的词条'})
        for w in u['weapons']:rules(w['keywords'],{**loc,'context':'武器：'+w['name']})
        for c in u['upgrades']:
            if c.get('match')=='unresolved':
                add({'category':'upgrade','code':'upgrade_unresolved','title':c['name'],
                     'message':'未匹配到唯一升级卡；PDF 中的名称、已列出的武器和词条仍保留，不补造卡文。','rawText':c['name'],'locations':[{**loc,'context':'升级卡'}]})
            rules(c.get('zh',{}).get('keywords'),{**loc,'context':'升级卡：'+c['name']})
    for c in army['commandCards']:
        loc={'page':c['provenance']['page'],'context':'战术卡：'+c['name']}
        if c.get('match')=='unresolved':add({'category':'command','code':'command_unresolved','title':c['name'],'message':'未匹配到唯一战术卡，已保留 PDF 原文。','rawText':c.get('pdfDescription')or c.get('rawText')or c['name'],'locations':[loc]})
        rules(c.get('zh',{}).get('keywords')or c.get('keywords'),loc)
    return list(grouped.values())

def enrich(army):
    diagnostics=army['diagnostics']
    glossary=army.get('pdfGlossary',{})
    for unit in army['units']:
        unit['zh']=unit_labels(unit['name'],unit['subtitle'])
        unit['upgrades']=[upgrade(name,unit,diagnostics)for name in unit['upgrades']]
        unit['keywords']=[keyword(k,glossary)for k in unit['keywords']]
        unit['fromUpgrades']=[keyword(k,glossary)for k in unit['fromUpgrades']]
        for w in unit['weapons']:
            w['zh']={'name':unit_labels(unit['name'],unit['subtitle'],w['name'])}
            w['keywords']=[keyword(k,glossary)for k in w['keywords']]
    army['commandCards']=[command(c,diagnostics)for c in army['commandCards']]
    army['catalogVersions']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in
                             [ROOT/'keyword/legion_keyword_dictionary_summary_reviewed.json',ROOT/'keyword/legion_keyword_dictionary_supplement_zh.json',ROOT/'upgradecards/upgrades-slim.json',ROOT/'tacticalcards/tactical-cards.bilingual.json',ROOT/'keyword/tactical_keyword_supplement_zh.json',ROOT/'mappings/unit-names.zh.json']}
    for u in army['units']:
        u['isCounterpart']=u.get('subtitle','').lower()=='counterpart'
        u['countedPoints']=0 if u['isCounterpart']else u['points']
    army['reviewItems']=collect_review_items(army)
    army['totals']={'entries':len(army['units']),'pdfPoints':sum(u['countedPoints']or 0 for u in army['units']),
                   'counterpartPointsExcluded':sum(u['points']or 0 for u in army['units']if u['isCounterpart']),
                   'printedPointsSum':sum(u['provenance'].get('printedPoints',u['points'])or 0 for u in army['units']),
                   'weapons':sum(len(u['weapons'])for u in army['units']),'commands':len(army['commandCards']),
                   'incomplete':any(i['category']=='parsing'for i in army['reviewItems'])}
    return army
