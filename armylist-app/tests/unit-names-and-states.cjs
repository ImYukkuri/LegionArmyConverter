const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
(async()=>{
 const mapping=JSON.parse(await fs.readFile('mappings/unit-names.zh.json','utf8'));assert.equal(mapping.units.length,117);
 const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,sys;sys.path.insert(0,'armylist-app');from catalog import UNIT_NAMES,unit_labels;print(json.dumps([{'unit':unit_labels(u['name']['en'],u['title']['en']),'weapons':[unit_labels(u['name']['en'],u['title']['en'],w['en'])for w in u['weapons']]}for u in UNIT_NAMES]))"],{encoding:'utf8'}));
 const b=await chromium.launch();try{
  const p=await b.newPage();await p.routeWebSocket(/\/ws$/,w=>w.close());await p.goto(base);
  const result=await p.evaluate(async()=>{const m=await import('./pdf-parser.mjs'),c=await m.getCatalog();return {labels:c.unitNames.map(u=>({unit:m.resolveUnitLabels(u.name.en,u.title.en,c),weapons:u.weapons.map(w=>m.resolveUnitLabels(u.name.en,u.title.en,c,w.en))})),numbered:m.resolveUnitLabels('Stormtroopers (#3)','',c),fallback:m.resolveUnitLabels('Unknown Unit','Unknown Title',c)}});
  assert.deepEqual(result.labels,python);for(let i=0;i<mapping.units.length;i++){const u=mapping.units[i];assert.equal(result.labels[i].unit.name,u.name.zh);assert.equal(result.labels[i].unit.subtitle,u.title.zh);assert.deepEqual(result.labels[i].weapons,u.weapons.map(w=>w.zh))}
  assert.equal(result.numbered.name,'冲锋队 (#3)');assert.deepEqual(result.fallback,{name:'Unknown Unit',subtitle:'Unknown Title'});
  const data={schema:'legion-army/v2',title:'State test',source:{pdf:'user.pdf',sha256:'state-migration-test'},units:[{id:'u1',name:'Test Unit',zh:{name:'测试单位'},rank:'Corps',points:1,stats:{},weapons:[],keywords:[],fromUpgrades:[],upgrades:[{id:'test',name:'Test Upgrade',zh:{name:'测试升级',description:['效果']},description:['Effect']}],provenance:{page:1}}],commandCards:[],totals:{pdfPoints:1},diagnostics:[]};
  await p.goto(new URL('roster.html',base).href);await p.locator('#import-json').setInputFiles({name:'army.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.locator('#u1 > summary').click();
  assert.equal(await p.locator('.upgrade .card-state-controls,.upgrade [data-set-state]').count(),0);const badge=p.locator('.upgrade [data-cycle-card]');assert.equal(await badge.textContent(),'可用');
  await badge.click();assert.equal(await badge.textContent(),'不可用');assert.equal(await p.locator('.upgrade').getAttribute('open'),'');await badge.click();assert.equal(await badge.textContent(),'可用');
  for(const old of ['exhausted','expended','removed']){await p.evaluate(old=>{const el=document.querySelector('.upgrade');playStates[el.dataset.cardKey]=old;saveCardStates();renderArmy()},old);assert.equal(await badge.textContent(),'不可用');await badge.click();assert.equal(await badge.textContent(),'可用')}
  await badge.click();await p.evaluate(d=>sessionStorage.setItem('legion-current-army',JSON.stringify(d)),data);await p.reload();await p.locator('#u1 > summary').click();assert.equal(await badge.textContent(),'不可用');
  await p.locator('#reset-card-states').click();assert.equal(await badge.textContent(),'可用');assert.deepEqual(await p.evaluate(()=>Object.values(stateLabels.upgrade)),['可用','不可用']);
  console.log('PASS: all bilingual unit/title/weapon names; scoped variants; Python/browser parity; original suffixes; single upgrade button; ready/unavailable cycle; legacy migration and reload persistence.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
