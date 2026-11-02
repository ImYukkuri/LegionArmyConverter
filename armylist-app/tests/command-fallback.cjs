const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
const placeholder='暂无固化中文译文，请参阅 PDF 原文。';
const cards=[
  {name:'Unmapped card',pips:1,pdfDescription:'First PDF paragraph.\nSecond PDF paragraph.',rawText:'Title plus original body'},
  {name:'Raw only',pips:2,rawText:'Raw PDF text <test> & text'},
  {name:'No body',pips:3}
];
(async()=>{
  const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,sys;sys.path.insert(0,'armylist-app');import catalog;catalog.COMMANDS=[];print(json.dumps([catalog.command(c,[])for c in json.loads(sys.stdin.read())],ensure_ascii=False))"],{input:JSON.stringify(cards),encoding:'utf8'}));
  const b=await chromium.launch();
  try{
    const p=await b.newPage({acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket(/\/ws$/,w=>w.close());await p.goto(base);
    const browser=await p.evaluate(async cards=>{const m=await import('./pdf-parser.mjs');return cards.map(c=>m.resolveCommand(c,{commands:[]}))},cards);
    assert.deepEqual(browser,python);assert.equal(browser[0].zh.description,cards[0].pdfDescription);assert.equal(browser[1].zh.description,cards[1].rawText);assert.equal(browser[2].zh.description,'');
    const glossary=await p.evaluate(async()=>{const m=await import('./pdf-parser.mjs');return m.resolveKeyword('Unknown Test Rule',await m.getCatalog(),{unknown_test_rule:'PDF glossary body.'})});assert.equal(glossary.summary,'PDF glossary body.');assert.equal(glossary.full,glossary.summary);
    const commandCards=[
      {...cards[0],zh:{description:placeholder}},
      {...cards[1]},
      {...cards[2]},
      {...cards[0],zh:{description:'已审核中文规则。'}},
      {...cards[0],zh:{description:' '},pdfDescription:'',rawText:'',catalogDescription:'English catalog fallback.'}
    ].map((c,i)=>({...c,id:'c'+i,provenance:{page:1}}));
    const data={schema:'legion-army/v2',title:'Fallback test',source:{pdf:'user.pdf'},units:[{id:'u1',name:'Test Unit',zh:{name:'测试单位'},rank:'Corps',points:1,stats:{},keywords:[],fromUpgrades:[],upgrades:[],weapons:[],provenance:{page:1}}],commandCards,totals:{pdfPoints:1,weapons:0},diagnostics:[]};
    async function check(page){
      assert.deepEqual(await page.locator('.command-card .card-description').allTextContents(),[cards[0].pdfDescription,cards[1].rawText,'PDF 未提供此卡的规则正文。','已审核中文规则。','English catalog fallback.']);
      assert.equal(await page.locator('.card-description script,.card-description test').count(),0);
      assert.equal(await page.locator('.command-card').first().locator('.card-description').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');
      assert(!(await page.locator('#commands').innerText()).includes(placeholder));
    }
    await p.goto(new URL('roster.html',base).href);await p.locator('#import-json').setInputFiles({name:'army.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await check(p);
    await p.goto(base);await p.locator('#json-file').setInputFiles({name:'army.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.locator('#result').waitFor();
    const downloaded=p.waitForEvent('download');await p.locator('#download-html').click();const file=await downloaded;
    const out=await fs.mkdtemp(path.join(os.tmpdir(),'legion-command-fallback-')),html=path.join(out,'army.html');await file.saveAs(html);
    const offline=await b.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.route(/^https?:/,r=>r.abort());await offline.goto(pathToFileURL(html).href);await check(offline);
    assert.deepEqual(errors,[]);console.log('PASS: Python/browser original-text fallback; legacy JSON; translated-card priority; missing-body notice; safe multiline rendering; PDF glossary; offline HTML.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
