// Browser layout adapter. The existing Python engine and HTML template are independent.
import {getDocument,GlobalWorkerOptions,OPS,Util} from './vendor/pdfjs/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const clone=x=>structuredClone(x);
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
let catalogPromise;
export function getCatalog(){return catalogPromise??=fetch(new URL('./catalog.json',import.meta.url)).then(async r=>{if(!r.ok)throw new Error('中文映射加载失败，请检查完整部署目录。');return r.json()}).catch(e=>{catalogPromise=null;throw e})}
export function splitKeywords(text){
  const result=[],parts=[];let start=0,depth=0;for(let i=0;i<text.length;i++){const c=text[i];if('(['.includes(c))depth++;else if(')]'.includes(c))depth=Math.max(0,depth-1);else if(c===','&&depth===0){parts.push(text.slice(start,i));start=i+1}}parts.push(text.slice(start));
  for(const part of parts){
    const c=part.trim();if(!c)continue;const previous=result.at(-1)||'';
    if(/^Mercenary(?:\s|:)/i.test(previous)&&['Empire','Rebels','Republic','Separatists'].includes(c)||/^Equip(?:\s|:)/i.test(previous)&&['Armament','Doctrine','Hunter','Wrecker','Echo','Tech','Crosshair','Omega'].includes(c))result[result.length-1]+=', '+c;
    else result.push(c);
  }return result;
}
export const PARAMETER_RULES={'Direct':['direct','unit'],'Entourage':['entourage','unit'],'Retinue':['retinue','unit'],
  'Detachment':['detachment','unit'],'Associate':['associate','unit'],'Teamwork':['teamwork','unit'],
  'Coordinate':['coordinate','unit'],'Aid':['aid','unit'],'Compel':['compel','unit'],'Pulling The Strings':['pulling_the_strings','unit'],
  'Equip':['equip','equipment'],'Mercenary':['mercenary','faction'],'Independent':['independent','token'],
  'Hover':['hover_ground','mode'],'Fixed':['fixed_front','arc'],'Sidearm':['sidearm','mode'],
  'AI':['ai','action'],'Advanced Targeting':['advanced_targeting','unit'],'Eyes on the Prize':['eyes_on_the_prize','keyword']};
export function keywordParameter(raw){
  for(const [prefix,[id,parameterKind]]of Object.entries(PARAMETER_RULES)){
    const match=raw.trim().match(new RegExp('^'+prefix+'(?:\\s*[:：]\\s*|\\s+)(.+)$','i'));
    if(match)return {id,parameter:match[1].trim(),parameterKind};
  }return null;
}
const parameterLabel=(heading,value)=>heading.split(/[:：]/)[0].trim()+'：'+value;
const DISPLAY_HEADINGS={one_step_ahead:'领先一步',immune_range_1_weapons:'免疫：射程1武器'};
function normalizeCardParameters(card,catalog){
  const byRule=Object.fromEntries(catalog.keywords.map(k=>[k.identifier,k]));
  for(const group of [card,...(card.weapons||[])])for(const k of group.zh?.keywords||[]){const parameter=keywordParameter(k.raw||k.label||'');if(parameter){const item=byRule[parameter.id]||catalog.supplement[parameter.id];if(item)Object.assign(k,parameter,{ruleId:parameter.id,label:parameterLabel(item.rulebook_heading,parameter.parameter)})}}
  return card;
}
function lines(items){
  const rows=[];
  for(const t of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){
    let row=rows.find(r=>Math.abs(r.y-t.y)<2);if(!row){row={y:t.y,items:[]};rows.push(row)}row.items.push(t);
  }
  return rows.map(r=>{
    const ordered=r.items.sort((a,b)=>a.x-b.x);let text='',last=null;
    for(const t of ordered){text+=(last&&t.x-last.x-last.width>1?' ':'')+t.text;last=t}
    return {...r,items:ordered,text:clean(text)};
  });
}
const inside=(t,b)=>t.x+t.width/2>b[0]-.5&&t.x+t.width/2<b[2]+.5&&t.y>b[1]&&t.y<b[3]+.5;
const textIn=(items,b)=>lines(items.filter(t=>inside(t,b))).map(r=>r.text).join(' ');
const rowItem=row=>({text:row.text,x:Math.min(...row.items.map(t=>t.x)),y:row.y,
  width:Math.max(...row.items.map(t=>t.x+t.width))-Math.min(...row.items.map(t=>t.x)),
  height:Math.max(...row.items.map(t=>t.height)),font:row.items[0].font});
