const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
(async()=>{
  const b=await chromium.launch();
  try{
    const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket(/\/ws$/,w=>w.close());await p.goto(base);
    const cases=await p.evaluate(async()=>{
      const {parseCommandPanel}=await import('./pdf-parser.mjs');
      const item=(text,x,y,height=10)=>({text,x,y,height,width:text.length*height*.45});
      const examples=[
        {items:[item('Example Long Title (2-',5,12),item('pip)',5,24),item('Republic · Captain',185,12,7.5),item('Example',260,24,7.5),item('ORDERS',100,48),item('First body sentence.',5,64)],rects:[[5,38,295,50]]},
        {items:[item('A Longer',5,12),item('Example Title (3-pip)',5,24),item('Republic',240,12,7.5),item('ORDERS',100,48),item('Another body sentence.',5,64)],rects:[[5,38,295,50]]},
        {items:[item('Example (1-pip)',5,12),item('Republic',230,12,7.5),item('Body without an orders bar.',5,40)],rects:[]}
      ];
      return [1,1.7].map(scale=>examples.map(geo=>parseCommandPanel({items:geo.items.map(t=>({...t,x:t.x*scale,y:t.y*scale,width:t.width*scale,height:t.height*scale})),rects:geo.rects.map(b=>b.map(v=>v*scale))},[0,0,300*scale,150*scale],1,1)));
    });
    for(const [wrapped,titleWrapped,legacy]of cases){
      assert.equal(wrapped.name,'Example Long Title');assert.equal(wrapped.pips,2);assert.equal(wrapped.owner,'Republic · Captain Example');assert.equal(wrapped.pdfDescription,'ORDERS\nFirst body sentence.');assert(wrapped.rawText.includes('pip)'));
      assert.equal(titleWrapped.name,'A Longer Example Title');assert.equal(titleWrapped.pips,3);assert.equal(titleWrapped.owner,'Republic');assert.equal(titleWrapped.pdfDescription,'ORDERS\nAnother body sentence.');
      assert.equal(legacy.name,'Example');assert.equal(legacy.pips,1);assert.equal(legacy.owner,'Republic');assert.equal(legacy.pdfDescription,'Body without an orders bar.');
    }
    if(process.env.LEGION_HEADER_PDF){
      const file=process.env.LEGION_HEADER_PDF,bytes=await fs.readFile(file);
      const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import json,sys;from pathlib import Path;sys.path.insert(0,'armylist-app');from parser import parse_pdf;p=Path(sys.argv[1]);a=parse_pdf(p.read_bytes(),p.name);print(json.dumps([{'name':c['name'],'pips':c['pips'],'owner':c['owner'],'match':c['match'],'rawText':c['rawText'],'pdfDescription':c['pdfDescription']}for c in a['commandCards']]))",file],{encoding:'utf8'}));
      const browser=await p.evaluate(async bytes=>{const {parsePdf}=await import('./pdf-parser.mjs');const a=await parsePdf(new Uint8Array(bytes),'user.pdf');return a.commandCards.map(({name,pips,owner,match,rawText,pdfDescription})=>({name,pips,owner,match,rawText,pdfDescription}))},Array.from(bytes));
      assert.equal(browser.length,6);assert.deepEqual(browser.map(c=>c.pips),[1,1,2,2,3,3]);
      for(let i=0;i<6;i++)for(const field of ['name','pips','owner','match'])assert.deepEqual(browser[i][field],python[i][field],field+' card '+i);
      const target=browser.find(c=>c.name==='Have I Ever Let You Down?');assert(target);assert.equal(target.pips,2);assert.equal(target.owner,'Republic · Clone Commander Cody');assert.equal(target.match,'local_catalog');assert(!target.pdfDescription.startsWith('pip)'));assert(target.rawText.includes('pip)'));
      await p.locator('#pdf-file').setInputFiles(file);await p.locator('#parse').click();await p.locator('#result').waitFor();await p.locator('#preview').click();
      const card=p.locator('.command-card').filter({hasText:'Have I Ever Let You Down?'});await card.waitFor();assert.equal(await card.count(),1);assert.equal(await card.locator('.pips').textContent(),'●●');assert(!(await card.locator('.card-title').innerText()).includes('(2-'));assert((await card.locator('.card-description').innerText()).includes('科迪'));
    }
    assert.deepEqual(errors,[]);console.log('PASS: wrapped pip/title and owner columns; scaled layout; legacy fallback; optional external PDF with Python/browser matching and rendered two pips.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
