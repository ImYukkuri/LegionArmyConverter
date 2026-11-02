const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
const cases=['Direct Empire Unit','Direct: Vehicle','Entourage Imperial Dark Troopers','Retinue Moff Gideon','Detachment Clone Trooper','Associate: Darth Vader','Teamwork Han Solo','Coordinate: Droid Trooper','Aid: Empire','Compel Corps','Equip: Armament, Doctrine','Mercenary Rebels, Republic','Independent Aim 1','Hover Air 2','Hover Ground','Fixed Front','Fixed','Sidearm Melee','AI: Attack','Advanced Targeting: Trooper 1','Eyes on the Prize: Tactical','Immune: Melee','Immune: Range 1 Weapons','One Step Ahead','Direction Vehicle','Indirect Vehicle','Equipment Test'];
const lists=['Mercenary Rebels, Republic, Jump 2, Equip Armament, Doctrine, Impervious','Equip: Hunter, Wrecker, Echo, Tech, Crosshair, Jump 2','Entourage Imperial Dark Troopers, Tactical 1','Equip: Test (A, B), Jump 2'];
(async()=>{
 const b=await chromium.launch();try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket(/\/ws$/,w=>w.close());await p.goto(base);
  const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json;sys.path.insert(0,'armylist-app');from parser import split_keywords;from catalog import keyword,PARAMETER_RULES;d=json.loads(sys.stdin.read());print(json.dumps({'rules':[keyword(s,{})for s in d['cases']],'lists':[split_keywords(s)for s in d['lists']],'families':PARAMETER_RULES}))"],{input:JSON.stringify({cases,lists}),encoding:'utf8'}));
  const browser=await p.evaluate(async({cases,lists})=>{const m=await import('./pdf-parser.mjs'),c=await m.getCatalog();return {rules:cases.map(s=>m.resolveKeyword(s,c)),lists:lists.map(m.splitKeywords),families:m.PARAMETER_RULES}}, {cases,lists});
  assert.deepEqual(browser,python);assert.equal(browser.rules[0].label,'传令：Empire Unit');assert.equal(browser.rules[2].label,'统率：Imperial Dark Troopers');assert.equal(browser.rules[10].parameter,'Armament, Doctrine');assert.equal(browser.rules[13].id,'hover_ground');assert.equal(browser.rules[15].label,'固定：Front');assert.equal(browser.rules[22].label,'免疫：射程1武器');assert.equal(browser.rules[23].label,'领先一步');for(const i of [24,25,26])assert.equal(browser.rules[i].source,'unresolved');
  assert.deepEqual(browser.lists[0],['Mercenary Rebels, Republic','Jump 2','Equip Armament, Doctrine','Impervious']);assert.equal(browser.lists[1].length,2);assert.equal(browser.lists[3].length,2);
  if(process.env.LEGION_EMPIRE_PDF){
   const file=process.env.LEGION_EMPIRE_PDF;
   const actualPython=JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json;from pathlib import Path;sys.path.insert(0,'armylist-app');from parser import parse_pdf;p=Path(sys.argv[1]);print(json.dumps(parse_pdf(p.read_bytes(),p.name)))",file],{encoding:'utf8'}));
   await p.locator('#pdf-file').setInputFiles(file);await p.locator('#parse').click();await p.locator('#result').waitFor();const actual=await p.evaluate(()=>army);
   assert.equal(actual.units.length,10);assert.equal(actual.totals.pdfPoints,1000);assert.equal(actual.totals.weapons,27);assert(!actual.reviewItems.some(r=>r.category==='parsing'&&r.locations.some(l=>l.page<=4)));assert.deepEqual(actual.reviewItems,actualPython.reviewItems);assert.equal(Object.keys(actual.pdfGlossary).length,44);assert(actual.pdfGlossary.transport.includes('During Setup'));assert(actual.pdfGlossary.retinue.includes('Activation Phase'));assert.deepEqual(actual.units.map(u=>u.keywords),actualPython.units.map(u=>u.keywords));
   assert.deepEqual(actual.units.map(u=>u.zh.name),actualPython.units.map(u=>u.zh.name));
   assert.deepEqual(actual.units.map(u=>u.zh.name),['索龙元帅','星区总督吉迪恩','曼达洛猎人','冲锋队防暴小队','冲锋队 (#1)','冲锋队 (#2)','冲锋队 (#3)','帝国黑暗士兵 (#1)','帝国黑暗士兵 (#2)','LAAT/LE巡逻艇']);
   assert.equal(actual.units[0].zh.subtitle,'帝国最高统帅部');assert.equal(actual.units[1].zh.subtitle,'帝国万岁');
   await p.locator('#preview').click();await p.locator('.unit').first().waitFor();await p.locator('#expand-all').click();assert.equal(await p.locator('#unit-2 [data-rule-id=entourage] .keyword-name').textContent(),'统率：Imperial Dark Troopers');assert.equal(await p.locator('#unit-1 [data-rule-id=direct] .keyword-name').textContent(),'传令：Empire Unit');assert.equal(await p.locator('#unit-3 [data-rule-id=doctrine]').count(),0);
   assert.deepEqual(await p.locator('.unit-name-line h3').allTextContents(),actual.units.map(u=>u.zh.name));assert.deepEqual(await p.locator('.unit-name-line > .en-name').allTextContents(),actual.units.map(u=>u.name));
   for(const width of [1280,390]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.locator('#review-items,#notes,.partial-unit-note').count(),0)}
   assert.equal(await p.locator('#icon-rank-operative').getAttribute('viewBox'),'231.0 -645.1428571428571 561.0 711.1428571428571');assert.equal(await p.locator('#icon-block').getAttribute('viewBox'),'47 -537.0 791 731.0');
  }
  assert.deepEqual(errors,[]);console.log('PASS: documented parameter families; strict prefix boundaries; Equip comma ownership; Python/browser parity; Empire PDF glossary continuation, total, tags and clean viewer; corrected symbol mapping.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
