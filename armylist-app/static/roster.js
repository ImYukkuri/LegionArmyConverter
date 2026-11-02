// Presentation only: derive a view from army JSON; never mutate source data.
const $=q=>document.querySelector(q);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timingLabels={global:'全局/组军',setup:'设置',deployment:'部署',command:'命令阶段',activation_start:'激活阶段开始',activation:'激活',activation_end:'激活阶段结束',movement:'移动',attack:'攻击',defense:'防御',end_round:'回合结束',unclassified:'未分类'};
const timingRows=[['global'],['setup','deployment'],['command','activation_start'],['activation','activation_end'],['movement'],['attack'],['defense'],['end_round'],['unclassified']];
const timingRowLabels=['全局/组军','设置/部署','命令/激活阶段','激活','移动','攻击','防御','回合结束','未分类'];
const icon=(id,label)=>'<svg class="legion-icon" role="img" aria-label="'+esc(label||iconLabels[id]||id)+'"><use href="#icon-'+esc(id)+'"></use></svg>';
const iconLabels={action:'行动','free-action':'免费行动',exhaust:'横置',expend:'消耗','free-exhaust':'免费横置',hit:'命中',critical:'暴击',surge:'攻击激增','surge-block':'防御激增',block:'格挡',range:'射程',rangeInfinite:'射程','rank-commander':'指挥官','rank-operative':'特工','rank-corps':'核心','rank-special-forces':'特种','rank-support':'支援','rank-heavy':'重型',heavy:'重型','clan-wren':'雷恩氏族','clan-covert':'守望之子','clan-kryze':'克里兹氏族','clan-saxon':'萨克森氏族','faction-empire':'帝国','faction-rebel':'义军','faction-gar':'共和国','faction-cis':'分离主义','faction-ewoks':'伊沃克','faction-raiders':'掠夺者','slot-force':'原力','slot-heavy':'重武器','slot-training':'训练',courage:'勇气',resilience:'韧性','defense-die-white':'白色防御骰','defense-die-inverted':'红色防御骰'};
function prose(text){return esc(text).replace(/\{@icon\.([\w-]+)\}/g,(_,id)=>(['hit','critical','block','surge','surge-block'].includes(id)||id.startsWith('rank-')?icon(id,iconLabels[id])+'<span class="sr-only">':'<span class="token" data-icon="'+esc(id)+'">')+esc(iconLabels[id]||(/^range-/.test(id)?'距离'+id.slice(6).replace('half','½'):id))+'</span>').replace(/【([^】]+)图标】/g,'<span class="token">$1</span>')}

