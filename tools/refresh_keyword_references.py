"""Refresh named runtime references from the retained dictionaries only.

Does not read source PDFs, fetch game text, infer numerical values from prose,
or change English card bodies. Run after reviewing a focused dictionary edit.
"""
import json,re,sys,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'armylist-app'))
from catalog import canonical_rule_id,KEYWORDS,SUPPLEMENT
RULES={**SUPPLEMENT,**{k['identifier']:k for k in KEYWORDS}}
TARGETS={'anti_materiel','anti_personnel','area_weapon','arm','assault','direct'}

def refresh(rule,english=None,card=None):
    key=canonical_rule_id(rule.get('ruleId')or rule['id'])
    if key not in TARGETS:return
    entry=RULES[key];value=(english or {}).get('value',(english or {}).get('xValue',rule.get('value')))
    label=entry['rulebook_heading']
    if value is None:
        numeric=re.search(r'(\d+)\s*$',rule.get('label',''))
        if numeric:value=numeric[1]
    if value is not None and re.fullmatch(r'\d+|X',str(value)):label=label.replace('X',str(value))
    if key=='direct':
        effect=(english or {}).get('effectValue',(english or {}).get('effect'))
        if isinstance(effect,str):label='Direct '+effect
        elif card:
            text=' '.join(card.get('description',[]))
            match=re.search(r'\bDirect\s*:\s*(.+?)(?=,|\s+and\s+|\.|$)',text)
            label='Direct '+match[1].strip()if match else 'Direct'
        else:label=rule.get('raw','Direct')if re.match(r'^Direct(?:\s|:|$)',rule.get('raw',''),re.I)else 'Direct'
    rule.update(ruleId=key,label=label,summary=entry['summary'],full=entry['rulebook_quote'],timing=copy.deepcopy(entry['timing']),source='reviewed_dictionary'if key in {e['identifier']for e in KEYWORDS}else 'local_supplement')

def main():
    path=ROOT/'upgradecards/upgrades-slim.json';data=json.loads(path.read_text(encoding='utf8'))
    for c in data['cards']:
        for en,zh in zip(c['keywords'],c['zh']['keywords']):refresh(zh,en,c)
        for en,zh in zip(c['weapons'],c['zh']['weapons']):
            for ek,zk in zip(en['keywords'],zh['keywords']):refresh(zk,ek,c)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    path=ROOT/'tacticalcards/tactical-cards.bilingual.json';data=json.loads(path.read_text(encoding='utf8'))
    for c in data['cards']:
        for k in c.get('keywords',[]):refresh(k)
        c['zh']['keywords']=copy.deepcopy(c.get('keywords',[]))
        for w in c['weapons']:
            for en,zh in zip(w.get('keywords',[]),w.get('zh',{}).get('keywords',[])):refresh(zh,en)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Updated reviewed keyword references; card bodies and quantities unchanged.')

if __name__=='__main__':main()
