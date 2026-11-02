const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
(async()=>{
  const b=await chromium.launch();
  try{
    const p=await b.newPage({acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket(/\/ws$/,w=>w.close());await p.goto(base);
    const sections=['','From upgrades: Unknown Rule Upgrades: Unknown Card','Upgrades: Unknown Card','Keywords: Jump 2 From upgrades: Target 1 Upgrades: Card A, Card B'];
    const synthetic=await p.evaluate(async sections=>{
      const m=await import('./pdf-parser.mjs'),catalog=await m.getCatalog();
      const t=(text,x,y,width=75)=>({text,x,y,width,height:10,font:'test'}),box=[0,0,300,180],items=[t('Test Unit',5,14),t('CORPS · 40 pts',205,14,85),t('Mini',5,45),t('From upgrades:',5,100),t('Unknown Rule',90,100),t('Upgrades:',5,120),t('Unknown Card',90,120)];
      const review=[],unit=m.parseUnitPanel({items,rects:[],edges:[]},box,1,1,review);
      const rule=m.resolveKeyword('Unknown Rule',catalog),quote=m.resolveKeyword('Untranslated Test',catalog,{untranslated_test:'Retained PDF English.'});
      unit.zh={name:unit.name};unit.keywords=[rule,quote];unit.fromUpgrades=[];unit.upgrades=[m.resolveUpgrade('Unknown Card',unit,catalog)];
      const other={...structuredClone(unit),id:'unit-2',name:'Other Unit',parseStatus:undefined};
      const command={id:'c1',name:'Unknown Command',rawText:'Original command text.',pips:1,provenance:{page:2},match:'unresolved'};
      const army={schema:'legion-army/v2',title:'Review test',source:{pdf:'user.pdf'},units:[unit,other],commandCards:[command],reviewItems:review,diagnostics:[],totals:{pdfPoints:80,weapons:0,incomplete:true}};
      army.reviewItems=m.collectReviewItems(army);
      const missing=m.parseUnitPanel({items:items.filter(t=>!t.text.includes('pts')),rects:[],edges:[]},box,1,3,[]);
      const marksmen=['Super Commandos','Mandalorian Super Commandos'].map(name=>m.resolveUpgrade('Super Commando Marksman',{id:'test',name},catalog).id);
      const headers=['Mini','HP','Def','Cor','Spd','Hit Surge','Def Surge'],values=['1','5','Red','2','2','Hit','Block'];
      const simple={items:[t('Bare Unit',5,14),t('CORPS · 40 pts',205,14,85),...headers.map((s,i)=>t(s,i*42+3,40,30)),...values.map((s,i)=>t(s,i*42+3,57,25)),t('Weapon',5,80,70),t('Range',125,80,30),t('Dice',165,80,30),t('Keywords',210,80,70),t('Blaster',5,103,70),t('1-3',125,103,30),t('2R',165,103,30)],rects:[...headers.map((_,i)=>[i*42,25,i*42+42,45]),[0,68,120,88],[120,68,160,88],[160,68,205,88],[205,68,300,88]],edges:[[0,88,120,88],[0,117,120,117]]};
      const bareReview=[],bare=m.parseUnitPanel(simple,[0,0,300,180],1,4,bareReview),unknownReview=[];
      const unknown=m.parseUnitPanel({items:[t('Unrecognized content',5,40)],rects:[],edges:[]},box,1,5,unknownReview);
      return {sections:sections.map(m.parseUnitSections),army,missing,marksmen,bare,bareReview,unknown,unknownReview};
    },sections);
    assert.deepEqual(synthetic.sections[0],{keywords:[],fromUpgrades:[],upgrades:[]});assert.deepEqual(synthetic.sections[1],{keywords:[],fromUpgrades:['Unknown Rule'],upgrades:['Unknown Card']});
    assert.equal(synthetic.army.units[0].parseStatus,'partial');assert.equal(synthetic.army.units[0].points,40);assert.equal(synthetic.missing.points,null);assert.deepEqual(synthetic.missing.stats,{});
    assert.deepEqual(synthetic.marksmen,['super-commando-marksman-super','super-commando-marksman']);
    assert.equal(synthetic.bare.name,'Bare Unit');assert.equal(synthetic.bare.stats.hp,5);assert.equal(synthetic.bare.weapons.length,1);assert.deepEqual(synthetic.bare.keywords,[]);assert.deepEqual(synthetic.bare.fromUpgrades,[]);assert.deepEqual(synthetic.bare.upgrades,[]);assert.deepEqual(synthetic.bareReview,[]);
    assert.equal(synthetic.unknown,null);assert.equal(synthetic.unknownReview[0].rawText,'Unrecognized content');
    const reviews=synthetic.army.reviewItems;assert.equal(reviews.find(i=>i.title==='Unknown Rule').locations.length,2);assert.equal(reviews.find(i=>i.title==='Untranslated Test').rawText,'Retained PDF English.');
    assert.deepEqual(new Set(reviews.map(i=>i.category)),new Set(['parsing','keyword','upgrade','command']));
    const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,sys;sys.path.insert(0,'armylist-app');from parser import parse_unit_sections;from catalog import collect_review_items,upgrade;d=json.loads(sys.stdin.read());print(json.dumps({'sections':[parse_unit_sections(s)for s in d['sections']],'review':collect_review_items(d['army']),'marksmen':[upgrade('Super Commando Marksman',{'id':'test','name':s},[])['id']for s in ['Super Commandos','Mandalorian Super Commandos']]}))"],{input:JSON.stringify({sections,army:synthetic.army}),encoding:'utf8'}));
    assert.deepEqual(python.sections,synthetic.sections);assert.deepEqual(python.review,reviews);assert.deepEqual(python.marksmen,synthetic.marksmen);
    // Text rendering and offline export must be safe even for arbitrary PDF text.
    const hostile='<img src=x onerror="throw new Error(1)"></script>';
    synthetic.army.reviewItems.push({category:'parsing',code:'test',title:hostile,rawText:hostile,message:'Original source text',locations:[{page:2}]});
    await p.locator('#json-file').setInputFiles({name:'army.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(synthetic.army))});await p.locator('#result').waitFor();
    assert((await p.locator('#review-items').innerText()).includes('待核对内容'));assert.equal(await p.locator('#review-items img,#review-items script').count(),0);
    const reviewDownload=p.waitForEvent('download');await p.locator('#review-items button').click();const reviewFile=await reviewDownload,out=await fs.mkdtemp(path.join(os.tmpdir(),'legion-tolerant-')),reviewPath=path.join(out,'review.json');await reviewFile.saveAs(reviewPath);assert.deepEqual(JSON.parse(await fs.readFile(reviewPath,'utf8')).items,synthetic.army.reviewItems);
    const downloaded=p.waitForEvent('download');await p.locator('#download-html').click();const html=path.join(out,'army.html');await(await downloaded).saveAs(html);
    const offline=await b.newPage({viewport:{width:390,height:844}});offline.on('pageerror',e=>errors.push(e.message));await offline.route(/^https?:/,r=>r.abort());await offline.goto(pathToFileURL(html).href);await offline.locator('.unit').first().waitFor();
    assert.equal(await offline.locator('.review-group').count(),4);assert((await offline.locator('#points').innerText()).includes('待核对'));await offline.locator('#unit-1 > summary').click();assert.equal(await offline.locator('.partial-unit-note').count(),1);assert.equal(await offline.locator('#unit-1 .stats-table td').first().textContent(),'—');assert.equal(await offline.locator('#review-items img,#review-items script').count(),0);assert(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.LEGION_TOLERANT_PDF){
      const file=process.env.LEGION_TOLERANT_PDF;
      const actualPython=JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json;from pathlib import Path;from unittest.mock import patch;sys.path.insert(0,'armylist-app');import parser;p=Path(sys.argv[1]);a=parser.parse_pdf(p.read_bytes(),p.name);real=parser.unit_panel;\ndef fail(page,box,page_no,index):\n if index==2:raise ValueError('Deliberately malformed panel')\n return real(page,box,page_no,index)\nwith patch.object(parser,'unit_panel',side_effect=fail):b=parser.parse_pdf(p.read_bytes(),p.name)\nassert len(b['units'])==6 and b['units'][1]['parseStatus']=='partial'and b['totals']['incomplete'];print(json.dumps(a))",file],{encoding:'utf8'}));
      await p.locator('#pdf-file').setInputFiles(file);await p.locator('#parse').click();await p.locator('#result').waitFor();const actual=await p.evaluate(()=>army);
      assert.equal(actual.units.length,6);assert.equal(actual.totals.pdfPoints,660);assert.equal(actual.totals.weapons,18);assert.equal(actual.commandCards.length,0);assert.equal(actual.totals.incomplete,false);
      assert.deepEqual(actual.totals,actualPython.totals);assert.deepEqual(actual.reviewItems,actualPython.reviewItems);assert.deepEqual(actual.reviewItems.map(i=>i.title),['Doctrine']);
      assert(actual.units.every(u=>u.upgrades.every(c=>c.match==='local_catalog')));assert.deepEqual(actual.units.slice(2,4).map(u=>[u.points,u.keywords]),[[56,[]],[56,[]]]);
      await p.locator('#preview').click();await p.locator('.unit').first().waitFor();assert.equal(await p.locator('.unit').count(),6);await p.locator('#unit-2 > summary').click();await p.locator('#unit-2 [data-rule-id=doctrine]').first().click();assert((await p.locator('#pop-text').innerText()).includes('暂缺'));
    }
    assert.deepEqual(errors,[]);console.log('PASS: optional sections; scoped upgrade match; unknowns grouped with locations; partial units and unknown values; Python/browser parity; review download; safe/offline/mobile view; optional external PDF.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