function uniqueBoxes(boxes){return [...new Map(boxes.map(b=>[b.map(v=>Math.round(v*100)/100).join(','),b])).values()]}
async function pageGeometry(page){
  const viewport=page.getViewport({scale:1}),content=await page.getTextContent(),operators=await page.getOperatorList();
  const items=content.items.filter(t=>t.str?.trim()).map(t=>{
    const m=Util.transform(viewport.transform,t.transform);return {text:t.str,x:m[4],y:m[5],width:t.width,height:t.height,font:t.fontName};
  });
  let matrix=[1,0,0,1,0,0];const stack=[],rects=[],panels=[],edges=[];
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],a=operators.argsArray[i];
    if(op===OPS.save)stack.push([...matrix]);
    else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];
    else if(op===OPS.transform)matrix=Util.transform(matrix,a);
    else if(op===OPS.constructPath&&a[2]){
      const b=Array.from(a[2]),m=Util.transform(viewport.transform,matrix);
      const corners=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(p=>{Util.applyTransform(p,m);return p});
      const box=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
      if(box[2]-box[0]>5&&box[3]-box[1]>7)rects.push(box);
      if(box[2]-box[0]>5&&box[3]-box[1]<2)edges.push(box);
      if(a[1]?.some(path=>path.length>40)&&box[2]-box[0]>viewport.width*.4&&box[3]-box[1]>30)panels.push(box);
    }
  }
  return {items,rects:uniqueBoxes(rects),edges:uniqueBoxes(edges),panels:uniqueBoxes(panels).sort((a,b)=>Math.round(a[1]-b[1])||a[0]-b[0]),width:viewport.width,height:viewport.height};
}
function cellFor(t,rects){
  return rects.filter(b=>inside(t,b)).sort((a,b)=>(a[2]-a[0])*(a[3]-a[1])-(b[2]-b[0])*(b[3]-b[1]))[0];
}
function tableTextItems(items,rects){
  // TextItem boundaries are PDF font/encoding boundaries, not word boundaries.
  // Reconstruct within the smallest cell only; never merge neighbouring columns.
  const cells=new Map(),unplaced=[];
  for(const item of items){const cell=cellFor(item,rects);if(!cell){unplaced.push(item);continue}const key=cell.join(',');if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item)}
  return [...unplaced,...[...cells.values()].flatMap(group=>lines(group).map(rowItem))];
}
function unitHeader(items,box,bottom){
  const header=items.filter(t=>t.y<bottom),size=Math.max(0,...header.map(t=>t.height));
  const large=header.filter(t=>t.height>=size*.85),small=header.filter(t=>t.height<size*.85);
  const meta=lines(small).map(r=>r.text).join(' ');
  if(/\d+\s*pts/.test(meta))return {title:lines(large).map(r=>r.text).join(' '),meta};
  const split=box[0]+(box[2]-box[0])*.66;
  return {title:textIn(header,[box[0],box[1],split,bottom]),meta:textIn(header,[split,box[1],box[2],bottom])};
}
export function glossaryHeading(row,headingFonts){
  const at=row.text.indexOf('.'),label=row.text.slice(0,at).trim();
  if(at<1||at>90||!/^\p{L}[\p{L}\p{N}\s:’'()/+\-–]*$/u.test(label))return null;
  let letters=0,styled=0;
  // Numerals/punctuation may use separate font subsets; compare letters only.
  for(const item of row.items){const prefix=item.text.split('.',1)[0],count=(prefix.match(/\p{L}/gu)||[]).length;letters+=count;if(headingFonts.has(item.font))styled+=count;if(item.text.includes('.'))break}
  return letters&&styled===letters?label:null;
}
export function parseUnitSections(tail){
  const fields={keywords:'',fromUpgrades:'',upgrades:''},labels={'Keywords:':'keywords','From upgrades:':'fromUpgrades','Upgrades:':'upgrades'};
  const matches=[...tail.matchAll(/Keywords:|From upgrades:|Upgrades:/g)];
  for(let i=0;i<matches.length;i++)fields[labels[matches[i][0]]]=tail.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??tail.length).trim();
  return {keywords:splitKeywords(fields.keywords),fromUpgrades:splitKeywords(fields.fromUpgrades),upgrades:splitKeywords(fields.upgrades)};
}
function unitPanel(geo,box,page,index){
  const items=geo.items.filter(t=>inside(t,box)),tableItems=tableTextItems(items,geo.rects),mini=tableItems.find(t=>t.text==='Mini');if(!mini)return null;
  const statHeads=['Mini','HP','Def','Cor','Spd','Hit Surge','Def Surge'].map(name=>tableItems.find(t=>t.text===name&&Math.abs(t.y-mini.y)<2));
  if(statHeads.some(t=>!t))throw new Error(`第${page}页的7列属性表不完整。`);
  const headerCell=cellFor(mini,geo.rects);if(!headerCell)throw new Error('未能定位属性表单元格。');
  const {title,meta}=unitHeader(items,box,headerCell[1]);
  const points=meta.match(/(\d+)\s*pts/),rank=meta.match(/COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY/);
  if(!points)throw new Error(`第${page}页单位费用缺失。`);
  let [name,subtitle='']=title.split(' — ');if(title.endsWith(' (counterpart)')){name=title.slice(0,-14);subtitle='counterpart'}
  const wh=tableItems.find(t=>t.text==='Weapon'&&t.y>mini.y),kh=lines(items.filter(t=>t.y>(wh?.y||mini.y))).filter(r=>/^(Keywords:|From upgrades:|Upgrades:)/.test(r.text)).map(rowItem)[0];
  const tailTop=kh?kh.y-kh.height:box[3];
  const rows=[statHeads.map(t=>t.text)];
  const values=statHeads.map(t=>{
    const b=cellFor(t,geo.rects);
    if(!b)throw new Error(`${name} 的属性单元格缺失。`);return textIn(items,[b[0],b[3],b[2],wh?wh.y-wh.height:tailTop]);
  });rows.push(values);
  const weapons=[];
  if(wh){
  const weaponHeads=['Weapon','Range','Dice','Keywords'].map(n=>tableItems.find(t=>t.text===n&&Math.abs(t.y-wh.y)<2));
  if(weaponHeads.some(t=>!t))throw new Error(`${name} 的武器4列表头不完整。`);
  const columns=weaponHeads.map(t=>cellFor(t,geo.rects));if(columns.some(b=>!b))throw new Error('未能定位武器列。');
  rows.push(weaponHeads.map(t=>t.text));
  const first=columns[0];
  const boundaries=[];
  for(const b of geo.edges.filter(b=>Math.abs(b[0]-first[0])<1.6&&Math.abs(b[2]-first[2])<1.6&&b[1]>=first[3]-1.6&&b[3]<(kh?kh.y-kh.height/2:box[3])).sort((a,b)=>a[1]-b[1])){
    const y=(b[1]+b[3])/2;if(!boundaries.length||y-boundaries.at(-1)>1.6)boundaries.push(y);
  }
  const weaponRows=boundaries.slice(0,-1).map((y,i)=>[first[0],y,first[2],boundaries[i+1]]);
  weapons.push(...weaponRows.map(row=>{
    const cells=columns.map(b=>textIn(items,[b[0],row[1],b[2],row[3]]));rows.push(cells);
    const [wn,range,dice,kws]=cells,origin=wn.match(/\s*\(from (.+)\)$/);
    if(!wn||!/^\d/.test(range)||!dice)throw new Error(`${name} 的武器行不完整。`);
    return {name:origin?wn.slice(0,origin.index):wn,source:origin?.[1]||null,range,dice,keywords:splitKeywords(kws)};
  }));
  if(!weapons.length)throw new Error(`${name} 没有识别到武器行。`);
  }
  const tail=textIn(items,[box[0]+4,tailTop,box[2]-4,box[3]]),sections=parseUnitSections(tail);
  return {id:`unit-${index}`,name,subtitle,rank:rank?rank[0][0]+rank[0].slice(1).toLowerCase():null,points:Number(points[1]),
    stats:Object.fromEntries(['mini','hp','defense','courage','speed','attackSurge','defenseSurge'].map((k,i)=>[k,/^\d+$/.test(values[i])?Number(values[i]):values[i]==='—'?null:values[i]])),
    weapons,...sections,
    provenance:{page,bbox:box,title,meta,table:rows,tail}};
}
export function parseUnitPanel(geo,box,page,index,reviewItems=[]){
  const items=geo.items.filter(t=>inside(t,box));
  if(!items.some(t=>t.text==='Mini')&&!/\d+\s*pts/.test(lines(items).map(r=>r.text).join(' '))){
    if(items.length)reviewItems.push({category:'parsing',code:'panel_unparsed',title:`第 ${page} 页面板`,message:'面板缺少可识别的单位表头与费用，已保留原文。',rawText:lines(items).map(r=>r.text).join('\n'),locations:[{page,context:'未识别面板'}]});return null;
  }
  try{return unitPanel(geo,box,page,index)||recoverUnit('未能识别单位属性表。')}
  catch(error){return recoverUnit(error.message)}
  function recoverUnit(message){
    const mini=tableTextItems(items,geo.rects).find(t=>t.text==='Mini'),header=unitHeader(items,box,mini?mini.y-mini.height:box[1]+32);
    const title=header.title||`未完整解析的单位 ${index}`,meta=header.meta,points=meta.match(/(\d+)\s*pts/),rank=meta.match(/COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY/);
    const [name,subtitle='']=title.split(' — '),rawText=lines(items).map(r=>r.text).join('\n'),id=`unit-${index}`,start=rawText.search(/Keywords:|From upgrades:|Upgrades:/),tail=start<0?'':clean(rawText.slice(start));
    reviewItems.push({category:'parsing',code:'unit_partial',title:name,message,rawText,locations:[{page,unitId:id,unitName:name,context:'单位面板'}]});
    return {id,name,subtitle,rank:rank?rank[0][0]+rank[0].slice(1).toLowerCase():null,points:points?Number(points[1]):null,stats:{},weapons:[],...parseUnitSections(tail),parseStatus:'partial',provenance:{page,bbox:box,title,meta,tail,rawText}};
  }
}
export function normalizeGroupPoints(units,diagnostics){
  const groups=new Map();
  for(const u of units){u.provenance.printedPoints??=u.points;const m=u.name.match(/^(.+?)\s*\(#(\d+)\)$/);if(m){const key=m[1].trim()+'|'+u.rank;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([Number(m[2]),u,m[1].trim()])}}
  for(const members of groups.values()){
    if(members.every(([,u])=>u.pointsInterpretation?.mode==='numbered_configuration_group'))continue;
    const count=members.length,numbers=members.map(([n])=>n).sort((a,b)=>a-b),prices=new Set(members.map(([,u])=>u.provenance.printedPoints));
    const signatures=new Set(members.map(([,u])=>JSON.stringify(['subtitle','stats','weapons','keywords','fromUpgrades','upgrades'].map(k=>u[k]))));
    const groupPoints=[...prices][0],name=members[0][2],ids=members.map(([,u])=>u.id);
    if(count<2||numbers.some((n,i)=>n!==i+1)||prices.size!==1||signatures.size!==1||!Number.isFinite(groupPoints)||members.some(([,u])=>u.parseStatus==='partial')||groupPoints%count){diagnostics.push({level:'warning',code:'numbered_points_unresolved',unitIds:ids,message:`${name} 的编号组不完整、配置/标价不同或费用无法整除；暂保留印刷费用，请核对。`});continue}
    for(const [n,u]of members){u.points=groupPoints/count;u.pointsInterpretation={mode:'numbered_configuration_group',groupName:name,groupPoints,quantity:count,copyNumber:n,unitPoints:u.points,rule:'complete-numbered-identical-configuration/v1'}}
    diagnostics.push({level:'info',code:'group_points_distributed',unitIds:ids,message:`${name}（#1–#${count}）的${groupPoints}分为同配置组合计；已分配为每支${groupPoints/count}分。`});
  }
}
export function resolveKeyword(raw,catalog,glossary={}){
  const parameter=keywordParameter(raw);
  const {display:terms,aliases,supplement}=catalog,byRule=Object.fromEntries(catalog.keywords.map(k=>[k.identifier,k]));
  let base=raw.replace(/\s+\d+$/,'').trim();
  const direct=/^Direct(?:\s|:|$)/i.test(raw);if(direct)base='Direct';
  const parameterized=raw.match(/^(Arm|Detonate)\s+(?:\d+|X)(?:\s*:|$)/i);if(parameterized)base=parameterized[1];
  const normalized=norm(base).replace(/_x$/,''),key=parameter?.id||aliases[normalized]||normalized,item=byRule[key]||supplement[key];
  if(item){let label=(DISPLAY_HEADINGS[key]||item.rulebook_heading).replace('完 成 任 务','完成任务'),m=raw.match(/\s+(\d+)$/);if(m)label=label.replaceAll('X',m[1]);
    if(parameter)label=parameterLabel(item.rulebook_heading,parameter.parameter);
    else if(['arm','detonate'].includes(key)){
      const p=raw.match(/^(?:Arm|Detonate)\s+(\d+|X)(?:\s*:\s*(.+))?$/i);if(p)label=item.rulebook_heading.split('：')[0].replaceAll('X',p[1])+(p[2]?'：'+p[2]:'');
    }
    if(!parameter&&['Mercenary','Independent','Equip'].includes(base)){let extra=raw.slice(base.length).replace(/^[ :]+|[ :]+$/g,'');for(const [en,zh]of Object.entries(terms).sort((a,b)=>b[0].length-a[0].length))extra=extra.split(en).join(zh);extra=extra.replaceAll(' and ','及').replaceAll(' or ','或');label=label.split(/：|X/)[0]+(extra?'：'+extra:'')}
    return {raw,id:key,label,summary:item.summary,full:item.rulebook_quote,timing:item.timing,source:byRule[key]?'reviewed_dictionary':'local_supplement',...(parameter||{})};
  }
  const quote=glossary[key]||'';return {raw,id:key,label:terms[raw]||raw,summary:quote||'此词条暂缺规则文本。',full:quote||'此词条暂缺规则文本。',timing:[],source:quote?'pdf_glossary':'unresolved'};
}
export function resolveCommand(c,catalog,diagnostics=[]){
  let candidates=catalog.commands.filter(k=>norm(k.name)===norm(c.name));const same=candidates.filter(k=>k.pips===c.pips);if(same.length)candidates=same;
  if(candidates.length===1){const m=clone(candidates[0]);if(c.pips!==null&&c.pips!==m.pips)diagnostics.push({level:'warning',code:'command_pips_difference',message:`${c.name} 的 PDF 点数与本地卡库不同；保留 PDF 数值。`});return {...c,catalogId:m.id,zh:m.zh,keywords:m.keywords||[],catalogPips:m.pips,catalogDescription:m.description,weapons:m.weapons,catalogSources:m.provenance||[],match:'local_catalog',textPolicy:'Displayed rules use the local catalog; raw PDF card text is retained separately.'}}
  diagnostics.push({level:'warning',code:'command_unresolved',message:`命令卡“${c.name}”尚未唯一匹配，保留 PDF 原文。`});return {...c,zh:{name:c.name,description:c.pdfDescription||c.rawText||''},match:'unresolved'};
}
export function parseCommandPanel(geo,box,page,index){
  const items=geo.items.filter(t=>inside(t,box)),ls=lines(items);if(!ls.length)return null;
  let first=ls[0].text,pip=first.match(/\((\d+)-pip\)/),descriptionStart=1;
  const bars=geo.rects.filter(b=>b[0]>=box[0]&&b[2]<=box[2]&&b[2]-b[0]>(box[2]-box[0])*.8&&b[1]>box[1]+2&&b[3]<box[3]&&b[3]-b[1]<(box[3]-box[1])*.35);
  if(bars.length){
    const headerBottom=Math.min(...bars.map(b=>b[1])),header=items.filter(t=>t.y<headerBottom),titleSize=Math.max(0,...header.map(t=>t.height));
    const title=lines(header.filter(t=>t.height>=titleSize*.85)).map(r=>r.text).join(' '),wrappedPip=title.match(/\((\d+)\s*-\s*pip\)/i);
    if(wrappedPip){const owner=lines(header.filter(t=>t.height<titleSize*.85)).map(r=>r.text).join(' ');first=title+(owner?' '+owner:'');pip=first.match(/\((\d+)\s*-\s*pip\)/i);descriptionStart=ls.findIndex(r=>r.y>=headerBottom);if(descriptionStart<0)descriptionStart=ls.length}
  }
  const rawText=ls.map(r=>r.text).join('\n');
  return {id:`command-${index}`,name:pip?first.slice(0,pip.index).trim():first,owner:pip?first.slice(pip.index+pip[0].length).trim():'',pips:pip?Number(pip[1]):null,rawText,pdfDescription:ls.slice(descriptionStart).map(r=>r.text).join('\n'),textQuality:rawText.includes('(no card text available)')?'missing':'extracted-unreviewed',provenance:{page,bbox:box}};
}
export function collectReviewItems(army){
  const grouped=new Map();
  function add(item){
    const key=JSON.stringify([item.category,item.code,item.title,item.rawText||'']),found=grouped.get(key);
    if(!found){grouped.set(key,{...item,locations:[...(item.locations||[])]});return}
    for(const loc of item.locations||[])if(!found.locations.some(x=>JSON.stringify(x)===JSON.stringify(loc)))found.locations.push(loc);
  }
  for(const item of army.reviewItems||[])add(item);
  function rules(list,loc){for(const k of list||[])if(['unresolved','pdf_glossary'].includes(k.source))add({category:'keyword',code:k.source,title:k.raw||k.label||k.id,message:k.source==='pdf_glossary'?'未匹配中文词典，已显示 PDF 英文释义。':'本地词典与 PDF 词条表均无对应释义，已保留原名。',rawText:k.source==='pdf_glossary'?k.full:k.raw||k.label||k.id,locations:[loc]})}
  for(const u of army.units){
    const loc={page:u.provenance.page,unitId:u.id,unitName:u.name,context:'单位词条'};
    rules(u.keywords,loc);rules(u.fromUpgrades,{...loc,context:'来自升级卡的词条'});
    for(const w of u.weapons)rules(w.keywords,{...loc,context:'武器：'+w.name});
    for(const c of u.upgrades){
      if(c.match==='unresolved')add({category:'upgrade',code:'upgrade_unresolved',title:c.name,message:'未匹配到唯一升级卡；PDF 中的名称、已列出的武器和词条仍保留，不补造卡文。',rawText:c.name,locations:[{...loc,context:'升级卡'}]});
      rules(c.zh?.keywords,{...loc,context:'升级卡：'+c.name});
    }
  }
  for(const c of army.commandCards){const loc={page:c.provenance.page,context:'战术卡：'+c.name};if(c.match==='unresolved')add({category:'command',code:'command_unresolved',title:c.name,message:'未匹配到唯一战术卡，已保留 PDF 原文。',rawText:c.pdfDescription||c.rawText||c.name,locations:[loc]});rules(c.zh?.keywords||c.keywords,loc)}
  return [...grouped.values()];
}
export function resolveUpgrade(name,u,catalog,diagnostics=[]){
  const {display:terms,upgrades}=catalog;
  let candidates=upgrades.filter(c=>[c.name,...c.names].some(n=>norm(n)===norm(name)));const base=u.name.replace(/\s*\(#\d+\)$/,'');
  if(candidates.length>1){
    const exact=candidates.filter(c=>(c.requiredUnitNames||[]).some(r=>norm(base)===norm(r))),restricted=exact.length===1?exact:candidates.filter(c=>(c.requiredUnitNames||[]).some(r=>norm(base).includes(norm(r))||norm(r).includes(norm(base))));
    if(restricted.length===1)candidates=restricted;else{const scoped=candidates.filter(c=>c.names.some(r=>norm(r).includes(norm(base))));if(scoped.length===1)candidates=scoped}
  }
  if(candidates.length!==1&&base==='The Bad Batch'){const id={Echo:'echo-bb',Crosshair:'crosshair',Hunter:'hunter',Tech:'tech',Wrecker:'wrecker'}[name],chosen=upgrades.find(c=>c.id===id);if(chosen)candidates=[chosen]}
  if(candidates.length===1)return normalizeCardParameters({...clone(candidates[0]),match:'local_catalog'},catalog);
  diagnostics.push({level:'warning',code:'upgrade_unresolved',unitId:u.id,message:`升级卡“${name}”未能唯一匹配，保留英文。`,candidates:candidates.map(c=>c.id)});return {name,zh:{name:terms[name]||name},match:'unresolved'};
}
export function resolveUnitLabels(name,subtitle='',catalog,weapon=null){
  const base=name.replace(/\s*\(#\d+\)$/,''),choices=(catalog.unitNames||[]).filter(u=>norm(u.name.en)===norm(base)),exact=choices.filter(u=>norm(u.title.en)===norm(subtitle)),scoped=exact.length?exact:choices;
  const unique=(pairs,fallback)=>{const values=[...new Set(pairs.map(p=>p.zh).filter(Boolean))];return values.length===1?values[0]:catalog.display[fallback]||fallback};
  if(weapon!==null)return unique(scoped.flatMap(u=>u.weapons.filter(w=>norm(w.en)===norm(weapon))),weapon);
  return {name:unique(scoped.map(u=>u.name),base)+name.slice(base.length),subtitle:exact.length?unique(exact.map(u=>u.title),subtitle):catalog.display[subtitle]||subtitle};
}
function enrich(army,catalog){
  const {display:terms,upgrades,commands}=catalog;
  const display=s=>{if(!s)return '';const b=s.replace(/\s*\(#\d+\)$/,'');return (terms[b]||b)+s.slice(b.length)};
  const keyword=raw=>resolveKeyword(raw,catalog,army.pdfGlossary);
  for(const u of army.units){
    u.zh=resolveUnitLabels(u.name,u.subtitle,catalog);
    u.upgrades=u.upgrades.map(name=>resolveUpgrade(name,u,catalog,army.diagnostics));
    u.keywords=u.keywords.map(keyword);u.fromUpgrades=u.fromUpgrades.map(keyword);
    for(const w of u.weapons){w.zh={name:resolveUnitLabels(u.name,u.subtitle,catalog,w.name)};w.keywords=w.keywords.map(keyword)}
  }
  army.commandCards=army.commandCards.map(c=>resolveCommand(c,{commands},army.diagnostics));
  for(const u of army.units){u.isCounterpart=u.subtitle?.toLowerCase()==='counterpart';u.countedPoints=u.isCounterpart?0:u.points}
  army.reviewItems=collectReviewItems(army);
  army.catalogVersions=catalog.versions;army.totals={entries:army.units.length,pdfPoints:sum(army.units.map(u=>u.countedPoints)),counterpartPointsExcluded:sum(army.units.filter(u=>u.isCounterpart).map(u=>u.points)),printedPointsSum:sum(army.units.map(u=>u.provenance.printedPoints)),weapons:sum(army.units.map(u=>u.weapons.length)),commands:army.commandCards.length,incomplete:army.reviewItems.some(i=>i.category==='parsing')};return army;
}
export async function parsePdf(buffer,filename,onProgress=()=>{}){
  const bytes=new Uint8Array(buffer);if(bytes.length>25*1024*1024)throw new Error('文件超过25MB限制。');
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('请选择有效的 PDF 文件。');
  const sha256=await hash(bytes),catalog=await getCatalog();
  const doc=await getDocument({data:bytes,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false}).promise;
  try{
    if(doc.numPages>50)throw new Error('当前仅支持50页以内的军表。');
    const army={schema:'legion-army/v2',source:{pdf:filename,sha256,parserMode:'legion-hq-stat-reference/browser-v2.4',pageCount:doc.numPages},title:'未命名军表',units:[],commandCards:[],pdfGlossary:{},diagnostics:[],reviewItems:[]};
    let previousGlossary=false,headingFonts=new Set(),textPages=0;
    for(let n=1;n<=doc.numPages;n++){
      onProgress(`正在浏览器内提取第 ${n} / ${doc.numPages} 页…`);const pdfPage=await doc.getPage(n);let geo;
      try{geo=await pageGeometry(pdfPage)}catch(error){
        const content=await pdfPage.getTextContent().catch(()=>({items:[]}));if(content.items.some(t=>t.str?.trim()))textPages++;army.reviewItems.push({category:'parsing',code:'page_unparsed',title:`第 ${n} 页`,message:'页面版式读取失败：'+error.message,rawText:content.items.map(t=>t.str||'').join(' ')||'此页未能提取到文字。',locations:[{page:n,context:'整页'}]});continue;
      }
      if(geo.items.length)textPages++;
      const glossaryColumns=[[0,geo.width/2],[geo.width/2,geo.width]].map(([x0,x1])=>lines(geo.items.filter(t=>t.x>=x0&&t.x<x1)));
      const pageRows=glossaryColumns.flat(),text=pageRows.map(r=>r.text).join(' '),glossaryTitle=pageRows.find(r=>r.text==='Keyword Glossary');
      if(glossaryTitle)headingFonts=new Set(glossaryTitle.items.map(t=>t.font));
      const isHeading=row=>glossaryHeading(row,headingFonts);
      const isGlossary=!!glossaryTitle||previousGlossary&&pageRows.filter(isHeading).length>=2&&!/\bMini\b/.test(text)&&!text.includes('COMMAND CARDS');previousGlossary=isGlossary;
      if(n===1)army.title=textIn(geo.items,[0,0,geo.width,30])||army.title;
      if(text.includes('COMMAND CARDS')){
        for(const box of geo.panels){const card=parseCommandPanel(geo,box,n,army.commandCards.length+1);if(card)army.commandCards.push(card)}
      }else if(isGlossary){
        const glossaryTop=glossaryTitle?.y??-Infinity;
        for(const box of geo.panels.filter(b=>b[3]-b[1]>100&&b[3]<glossaryTop)){const u=parseUnitPanel(geo,box,n,army.units.length+1,army.reviewItems);if(u)army.units.push(u)}
        for(const column of glossaryColumns){let current=null;for(const row of column.filter(r=>r.y>glossaryTop)){if(isHeading(row)){const at=row.text.indexOf('.');current=norm(row.text.slice(0,at));army.pdfGlossary[current]=row.text.slice(at+1).trim()}else if(current)army.pdfGlossary[current]+=' '+row.text}}
      }else{
        const before=army.units.length,reviewBefore=army.reviewItems.length;
        for(const box of geo.panels.filter(b=>b[3]-b[1]>100)){const u=parseUnitPanel(geo,box,n,army.units.length+1,army.reviewItems);if(u)army.units.push(u)}
        if(army.units.length===before&&army.reviewItems.length===reviewBefore)army.reviewItems.push({category:'parsing',code:'page_unparsed',title:`第 ${n} 页`,message:'此页未能识别为单位、战术卡或词条表，已保留可提取的文字。',rawText:lines(geo.items).map(r=>r.text).join('\n')||'此页没有可提取的文字，可能为扫描页。',locations:[{page:n,context:'整页'}]});
      }
    }
    if(!army.units.length)throw new Error(textPages?'未识别到 Legion HQ 属性表，请确认导出内容包含单位属性表。':'PDF 没有可提取的文字层：文字可能已转为轮廓或图片。当前未启用 OCR。请回到原始网页，在浏览器打印目标中选择“另存为 PDF / Save as PDF”，保存后再导入。');
    normalizeGroupPoints(army.units,army.diagnostics);
    if(army.reviewItems.length)army.diagnostics.push({level:'warning',code:'partial_import',message:'部分面板无法完整解析，已保留可读单位与原文；请查看待核对内容，费用合计可能不完整。'});
    if(!army.commandCards.length)army.diagnostics.push({level:'warning',code:'commands_absent',message:'未识别到文字命令卡面板；军表其他内容仍可使用。'});
    for(const u of army.units)if(u.stats.mini===0)army.diagnostics.push({level:'warning',code:'zero_models',unitId:u.id,message:`${u.name} 的 PDF 模型数为0；按原值保留，未根据升级重新计算。`});
    return enrich(army,catalog);
  }finally{await doc.destroy()}
}
