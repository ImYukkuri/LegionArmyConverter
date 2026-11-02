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
  const result=[];
  for(const part of text.split(',')){
    const c=part.trim();if(!c)continue;const previous=result.at(-1)||'';
    if(previous.startsWith('Mercenary')&&['Empire','Rebels','Republic','Separatists'].includes(c)||previous.startsWith('Equip ')&&['Hunter','Wrecker','Echo','Tech','Crosshair','Omega'].includes(c))result[result.length-1]+=', '+c;
    else result.push(c);
  }return result;
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
function unitPanel(geo,box,page,index){
  const items=geo.items.filter(t=>inside(t,box)),mini=items.find(t=>t.text==='Mini');if(!mini)return null;
  const statHeads=['Mini','HP','Def','Cor','Spd','Hit Surge','Def Surge'].map(name=>items.find(t=>t.text===name&&Math.abs(t.y-mini.y)<2));
  if(statHeads.some(t=>!t))throw new Error(`第${page}页的7列属性表不完整。`);
  const headerCell=cellFor(mini,geo.rects);if(!headerCell)throw new Error('未能定位属性表单元格。');
  const split=box[0]+(box[2]-box[0])*.66;
  const title=textIn(items,[box[0]+4,box[1],split,headerCell[1]]),meta=textIn(items,[split,box[1],box[2]-4,headerCell[1]]);
  const points=meta.match(/(\d+)\s*pts/),rank=meta.match(/COMMANDER|OPERATIVE|CORPS|SPECIAL|SUPPORT|HEAVY/);
  if(!points)throw new Error(`第${page}页单位费用缺失。`);
  let [name,subtitle='']=title.split(' — ');if(title.endsWith(' (counterpart)')){name=title.slice(0,-14);subtitle='counterpart'}
  const wh=items.find(t=>t.text==='Weapon'&&t.y>mini.y),kh=items.find(t=>t.text==='Keywords:'&&t.y>(wh?.y||mini.y));
  if(!kh)throw new Error(`${name} 缺少 Keywords 字段。`);
  const rows=[statHeads.map(t=>t.text)];
  const values=statHeads.map(t=>{
    const b=cellFor(t,geo.rects);
    if(!b)throw new Error(`${name} 的属性单元格缺失。`);return textIn(items,[b[0],b[3],b[2],(wh||kh).y-(wh||kh).height]);
  });rows.push(values);
  const weapons=[];
  if(wh){
  const weaponHeads=['Weapon','Range','Dice','Keywords'].map(n=>items.find(t=>t.text===n&&Math.abs(t.y-wh.y)<2));
  if(weaponHeads.some(t=>!t))throw new Error(`${name} 的武器4列表头不完整。`);
  const columns=weaponHeads.map(t=>cellFor(t,geo.rects));if(columns.some(b=>!b))throw new Error('未能定位武器列。');
  rows.push(weaponHeads.map(t=>t.text));
  const first=columns[0];
  const boundaries=[];
  for(const b of geo.edges.filter(b=>Math.abs(b[0]-first[0])<1.6&&Math.abs(b[2]-first[2])<1.6&&b[1]>=first[3]-1.6&&b[3]<kh.y-kh.height/2).sort((a,b)=>a[1]-b[1])){
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
  const tail=textIn(items,[box[0]+4,kh.y-kh.height,box[2]-4,box[3]]),sections=tail.match(/Keywords:\s*(.*?)(?:From upgrades:\s*(.*?))?(?:Upgrades:\s*(.*))?$/);
  if(!sections)throw new Error(`${name} 缺少 Keywords 字段。`);
  return {id:`unit-${index}`,name,subtitle,rank:rank?rank[0][0]+rank[0].slice(1).toLowerCase():null,points:Number(points[1]),
    stats:Object.fromEntries(['mini','hp','defense','courage','speed','attackSurge','defenseSurge'].map((k,i)=>[k,/^\d+$/.test(values[i])?Number(values[i]):values[i]==='—'?null:values[i]])),
    weapons,keywords:splitKeywords(sections[1]),fromUpgrades:splitKeywords(sections[2]||''),upgrades:splitKeywords(sections[3]||''),
    provenance:{page,bbox:box,title,meta,table:rows,tail}};
}
export function normalizeGroupPoints(units,diagnostics){
  const groups=new Map();
  for(const u of units){u.provenance.printedPoints??=u.points;const m=u.name.match(/^(.+?)\s*\(#(\d+)\)$/);if(m){const key=m[1].trim()+'|'+u.rank;if(!groups.has(key))groups.set(key,[]);groups.get(key).push([Number(m[2]),u,m[1].trim()])}}
  for(const members of groups.values()){
    if(members.every(([,u])=>u.pointsInterpretation?.mode==='numbered_configuration_group'))continue;
    const count=members.length,numbers=members.map(([n])=>n).sort((a,b)=>a-b),prices=new Set(members.map(([,u])=>u.provenance.printedPoints));
    const signatures=new Set(members.map(([,u])=>JSON.stringify(['subtitle','stats','weapons','keywords','fromUpgrades','upgrades'].map(k=>u[k]))));
    const groupPoints=[...prices][0],name=members[0][2],ids=members.map(([,u])=>u.id);
    if(count<2||numbers.some((n,i)=>n!==i+1)||prices.size!==1||signatures.size!==1||groupPoints%count){diagnostics.push({level:'warning',code:'numbered_points_unresolved',unitIds:ids,message:`${name} 的编号组不完整、配置/标价不同或费用无法整除；暂保留印刷费用，请核对。`});continue}
    for(const [n,u]of members){u.points=groupPoints/count;u.pointsInterpretation={mode:'numbered_configuration_group',groupName:name,groupPoints,quantity:count,copyNumber:n,unitPoints:u.points,rule:'complete-numbered-identical-configuration/v1'}}
    diagnostics.push({level:'info',code:'group_points_distributed',unitIds:ids,message:`${name}（#1–#${count}）的${groupPoints}分为同配置组合计；已分配为每支${groupPoints/count}分。`});
  }
}
export function resolveKeyword(raw,catalog,glossary={}){
  const {display:terms,aliases,supplement}=catalog,byRule=Object.fromEntries(catalog.keywords.map(k=>[k.identifier,k]));
  let base=raw.replace(/\s+\d+$/,'').trim();for(const p of ['Mercenary','Independent','Equip'])if(raw.startsWith(p))base=p;
  const direct=/^Direct(?:\s|:|$)/i.test(raw);if(direct)base='Direct';
  const parameterized=raw.match(/^(Arm|Detonate)\s+(?:\d+|X)(?:\s*:|$)/i);if(parameterized)base=parameterized[1];
  const normalized=norm(base).replace(/_x$/,''),key=aliases[normalized]||normalized,item=byRule[key]||supplement[key];
  if(item){let label=item.rulebook_heading.replace('完 成 任 务','完成任务'),m=raw.match(/\s+(\d+)$/);if(m)label=label.replaceAll('X',m[1]);
    if(direct)label=raw;
    else if(['arm','detonate'].includes(key)){
      const p=raw.match(/^(?:Arm|Detonate)\s+(\d+|X)(?:\s*:\s*(.+))?$/i);if(p)label=item.rulebook_heading.split('：')[0].replaceAll('X',p[1])+(p[2]?'：'+p[2]:'');
    }
    if(['Mercenary','Independent','Equip'].includes(base)){let extra=raw.slice(base.length).replace(/^[ :]+|[ :]+$/g,'');for(const [en,zh]of Object.entries(terms).sort((a,b)=>b[0].length-a[0].length))extra=extra.split(en).join(zh);extra=extra.replaceAll(' and ','及').replaceAll(' or ','或');label=label.split(/：|X/)[0]+(extra?'：'+extra:'')}
    return {raw,id:key,label,summary:item.summary,full:item.rulebook_quote,timing:item.timing,source:byRule[key]?'reviewed_dictionary':'local_supplement'};
  }
  const quote=glossary[key]||'';return {raw,id:key,label:terms[raw]||raw,summary:quote||'此词条暂缺规则文本。',full:quote||'此词条暂缺规则文本。',timing:[],source:quote?'pdf_glossary':'unresolved'};
}
export function resolveCommand(c,catalog,diagnostics=[]){
  let candidates=catalog.commands.filter(k=>norm(k.name)===norm(c.name));const same=candidates.filter(k=>k.pips===c.pips);if(same.length)candidates=same;
  if(candidates.length===1){const m=clone(candidates[0]);if(c.pips!==null&&c.pips!==m.pips)diagnostics.push({level:'warning',code:'command_pips_difference',message:`${c.name} 的 PDF 点数与本地卡库不同；保留 PDF 数值。`});return {...c,catalogId:m.id,zh:m.zh,keywords:m.keywords||[],catalogPips:m.pips,catalogDescription:m.description,weapons:m.weapons,catalogSources:m.provenance||[],match:'local_catalog',textPolicy:'Displayed rules use the local catalog; raw PDF card text is retained separately.'}}
  diagnostics.push({level:'warning',code:'command_unresolved',message:`命令卡“${c.name}”尚未唯一匹配，保留 PDF 原文。`});return {...c,zh:{name:c.name,description:c.pdfDescription||c.rawText||''},match:'unresolved'};
}
function enrich(army,catalog){
  const {display:terms,upgrades,commands}=catalog;
  const display=s=>{if(!s)return '';const b=s.replace(/\s*\(#\d+\)$/,'');return (terms[b]||b)+s.slice(b.length)};
  const keyword=raw=>resolveKeyword(raw,catalog,army.pdfGlossary);
  for(const u of army.units){
    u.zh={name:display(u.name),subtitle:display(u.subtitle)};
    u.upgrades=u.upgrades.map(name=>{
      let candidates=upgrades.filter(c=>[c.name,...c.names].some(n=>norm(n)===norm(name)));const base=u.name.replace(/\s*\(#\d+\)$/,'');
      if(candidates.length>1){const restricted=candidates.filter(c=>(c.requiredUnitNames||[]).some(r=>norm(base).includes(norm(r))||norm(r).includes(norm(base))));if(restricted.length===1)candidates=restricted;else{const scoped=candidates.filter(c=>c.names.some(r=>norm(r).includes(norm(base))));if(scoped.length===1)candidates=scoped}}
      if(candidates.length!==1&&base==='The Bad Batch'){const id={Echo:'echo-bb',Crosshair:'crosshair',Hunter:'hunter',Tech:'tech',Wrecker:'wrecker'}[name],chosen=upgrades.find(c=>c.id===id);if(chosen)candidates=[chosen]}
      if(candidates.length===1)return {...clone(candidates[0]),match:'local_catalog'};
      army.diagnostics.push({level:'warning',code:'upgrade_unresolved',unitId:u.id,message:`升级卡“${name}”未能唯一匹配，保留英文。`,candidates:candidates.map(c=>c.id)});return {name,zh:{name:display(name)},match:'unresolved'};
    });
    u.keywords=u.keywords.map(keyword);u.fromUpgrades=u.fromUpgrades.map(keyword);
    for(const w of u.weapons){w.zh={name:display(w.name)};w.keywords=w.keywords.map(keyword)}
  }
  army.commandCards=army.commandCards.map(c=>resolveCommand(c,{commands},army.diagnostics));
  for(const u of army.units){u.isCounterpart=u.subtitle?.toLowerCase()==='counterpart';u.countedPoints=u.isCounterpart?0:u.points}
  army.catalogVersions=catalog.versions;army.totals={entries:army.units.length,pdfPoints:sum(army.units.map(u=>u.countedPoints)),counterpartPointsExcluded:sum(army.units.filter(u=>u.isCounterpart).map(u=>u.points)),printedPointsSum:sum(army.units.map(u=>u.provenance.printedPoints)),weapons:sum(army.units.map(u=>u.weapons.length)),commands:army.commandCards.length};return army;
}
export async function parsePdf(buffer,filename,onProgress=()=>{}){
  const bytes=new Uint8Array(buffer);if(bytes.length>25*1024*1024)throw new Error('文件超过25MB限制。');
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('请选择有效的 PDF 文件。');
  const sha256=await hash(bytes),catalog=await getCatalog();
  const doc=await getDocument({data:bytes,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false}).promise;
  try{
    if(doc.numPages>50)throw new Error('当前仅支持50页以内的军表。');
    const army={schema:'legion-army/v2',source:{pdf:filename,sha256,parserMode:'legion-hq-stat-reference/browser-v1',pageCount:doc.numPages},title:'未命名军表',units:[],commandCards:[],pdfGlossary:{},diagnostics:[]};
    for(let n=1;n<=doc.numPages;n++){
      onProgress(`正在浏览器内提取第 ${n} / ${doc.numPages} 页…`);const geo=await pageGeometry(await doc.getPage(n)),text=geo.items.map(t=>t.text).join(' ');
      if(n===1)army.title=textIn(geo.items,[0,0,geo.width,30])||army.title;
      if(text.includes('COMMAND CARDS')){
        for(const box of geo.panels){const ls=lines(geo.items.filter(t=>inside(t,box)));if(!ls.length)continue;const first=ls[0].text,pip=first.match(/\((\d+)-pip\)/),rawText=ls.map(r=>r.text).join('\n');army.commandCards.push({id:`command-${army.commandCards.length+1}`,name:pip?first.slice(0,pip.index).trim():first,owner:pip?first.slice(pip.index+pip[0].length).trim():'',pips:pip?Number(pip[1]):null,rawText,pdfDescription:ls.slice(1).map(r=>r.text).join('\n'),textQuality:rawText.includes('(no card text available)')?'missing':'extracted-unreviewed',provenance:{page:n,bbox:box}})}
      }else if(text.includes('Keyword Glossary')){
        const bold=geo.items.find(t=>t.text.includes('Keyword Glossary'))?.font;
        for(const [x0,x1]of [[0,geo.width/2],[geo.width/2,geo.width]]){let current=null;for(const row of lines(geo.items.filter(t=>t.x>=x0&&t.x<x1))){const prefix=row.items.filter(t=>t.font===bold).map(t=>t.text).join('');if(prefix.includes('.')&&prefix.length>2){const at=row.text.indexOf('.');current=norm(row.text.slice(0,at));army.pdfGlossary[current]=row.text.slice(at+1).trim()}else if(current)army.pdfGlossary[current]+=' '+row.text}}
      }else for(const box of geo.panels.filter(b=>b[3]-b[1]>100)){const u=unitPanel(geo,box,n,army.units.length+1);if(u)army.units.push(u)}
    }
    if(!army.units.length)throw new Error('未识别到 Legion HQ 属性表。当前不支持扫描军表或其他导出版式。');
    normalizeGroupPoints(army.units,army.diagnostics);
    if(!army.commandCards.length)army.diagnostics.push({level:'warning',code:'commands_absent',message:'未识别到文字命令卡面板；军表其他内容仍可使用。'});
    for(const u of army.units)if(u.stats.mini===0)army.diagnostics.push({level:'warning',code:'zero_models',unitId:u.id,message:`${u.name} 的 PDF 模型数为0；按原值保留，未根据升级重新计算。`});
    return enrich(army,catalog);
  }finally{await doc.destroy()}
}