let army=null,rules=[],filterEnabled=false,selectedTimings=new Set(['attack']),availableTimings=[];
let normalOpenState=new Set();
const stateLabels={command:{unplayed:'未打出',played:'打出',spent:'消耗'},upgrade:{ready:'可用',exhausted:'横置',expended:'消耗',removed:'移除'}};
let playStates={},playStorageKey='',playSignature='',storageAvailable=true;
function cardKey(kind,owner,index,c){return JSON.stringify([kind,owner,index,c.catalogId||c.id||c.name])}
function currentState(kind,key){const state=playStates[key];return Object.hasOwn(stateLabels[kind],state)?state:Object.keys(stateLabels[kind])[0]}
function initCardStates(){
  playStates={};storageAvailable=true;
  playSignature=JSON.stringify([army.source?.sha256,army.units.map(u=>[u.id,u.upgrades.map(c=>c.id||c.name)]),army.commandCards.map(c=>c.catalogId||c.id||c.name)]);
  let hash=2166136261;for(const ch of playSignature)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  playStorageKey='legion-card-states/v1/'+(hash>>>0).toString(16);
  try{const saved=JSON.parse(localStorage.getItem(playStorageKey)||'null');if(saved?.signature===playSignature&&saved.values&&typeof saved.values==='object'&&!Array.isArray(saved.values))playStates=saved.values}catch{storageAvailable=false}
}
function saveCardStates(){
  try{localStorage.setItem(playStorageKey,JSON.stringify({signature:playSignature,values:playStates}));storageAvailable=true}catch{storageAvailable=false}
  syncCardStatus();
}
function syncCardStatus(){
  $('#play-status').textContent=storageAvailable?'状态仅记在此浏览器；不会修改费用、属性或自动移除词条。':'当前浏览器无法保存状态；本页内仍可切换，刷新后可能丢失。';
}
function stateBadge(kind,key){return '<button type="button" class="card-state-badge" data-cycle-card title="点击切换卡牌状态" aria-label="当前状态：'+stateLabels[kind][currentState(kind,key)]+'；点击切换">'+stateLabels[kind][currentState(kind,key)]+'</button>'}
function stateControls(kind,key){return '<div class="card-state-controls" role="group" aria-label="'+(kind==='command'?'战术卡':'升级卡')+'状态">'+Object.entries(stateLabels[kind]).map(([state,label])=>'<button type="button" data-set-state="'+state+'" aria-pressed="'+(state===currentState(kind,key))+'">'+label+'</button>').join('')+'</div>'}
function updateCardState(card,next,persist=true){
  const kind=card.dataset.cardKind,key=card.dataset.cardKey;if(!Object.hasOwn(stateLabels[kind],next))return;
  playStates[key]=next;
  for(const el of document.querySelectorAll('.play-card'))if(el.dataset.cardKey===key){
    el.dataset.playState=next;const badge=el.querySelector('[data-cycle-card]');badge.textContent=stateLabels[kind][next];badge.setAttribute('aria-label','当前状态：'+stateLabels[kind][next]+'；点击切换');
    el.querySelectorAll('[data-set-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.setState===next)));
  }
  if(persist)saveCardStates();
}
function usageBadges(c){
  const text=(c.description||[]).join(' '),labels=[];
  if(c.exhaust||/\{@icon\.(?:free-)?exhaust\}/.test(text))labels.push('含横置规则');
  if(/\{@icon\.expend\}/.test(text))labels.push('含消耗规则');
  if(/\bflip this card\b/i.test(text))labels.push('翻面卡');
  return labels.length?'<div class="usage-badges">'+labels.map(l=>'<span>'+l+'</span>').join('')+'</div>':'';
}
const timings=rule=>rule.timing?.length?rule.timing:['unclassified'];
const matchesTiming=rule=>!filterEnabled||timings(rule).some(t=>selectedTimings.has(t));
const timingBadge=t=>'<span class="timing-badge" data-timing="'+esc(t)+'">'+esc(timingLabels[t]||t)+'</span>';
const ruleKey=k=>{const key=String(k.ruleId||k.id||'').toLowerCase().replace(/[\s-]+/g,'_').replace(/_x$/,'');return key==='anti_material'?'anti_materiel':/^direct(?:_|$)/.test(key)?'direct':key};
const ruleQualifier=k=>k.parameter?String(k.parameter).trim().toLowerCase():(k.label||'').includes('：')?(k.label||'').split('：').slice(1).join('：').trim().toLowerCase():ruleKey(k)==='direct'&&/^Direct(?:\s|:)/i.test(k.label||k.raw||'')?(k.label||k.raw).replace(/^Direct\s*:?\s*/i,'').trim().toLowerCase():'';
function sourceCard(c,index){return {key:(c.id||c.name)+'|'+index,name:c.zh?.name||c.name,englishName:c.name,description:c.zh?.description?.length?c.zh.description:c.description||[]}}
function mergeSources(...lists){return [...new Map(lists.flat().map(s=>[s.key,s])).values()]}
function withSource(k,c,index){return {...k,upgradeSources:mergeSources(k.upgradeSources||[],[sourceCard(c,index)])}}
function mergedUnitRules(u){
  const sourceRefs=[];
  u.upgrades.forEach((c,index)=>{
    const refs=[...(c.zh?.keywords||[]),...(c.zh?.weapons||[]).flatMap(w=>w.keywords||[])];
    for(const k of refs)sourceRefs.push({rule:k,card:sourceCard(c,index)});
  });
  const input=[...u.keywords,...u.fromUpgrades,...u.upgrades.flatMap((c,index)=>(c.zh?.keywords||[]).map(k=>withSource(k,c,index)))];
  const families=new Map();
  for(const k of input){
    const id=ruleKey(k)||k.label||k.raw;
    if(!families.has(id))families.set(id,[]);
    const matching=sourceRefs.filter(s=>ruleKey(s.rule)===ruleKey(k)&&(!ruleQualifier(k)||!ruleQualifier(s.rule)||ruleQualifier(k)===ruleQualifier(s.rule))).map(s=>s.card);
    families.get(id).push({...k,upgradeSources:mergeSources(k.upgradeSources||[],matching)});
  }
  return mergeRuleVariants([...families.values()].flat());
}
function mergeRuleVariants(list){
  const families=new Map();for(const k of list){const id=ruleKey(k)||k.label||k.raw;if(!families.has(id))families.set(id,[]);families.get(id).push(k)}
  const result=[];
  for(const family of families.values()){
    // Keep distinct parameter values/qualifiers; discard only less specific duplicates.
    const specificity=k=>/\d/.test(k.label||'')?2:/X/.test(k.label||'')?1:0;
    const qualifiers=[...new Set(family.map(ruleQualifier).filter(Boolean))];
    const groups=qualifiers.length?qualifiers.map(q=>family.filter(k=>ruleQualifier(k)===q)): [family];
    const selected=groups.flatMap(group=>{const best=Math.max(...group.map(specificity));return group.filter(k=>specificity(k)===best)});
    const unique=new Map();
    for(const k of selected){
      const key=k.label||k.raw||ruleKey(k),previous=unique.get(key);
      unique.set(key,previous?{...previous,upgradeSources:mergeSources(previous.upgradeSources||[],k.upgradeSources||[])}:k);
    }
    result.push(...unique.values());
  }
  return result;
}
function chip(rule){
  const index=rules.push(rule)-1;
  return '<button type="button" data-kw="'+index+'" data-rule-id="'+esc(ruleKey(rule))+'" class="keyword '+(!rule.summary||rule.source==='unresolved'?'missing':'')+'" aria-haspopup="dialog"><span class="keyword-timings">'+timings(rule).map(timingBadge).join('')+'</span><span class="keyword-label"><span class="keyword-name">'+esc(rule.label||rule.raw||rule.id)+'</span>'+((rule.upgradeSources||[]).length?'<span class="keyword-origins">'+rule.upgradeSources.map(c=>'<span>来自 '+esc(c.name)+'</span>').join('')+'</span>':'')+'</span><span class="keyword-summary">'+prose(rule.source==='unresolved'?(rule.raw||rule.label):rule.summary||rule.full||rule.raw||rule.label)+'</span></button>';
}
const chips=list=>'<div class="chips">'+mergeRuleVariants(list).filter(matchesTiming).map(chip).join('')+'</div>';
function sortedRules(list){
  const buckets=timingRows.map(()=>[]);
  for(const k of mergeRuleVariants(list)){
    const active=timings(k).filter(t=>!filterEnabled||selectedTimings.has(t));if(!active.length)continue;
    const row=Math.min(...active.map(t=>{const n=timingRows.findIndex(r=>r.includes(t));return n<0?timingRows.length-1:n}));buckets[row].push(k);
  }
  return '<div class="timing-rule-list">'+buckets.map((ks,i)=>ks.length?'<div class="timing-rule-row" data-timing-group="'+i+'" data-has-origins="'+ks.some(k=>k.upgradeSources?.length)+'"><div class="timing-row-title" title="'+esc(timingRows[i].map(t=>timingLabels[t]).join(' / '))+'"><span class="timing-row-index" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><span class="timing-row-label">'+timingRowLabels[i]+'</span></div>'+chips(ks)+'</div>':'').join('')+'</div>';
}
function dice(d){
  const text=typeof d==='string'?d:Object.entries({R:d?.red,B:d?.black,W:d?.white}).filter(([,n])=>n).map(([c,n])=>n+c).join(' ');
  return '<span class="dice" aria-label="'+esc(text)+'">'+[...text.matchAll(/(\d+)([RBW])/g)].map(m=>'<span class="die '+({R:'red',B:'black',W:'white'}[m[2]])+'" title="'+m[1]+({R:'枚红色骰子',B:'枚黑色骰子',W:'枚白色骰子'}[m[2]])+'"><span class="die-value">'+m[1]+'</span></span>').join('')+'</span>';
}
function rangeInfo(r){
  if(typeof r==='string'){
    const nums=r.match(/\d+/g)||[];
    return {min:nums.length?Number(nums[0]):null,max:nums.length>1?Number(nums[1]):nums.length?Number(nums[0]):null,text:r};
  }
  const min=r?.min??null,max=r?.max??min;
  return {min,max,text:min===null?'—':String(min)+(max!==null&&max!==min?'–'+max:'')};
}
function weapons(ws,zhws=null,owner=null){
  return '<ul class="weapon-list">'+ws.map((w,i)=>{
    const zh=w.zh||zhws?.[i],r=rangeInfo(w.range||{min:w.minRange,max:w.maxRange});
    const kind=r.min===0?(r.max>0?'mixed':'melee'):r.min===null?'unknown':'ranged';
    let card=owner?.card,index=owner?.index;
    if(owner?.unit&&w.source){index=owner.unit.upgrades.findIndex(c=>[c.name,...(c.names||[])].includes(w.source));card=owner.unit.upgrades[index]}
    const list=(zh?.keywords||w.keywords||[]).map(k=>card?withSource(k,card,index):k),filtered=list.filter(matchesTiming);
    return '<li class="weapon" data-range-kind="'+kind+'"><div class="weapon-head"><div class="weapon-name">'+esc(zh?.name||w.name)+'<span class="en-name">'+esc(w.name)+(w.source?' · 来自 '+esc(w.source):'')+'</span></div><span class="range '+kind+'" aria-label="射程 '+esc(r.text)+'"><span class="range-caption">'+({melee:'近战',ranged:'远程',mixed:'近战 / 远程',unknown:'射程'}[kind])+'</span><strong>'+esc(r.text)+'</strong></span>'+dice(w.dice)+'</div>'+(filtered.length?'<div class="weapon-rules">'+chips(filtered)+'</div>':'')+'</li>';
  }).join('')+'</ul>';
}
function upgrade(c,u,index){
  const z=c.zh||{},key=cardKey('upgrade',u.id,index,c),description=z.description?.length?z.description:c.description||[];
  return '<details class="upgrade play-card" open data-card-kind="upgrade" data-card-key="'+esc(key)+'" data-play-state="'+currentState('upgrade',key)+'"><summary><span class="card-title">'+esc(z.name||c.name)+'<small>'+esc(c.cost??'—')+' pts · '+esc(c.name)+'</small></span>'+stateBadge('upgrade',key)+'</summary><div class="upgrade-body">'+stateControls('upgrade',key)+usageBadges(c)+(c.match==='unresolved'?'':(z.requirements?.length?'<div class="card-requirements">'+z.requirements.map(prose).join(' · ')+'</div>':'')+'<div class="card-description">'+(description.length?description.map(p=>'<p>'+prose(p)+'</p>').join(''):'<p class="muted">此升级卡没有额外正文，武器与词条见下方。</p>')+'</div>'+keywordGroup('卡牌关联词条',(z.keywords||[]).map(k=>withSource(k,c,index)))+(c.weapons?.length?'<div class="group-label group">升级武器</div>'+weapons(c.weapons,z.weapons,{card:c,index}):'')+'<details class="raw-text detail-only"><summary>升级卡英文原文</summary><p>'+(c.description||[]).map(prose).join(' ')+'</p></details>')+'</div></details>';
}
function statTable(s){
  const defense=s.defense==='Red'||s.defense==='White'?'<span class="defense-square '+s.defense.toLowerCase()+'" role="img" aria-label="'+(s.defense==='Red'?'红骰':'白骰')+'" title="'+(s.defense==='Red'?'红骰':'白骰')+'"></span>':esc(s.defense??'—');
  const surge=value=>value==='Crit'?icon('critical','暴击'):value==='Hit'?icon('hit','命中'):value==='Block'?icon('block','格挡'):'<span title="无激增转换" aria-label="无">—</span>';
  const labels=['模型','生命值','防御','勇气','速度','攻击激增','防御激增'];
  const vals=[esc(s.mini??'—'),esc(s.hp??'—'),defense,esc(s.courage??'—'),esc(s.speed??'—'),surge(s.attackSurge),surge(s.defenseSurge)];
  return '<div class="stats-table-wrap"><table class="stats-table" aria-label="单位属性"><thead><tr>'+labels.map(l=>'<th scope="col">'+l+'</th>').join('')+'</tr></thead><tbody><tr>'+vals.map(v=>'<td>'+v+'</td>').join('')+'</tr></tbody></table></div>';
}
const isCounterpart=u=>u.isCounterpart===true||u.subtitle?.toLowerCase()==='counterpart';
function unitOverview(u){
  const ranks={Commander:['commander','指挥官'],Operative:['operative','特工'],Corps:['corps','核心'],Special:['special-forces','特种'],Support:['support','支援'],Heavy:['heavy','重型']},rank=ranks[u.rank];
  return '<div class="unit-overview"><div class="unit-name-line"><span class="rank rank-tag">'+(rank?icon('rank-'+rank[0],rank[1])+rank[1]:isCounterpart(u)?'伙伴':'未分类军阶')+'</span><h3>'+esc(u.zh.name)+'</h3><span class="en-name">'+esc(u.name)+'</span>'+(!filterEnabled&&u.subtitle&&!isCounterpart(u)?'<span class="unit-subtitle">'+esc(u.zh.subtitle||u.subtitle)+(u.zh.subtitle!==u.subtitle?' · '+esc(u.subtitle):'')+'</span>':'')+'</div>'+(!filterEnabled&&u.upgrades.length?'<div class="upgrade-brief">'+u.upgrades.map(c=>'<span class="upgrade-tag">'+esc(c.zh?.name||c.name)+'</span>').join('')+'</div>':'')+'</div>';
}
const pointsSource=u=>u.pointsInterpretation?.mode==='numbered_configuration_group'?'同配置组 '+esc(u.pointsInterpretation.groupPoints)+' 分 ÷ '+esc(u.pointsInterpretation.quantity)+' 支 = 每支 '+esc(u.points)+' 分；PDF 原标价保留为 '+esc(u.provenance.printedPoints)+' 分':'费用与属性保留 PDF 记录';
function keywordGroup(title,list){
  const selected=list.filter(matchesTiming);
  return selected.length?'<div class="group"><div class="group-label">'+title+'</div>'+sortedRules(selected)+'</div>':'';
}
function unitHtml(u){
  const list=mergedUnitRules(u);
  const groups=sortedRules(list),noMatch=filterEnabled&&!list.some(matchesTiming)&&!u.weapons.some(w=>w.keywords.some(matchesTiming));
  const points=isCounterpart(u)?'<span class="counterpart-cost" title="PDF标价 '+esc(u.points)+' 分；已计入所属单位，不重复计入总分">伙伴 · 不重复计分</span>':esc(u.points??'—')+' <small>pts</small>';
  return '<details class="unit" id="'+esc(u.id)+'"><summary>'+unitOverview(u)+'<div class="points">'+(!filterEnabled?points:'')+'</div></summary><div class="unit-body">'+(!filterEnabled?statTable(u.stats):'')+groups+(u.weapons.length?'<div class="group unit-weapons" aria-label="武器">'+weapons(u.weapons,null,{unit:u})+'</div>':'')+(noMatch?'<p class="filter-empty">此单位没有匹配当前时机的词条。</p>':'')+(!filterEnabled&&u.upgrades.length?'<div class="group upgrades-section"><div class="group-label">升级卡 · '+u.upgrades.length+' 张</div>'+u.upgrades.map((c,i)=>upgrade(c,u,i)).join('')+'</div>':'')+(!filterEnabled?'<div class="source detail-only">PDF 第 '+esc(u.provenance.page)+' 页 · '+esc(u.id)+' · '+(isCounterpart(u)?'伙伴费用已计入所属单位；此条不计入总分。':pointsSource(u))+'</div>':'')+'</div></details>';
}
function commandDescription(c){
  const translated=c.zh?.description;
  const placeholder=/^暂无(?:固化|本地)中文译文[。，]?\s*(?:请参阅\s*PDF\s*原文[。.]?)?$/;
  return [translated,c.pdfDescription,c.rawText,c.catalogDescription,c.description].find(text=>typeof text==='string'&&text.trim()&&!placeholder.test(text.trim()))||'PDF 未提供此卡的规则正文。';
}
function commandHtml(c,index){
  const z=c.zh||{},pips=c.pips??c.catalogPips,key=cardKey('command','army',index,c);
  return '<details class="command-card play-card" open data-card-kind="command" data-card-key="'+esc(key)+'" data-play-state="'+currentState('command',key)+'"><summary><span class="pips" title="'+(c.pips==null?'卡库点数，PDF未提供':'PDF点数')+'">'+(Number.isInteger(pips)?pips===0?'0': '●'.repeat(Math.min(pips,5)):'?')+'</span><div class="card-title">'+esc(z.name||c.name)+'<span class="en-name">'+esc(c.name)+'</span></div>'+stateBadge('command',key)+'</summary><div class="command-body">'+stateControls('command',key)+'<div class="owner">'+prose(z.owner||c.owner||'通用')+' · 命令：'+prose(z.orders||'未提供')+'</div><p class="card-description">'+prose(commandDescription(c))+'</p>'+keywordGroup('战术卡关联词条',c.zh?.keywords||c.keywords||[])+(c.weapons?.length?'<div class="group-label group">战术卡武器</div>'+weapons(c.weapons):'')+'<details class="raw-text detail-only"><summary>卡库英文原文与 PDF 提取记录</summary><p>'+prose(c.catalogDescription||'无对应卡库原文')+'</p><pre>'+esc(c.rawText)+'</pre></details>'+'<div class="source detail-only">PDF 第 '+esc(c.provenance.page)+' 页 · '+esc(c.catalogId||'未匹配')+'</div></div></details>';
}
function valid(d){if(d?.schema!=='legion-army/v2'||!Array.isArray(d.units)||!d.units.length||d.units.some(u=>!u.zh||!u.stats||!Array.isArray(u.weapons)||!Array.isArray(u.keywords)||!Array.isArray(u.upgrades))||!Array.isArray(d.commandCards))throw new Error('不是有效的 legion-army/v2 军表 JSON。');return d}
function allUnitRules(){return army.units.flatMap(u=>[...u.keywords,...u.fromUpgrades,...u.weapons.flatMap(w=>w.keywords),...u.upgrades.flatMap(c=>[...(c.zh?.keywords||[]),...(c.zh?.weapons||[]).flatMap(w=>w.keywords||[])])])}
function renderTimingOptions(){
  $('#timing-options').innerHTML=availableTimings.map(t=>'<button type="button" class="timing-option" data-select-timing="'+esc(t)+'" aria-pressed="'+selectedTimings.has(t)+'">'+timingBadge(t)+'</button>').join('');
}
function openUnits(){return new Set([...document.querySelectorAll('details.unit[open]')].map(u=>u.id))}
function renderArmy(openState=openUnits()){
  hide();rules=[];
  $('#units').innerHTML=army.units.map(unitHtml).join('');
  document.querySelectorAll('details.unit').forEach(u=>u.open=openState.has(u.id));
  $('#commands').innerHTML=filterEnabled?'':army.commandCards.length?army.commandCards.map(commandHtml).join(''):'<p class="cards-empty">这份军表没有提取到战术卡，请检查PDF是否包含文字命令卡页。</p>';
  $('#filter-status').textContent=filterEnabled?'当前 '+$('#units').querySelectorAll('[data-kw]').length+' 个词条 · 保留全部单位及武器':'';
  syncExpandLabel();syncCardStatus();
}
function syncExpandLabel(){const units=[...document.querySelectorAll('details.unit')];$('#expand-all').textContent=units.length&&units.every(u=>u.open)?'全部收起':'全部展开'}
function load(d){
  army=valid(d);filterEnabled=false;$('#enable-timing-filter').checked=false;$('#timing-filter').hidden=true;document.body.dataset.filter='off';normalOpenState=new Set();
  initCardStates();
  $('#empty').hidden=true;$('#army').hidden=false;$('#viewer-status').textContent='';
  $('#army-title').textContent=army.title.replace(/\s*[—-]\s*Stat Reference$/,'').replace(/^Untitled$/,'未命名军表');
  $('#army-source').textContent=army.source.pdf+' · 本地中文映射';$('#points').textContent=army.units.reduce((sum,u)=>sum+(isCounterpart(u)?0:u.points||0),0);$('#unit-count').textContent=army.units.length+' 个条目（含伙伴，伙伴不重复计分）';
  $('#command-count').textContent=army.commandCards.length+' 张';$('#show-commands').textContent='战术卡 · '+army.commandCards.length;
  availableTimings=[...new Set([...Object.keys(timingLabels),...allUnitRules().flatMap(timings)])];
  renderTimingOptions();renderArmy(new Set());
  measureToolbar();
}
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>{document.body.dataset.view=b.dataset.view;document.querySelectorAll('button[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
$('#expand-explanations').addEventListener('change',e=>{document.body.dataset.explanations=e.target.checked?'expanded':'collapsed';$('#explanations-label').textContent=e.target.checked?'收起词条释义':'展开词条释义';hide();measureToolbar()});
$('#enable-timing-filter').addEventListener('change',e=>{
  if(!army)return;
  if(e.target.checked)normalOpenState=openUnits();
  filterEnabled=e.target.checked;document.body.dataset.filter=filterEnabled?'on':'off';$('#timing-filter').hidden=!filterEnabled;
  renderArmy(filterEnabled?new Set(army.units.map(u=>u.id)):normalOpenState);measureToolbar();
});
$('#timing-options').addEventListener('click',e=>{const b=e.target.closest('[data-select-timing]');if(!b)return;const t=b.dataset.selectTiming;if(selectedTimings.has(t))selectedTimings.delete(t);else selectedTimings.add(t);renderTimingOptions();renderArmy()});
$('#select-all-timings').addEventListener('click',()=>{selectedTimings=new Set(availableTimings);renderTimingOptions();renderArmy()});
$('#clear-timings').addEventListener('click',()=>{selectedTimings.clear();renderTimingOptions();renderArmy()});
$('#expand-all').addEventListener('click',()=>{const list=[...document.querySelectorAll('details.unit')],open=list.some(x=>!x.open);list.forEach(u=>u.open=open);syncExpandLabel()});
$('#show-commands').addEventListener('click',()=>{
  if(!army)return;
  if(filterEnabled){$('#enable-timing-filter').checked=false;$('#enable-timing-filter').dispatchEvent(new Event('change'))}
  requestAnimationFrame(()=>{$('#command-section').scrollIntoView({block:'start'});$('#command-title').focus({preventScroll:true})});
});
$('#reset-card-states').addEventListener('click',()=>{
  if(!army)return;playStates={};document.querySelectorAll('.play-card').forEach(card=>updateCardState(card,Object.keys(stateLabels[card.dataset.cardKind])[0],false));saveCardStates();
});
document.addEventListener('click',e=>{
  const control=e.target.closest('[data-set-state],[data-cycle-card]');if(!control)return;
  const card=control.closest('.play-card');if(!card)return;e.preventDefault();
  const kind=card.dataset.cardKind,states=Object.keys(stateLabels[kind]);
  updateCardState(card,control.dataset.setState||states[(states.indexOf(currentState(kind,card.dataset.cardKey))+1)%states.length]);
});
document.addEventListener('toggle',e=>{if(e.target.matches('details.unit'))syncExpandLabel()},true);
$('#import-json').addEventListener('change',async e=>{try{load(JSON.parse(await e.target.files[0].text()))}catch(err){$('#viewer-status').textContent=err.message}});
$('#save-json').addEventListener('click',()=>{if(!army)return;const url=URL.createObjectURL(new Blob([JSON.stringify(army,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='armylist.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)});

let active=null,anchor=null,pinned=false,mode='summary',timer;
const pop=$('#popover');
function measureToolbar(){document.documentElement.style.setProperty('--roster-toolbar-height',($('.toolbar')?.getBoundingClientRect().height||0)+'px')}
function position(){
  if(pop.hidden||!anchor)return;
  const topLimit=Math.max(12,$('.toolbar').getBoundingClientRect().bottom+12),r=anchor.getBoundingClientRect();
  const below=innerHeight-r.bottom-20,above=r.top-topLimit-8,down=below>260||below>=above;
  pop.style.maxHeight=Math.max(100,Math.min(innerHeight-topLimit-12,down?below:above))+'px';
  const w=pop.offsetWidth,h=pop.offsetHeight;pop.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';pop.style.top=Math.max(topLimit,Math.min(innerHeight-h-12,down?r.bottom+8:r.top-h-8))+'px';
}
function renderRule(){
  if(!active)return;
  $('#pop-title').textContent=active.label||active.raw;$('#pop-en').textContent=active.raw||active.id;
  $('#pop-text').innerHTML=prose(active.source==='unresolved'?(active.raw||active.label):mode==='summary'?(active.summary||active.full||active.raw):(active.full||active.summary||active.raw));
  $('#pop-timing').innerHTML=timings(active).map(timingBadge).join('');
  const sources=active.upgradeSources||[];
  $('#pop-upgrades').hidden=!sources.length;
  $('#pop-upgrades').innerHTML=sources.map(c=>'<article class="pop-upgrade"><h4>来自 '+esc(c.name)+'</h4><span class="en-name">'+esc(c.englishName)+'</span>'+(c.description.length?c.description.map(p=>'<p>'+prose(p)+'</p>').join(''):'<p>此升级卡没有额外正文，效果见卡牌武器及关联词条。</p>')+'</article>').join('');
  $('#pop-source').textContent=active.source==='reviewed_dictionary'?'已审阅中文词典 · 时机为分类，具体条件见规则正文':active.source==='local_supplement'?'本地补充译文 · 根据 PDF 英文词条表':'原始词条 / 本地卡牌引用';position();
}
function show(b,pin=false){clearTimeout(timer);if(pinned&&!pin)return;anchor=b;active=rules[+b.dataset.kw];pinned=pin;pop.hidden=false;renderRule()}
function hide(){clearTimeout(timer);pop.hidden=true;active=null;pinned=false}
function delayedHide(){clearTimeout(timer);if(!pinned)timer=setTimeout(()=>{if(!pinned&&!pop.matches(':hover')&&!anchor?.matches(':hover')&&!pop.contains(document.activeElement)&&document.activeElement!==anchor)hide()},200)}
document.addEventListener('pointerover',e=>{const b=e.target.closest('[data-kw]');if(b&&!b.contains(e.relatedTarget)&&e.pointerType!=='touch'&&!pinned){clearTimeout(timer);timer=setTimeout(()=>show(b),160)}});
document.addEventListener('pointerout',e=>{const b=e.target.closest('[data-kw]');if(b&&!b.contains(e.relatedTarget))delayedHide()});
document.addEventListener('focusin',e=>{const b=e.target.closest('[data-kw]');if(b)show(b)});
document.addEventListener('focusout',e=>{if(e.target.closest('[data-kw],#popover'))delayedHide()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-kw]');if(b)show(b,true);else if(!e.target.closest('#popover,[data-rule]'))hide()});
pop.addEventListener('pointerenter',()=>clearTimeout(timer));pop.addEventListener('pointerleave',delayedHide);
document.querySelectorAll('button[data-rule]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.rule;document.querySelectorAll('button[data-rule]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.rule===mode)));renderRule()}));
$('#pop-close').addEventListener('click',()=>{const previous=anchor;hide();previous?.focus();hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
window.addEventListener('resize',()=>{measureToolbar();position()});window.addEventListener('scroll',()=>{if(!pinned)hide();else position()},{passive:true});
new ResizeObserver(measureToolbar).observe($('.toolbar'));
try{const initial=window.ARMY_DATA||JSON.parse(sessionStorage.getItem('legion-current-army')||'null');if(initial)load(initial)}catch(error){$('#viewer-status').textContent=error.message}
