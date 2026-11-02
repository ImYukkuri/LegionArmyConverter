const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
const cases=['Direct Vehicle','Direct Empire Unit','Direct: Clone Trooper','Direct','direct vehicle','Anti-Material 2','Anti-Materiel 2','anti materiel','Anti Material X','Anti-Personnel 3','Anti Personnel X','Area Weapon','Arm 2: Test Charge','Assault 1','Direction Vehicle','Indirect Vehicle'];
(async()=>{
  const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,sys;sys.path.insert(0,'armylist-app');from catalog import keyword;print(json.dumps([keyword(s,{})for s in json.loads(sys.stdin.read())],ensure_ascii=False))"],{input:JSON.stringify(cases),encoding:'utf8'}));
  const b=await chromium.launch();
  try{
    const page=await b.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket(/\/ws$/,w=>w.close());await page.goto(base);
    const browser=await page.evaluate(async cases=>{const m=await import('./pdf-parser.mjs'),c=await m.getCatalog();return cases.map(s=>m.resolveKeyword(s,c))},cases);
    assert.deepEqual(browser,python,'Python and browser normalization must agree');
    for(let i=0;i<5;i++){assert.equal(browser[i].id,'direct');assert.equal(browser[i].label,cases[i]);assert.deepEqual(browser[i].timing,['command'])}
    assert.equal(browser[5].label,'反器材2');assert.equal(browser[6].label,'反器材2');assert.equal(browser[7].label,'反器材X');assert.deepEqual(browser[5].timing,['attack']);
    assert.equal(browser[9].label,'反人员3');assert.equal(browser[11].id,'area_weapon');assert.equal(browser[12].label,'安设2：Test Charge');assert.equal(browser[13].label,'突击1');
    assert.notEqual(browser[14].id,'direct');assert.notEqual(browser[15].id,'direct');
    const catalog=await page.evaluate(async()=>await(await fetch('catalog.json')).json());
    const tank=catalog.upgrades.find(c=>c.id==='tank-hunting-munitions'),direct=catalog.upgrades.find(c=>c.id==='optimized-task-flow');
    assert.equal(tank.zh.keywords.find(k=>k.ruleId==='anti_materiel').label,'反器材X');assert.equal(direct.zh.keywords[0].label,'Direct AI Unit');
    const data={schema:'legion-army/v2',title:'Layout test',source:{pdf:'user.pdf'},units:[{id:'u1',name:'Test Unit',zh:{name:'测试单位'},rank:'Corps',points:1,stats:{},keywords:[browser[0],browser[1],browser[5]],fromUpgrades:[browser[7]],upgrades:[tank,direct],provenance:{page:1},weapons:[{name:'Test weapon',zh:{name:'测试武器'},range:'1-3',dice:'1R',keywords:[browser[5]]}]}],commandCards:[],totals:{pdfPoints:1},diagnostics:[]};
    data.units[0].weapons[0].keywords.push(browser[6],browser[7]);
    await page.goto(new URL('roster.html',base).href);await page.locator('#import-json').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#u1 > summary').click();
    const anti=page.locator('#u1 .unit-body > .timing-rule-list [data-rule-id=anti_materiel]');assert.equal(await anti.count(),1);assert.equal(await anti.locator('.keyword-name').textContent(),'反器材2');assert.match(await anti.locator('.keyword-origins').textContent(),new RegExp(tank.zh.name));
    const directs=page.locator('#u1 .unit-body > .timing-rule-list [data-rule-id=direct]');assert.equal(await directs.count(),3,'Different Direct types must remain distinct');
    assert.equal(await page.locator('#u1 .unit-weapons [data-rule-id=anti_materiel]').count(),1,'Weapon aliases also deduplicate');
    await anti.click();assert.match(await page.locator('#pop-text').textContent(),/升级X个骰子/);assert.match(await page.locator('#pop-upgrades').textContent(),new RegExp(tank.zh.name));await page.keyboard.press('Escape');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      for(const expanded of [false,true]){
        await page.locator('#expand-explanations').setChecked(expanded);
        assert(await page.locator('.keyword').evaluateAll(els=>els.filter(el=>el.getClientRects().length).every(el=>{const box=el.getBoundingClientRect(),timing=el.querySelector('.keyword-timings').getBoundingClientRect();return Math.abs(timing.height-(box.height-2))<1})),`Color fills full tag at width ${width}, expanded=${expanded}`);
        assert(await page.locator('.timing-rule-row').evaluateAll(rows=>rows.filter(r=>r.getClientRects().length).every(row=>{const expected=row.dataset.hasOrigins==='true'?36:26;return Math.abs(row.querySelector('.timing-row-title').getBoundingClientRect().height-expected)<1&&[...row.querySelectorAll('.keyword')].every(k=>k.getBoundingClientRect().height>=expected)})));
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
    }
    await page.locator('#expand-explanations').uncheck();
    const aligned=await page.locator('#u1 .unit-weapons .weapon-name').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.firstChild);const a=r.getBoundingClientRect(),b=el.querySelector('.en-name').getBoundingClientRect();return {text:a.toJSON(),english:b.toJSON(),display:getComputedStyle(el.querySelector('.en-name')).display}});assert(aligned.display==='inline'&&aligned.english.y<aligned.text.bottom&&aligned.english.x>aligned.text.x,JSON.stringify(aligned));
    assert.deepEqual(errors,[]);console.log('PASS: Direct families and English qualifiers; both Anti-Material spellings; reviewed rules; parameter dedup and origins; Python/browser parity; full-height timing colors; row/header sizes; inline weapon names; desktop/mobile/expanded layout.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
