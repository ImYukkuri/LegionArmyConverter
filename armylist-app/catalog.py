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
ALIASES={'mandalorians_are_stronger_together':'mandalorian_are_stronger_together',
         'we_re_not_regs':'were_not_regs','we_are_not_regs':'were_not_regs','prepared_positions':'prepared_position',
         'anti_material':'anti_materiel'}
def norm(s):return re.sub(r'[^a-z0-9]+','_',s.lower()).strip('_')
def canonical_rule_id(raw):
    key=re.sub(r'_x$','',norm(raw))
    return ALIASES.get(key,key)
BY_RULE={k['identifier']:k for k in KEYWORDS}
SUPPLEMENT={k['identifier']:k for path in ('keyword/legion_keyword_dictionary_supplement_zh.json','keyword/tactical_keyword_supplement_zh.json')for k in load_json(ROOT/path)}
DISPLAY={
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

def display(s):
    if not s:return ''
    base=re.sub(r'\s*\(#\d+\)$','',s)
    return DISPLAY.get(base,base)+s[len(base):]

def keyword(raw,glossary):
    base=re.sub(r'\s+\d+$','',raw).strip()
    if raw.startswith('Mercenary'):base='Mercenary'
    if raw.startswith('Independent'):base='Independent'
    if raw.startswith('Equip'):base='Equip'
    direct=re.match(r'^Direct(?:\s|:|$)',raw,re.I)
    if direct:base='Direct'
    parameterized=re.match(r'^(Arm|Detonate)\s+(?:\d+|X)(?:\s*:|$)',raw,re.I)
    if parameterized:base=parameterized[1]
    key=canonical_rule_id(base)
    item=BY_RULE.get(key)or SUPPLEMENT.get(key)
    if item:
        title=item['rulebook_heading'].replace('完 成 任 务','完成任务')
        match=re.search(r'\s+(\d+)$',raw)
        if match:title=title.replace('X',match[1])
        if direct:title=raw
        elif key in ('arm','detonate'):
            parameter=re.match(r'^(?:Arm|Detonate)\s+(\d+|X)(?:\s*:\s*(.+))?$',raw,re.I)
            if parameter:
                title=item['rulebook_heading'].split('：')[0].replace('X',parameter[1])
                if parameter[2]:title+='：'+parameter[2]
        extra=raw[len(base):].strip(' :')
        if base in ('Mercenary','Independent','Equip'):
            main=re.split('：|X',title)[0]
            for en,zh in sorted(DISPLAY.items(),key=lambda kv:len(kv[0]),reverse=True):extra=extra.replace(en,zh)
            extra=extra.replace(' and ','及').replace(' or ','或')
            title=main+('：'+extra if extra else '')
        return {'raw':raw,'id':key,'label':title,'summary':item['summary'],'full':item['rulebook_quote'],
                'timing':item['timing'],'source':'reviewed_dictionary'if key in BY_RULE else 'local_supplement'}
    if key in SUPPLEMENT:
        entry=SUPPLEMENT[key]
        return {'raw':raw,'id':key,'label':entry['rulebook_heading'],'summary':entry['summary'],'full':entry['rulebook_quote'],
                'timing':entry['timing'],'source':'local_supplement'}
    quote=glossary.get(key,'')
    return {'raw':raw,'id':key,'label':DISPLAY.get(raw,raw),'summary':'中文词典暂未收录。'+('完整模式保留 PDF 英文原文。'if quote else ''),
            'full':quote or '此词条暂缺规则文本。','timing':[],'source':'pdf_glossary'if quote else 'unresolved'}

def unit_basename(name):return re.sub(r'\s*\(#\d+\)$','',name)
def upgrade(name,unit,diagnostics):
    candidates=[c for c in UPGRADES if norm(name)in {norm(c['name']),*(norm(n)for n in c['names'])}]
    base=unit_basename(unit['name'])
    if len(candidates)>1:
        restricted=[c for c in candidates if any(norm(base)in norm(r)or norm(r)in norm(base)for r in c.get('requiredUnitNames',[]))]
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
    return card

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
        return result
    diagnostics.append({'level':'warning','code':'command_unresolved','message':f'命令卡“{card["name"]}”尚未唯一匹配，保留 PDF 原文。'})
    return {**card,'zh':{'name':card['name'],'description':'暂无固化中文译文，请参阅 PDF 原文。'},'match':'unresolved'}

def enrich(army):
    diagnostics=army['diagnostics']
    glossary=army.get('pdfGlossary',{})
    for unit in army['units']:
        unit['zh']={'name':display(unit['name']),'subtitle':display(unit['subtitle'])}
        unit['upgrades']=[upgrade(name,unit,diagnostics)for name in unit['upgrades']]
        unit['keywords']=[keyword(k,glossary)for k in unit['keywords']]
        unit['fromUpgrades']=[keyword(k,glossary)for k in unit['fromUpgrades']]
        for w in unit['weapons']:
            w['zh']={'name':display(w['name'])}
            w['keywords']=[keyword(k,glossary)for k in w['keywords']]
    army['commandCards']=[command(c,diagnostics)for c in army['commandCards']]
    army['catalogVersions']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in
                             [ROOT/'keyword/legion_keyword_dictionary_summary_reviewed.json',ROOT/'keyword/legion_keyword_dictionary_supplement_zh.json',ROOT/'upgradecards/upgrades-slim.json',ROOT/'tacticalcards/tactical-cards.bilingual.json',ROOT/'keyword/tactical_keyword_supplement_zh.json']}
    for u in army['units']:
        u['isCounterpart']=u.get('subtitle','').lower()=='counterpart'
        u['countedPoints']=0 if u['isCounterpart']else u['points']
    army['totals']={'entries':len(army['units']),'pdfPoints':sum(u['countedPoints']for u in army['units']),
                   'counterpartPointsExcluded':sum(u['points']for u in army['units']if u['isCounterpart']),
                   'printedPointsSum':sum(u['provenance'].get('printedPoints',u['points'])for u in army['units']),
                   'weapons':sum(len(u['weapons'])for u in army['units']),'commands':len(army['commandCards'])}
    return army
