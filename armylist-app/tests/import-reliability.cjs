// User PDFs remain external; exercise selection lifetime without OS-specific locks.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
(async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket(/\/ws$/,ws=>ws.close());
  await page.route('**/pdf-parser.mjs',route=>route.fulfill({contentType:'text/javascript',body:`export async function parsePdf(buffer,name){
   const size=buffer.byteLength;structuredClone(buffer,{transfer:[buffer]});if(!size)throw Error('detached buffer');
   return {schema:'legion-army/v2',title:'Lifetime test',source:{pdf:name},units:[{id:'unit-1'}],commandCards:[],diagnostics:[],reviewItems:[],totals:{pdfPoints:size,weapons:0}};
  }`}));await page.goto(base);
  await page.evaluate(async()=>{const f=new File(['abc'],'cached.pdf');await select(f);f.arrayBuffer=()=>Promise.reject(new DOMException('gone','NotReadableError'))});
  await page.locator('#parse').click();await page.locator('#result').waitFor();assert.equal(await page.evaluate(()=>army.totals.pdfPoints),3);
  await page.locator('#parse').click();assert.equal(await page.evaluate(()=>army.totals.pdfPoints),3);assert.equal(await page.evaluate(()=>file.bytes.byteLength),3);
  const fallback=await page.evaluate(async()=>{const f=new File(['fallback'],'fallback.pdf');f.arrayBuffer=()=>Promise.reject(new DOMException('temporary','NotReadableError'));await select(f);return file?.bytes.byteLength});assert.equal(fallback,8);
  await page.evaluate(async()=>{await select({name:'locked.pdf',size:1,arrayBuffer:()=>Promise.reject(new DOMException('locked','NotReadableError'))})});
  assert(await page.locator('#parse').isDisabled());assert.equal(await page.evaluate(()=>file),null);assert.match(await page.locator('#status').textContent(),/无法读取.*重新选择/);
  const latest=await page.evaluate(async()=>{let finish;const slow=select({name:'old.pdf',size:1,arrayBuffer:()=>new Promise(r=>finish=r)});await select(new File(['new'],'latest.pdf'));finish(new ArrayBuffer(1));await slow;return {name:file.name,size:file.bytes.byteLength}});assert.deepEqual(latest,{name:'latest.pdf',size:3});
  await page.locator('#pdf-file').setInputFiles({name:'same.pdf',mimeType:'application/pdf',buffer:Buffer.from('first')});await page.waitForFunction(()=>file?.bytes.byteLength===5);
  await page.locator('#pdf-file').setInputFiles({name:'same.pdf',mimeType:'application/pdf',buffer:Buffer.from('second')});await page.waitForFunction(()=>file?.bytes.byteLength===6);assert.equal(await page.locator('#pdf-file').inputValue(),'');
  await page.evaluate(async()=>select({name:'oversized.pdf',size:26*1024*1024,arrayBuffer:()=>{throw Error('should not read')}}));assert.match(await page.locator('#status').textContent(),/25MB/);assert(await page.locator('#parse').isDisabled());
  await page.evaluate(async()=>select(new File([],'empty.pdf')));assert.match(await page.locator('#status').textContent(),/文件为空/);
  const real=await browser.newPage();real.on('pageerror',e=>errors.push(e.message));await real.routeWebSocket(/\/ws$/,ws=>ws.close());await real.goto(base);
  if(process.env.LEGION_MIXED_PDF){
   const fixture=process.env.LEGION_MIXED_PDF;
   await real.locator('#pdf-file').setInputFiles(fixture);await real.locator('#parse').click();await real.locator('#result').waitFor();const army=await real.evaluate(()=>army);
   assert.equal(army.units.length,3);assert.equal(army.totals.pdfPoints,307);assert.equal(army.totals.weapons,4);assert.equal(army.totals.incomplete,false);assert.equal(Object.keys(army.pdfGlossary).length,9);assert(!army.reviewItems.some(r=>r.category==='parsing'));
   assert.deepEqual(army.units.map(u=>u.name),['Grand Moff Tarkin','Darth Vader','Stormtroopers']);assert(army.pdfGlossary.compel.startsWith('After another'));assert(!army.pdfGlossary.compel.includes('Contempt'));
   const python=JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json;from pathlib import Path;sys.path.insert(0,'armylist-app');from parser import parse_pdf;p=Path(sys.argv[1]);print(json.dumps(parse_pdf(p.read_bytes(),p.name)))",fixture],{encoding:'utf8'}));
   const rounded=u=>({...u,provenance:{...u.provenance,bbox:u.provenance.bbox.map(v=>Math.round(v*1000)/1000)}});
   assert.deepEqual(army.totals,python.totals);assert.deepEqual(army.units.map(rounded),python.units.map(rounded));assert.deepEqual(army.pdfGlossary,python.pdfGlossary);
   await real.locator('#preview').click();await real.locator('.unit').first().waitFor();assert.equal(await real.locator('.unit').count(),3);assert.equal(await real.locator('#review-items').count(),0);await real.goto(base);
  }
  if(process.env.LEGION_OUTLINED_PDF){
   const requests=[];real.on('request',r=>requests.push(r.url()));await real.locator('#pdf-file').setInputFiles(process.env.LEGION_OUTLINED_PDF);await real.locator('#parse').click();await real.locator('#status.error').waitFor({timeout:60000});
   assert.match(await real.locator('#status').textContent(),/没有可提取的文字层.*未启用 OCR/);assert.equal(await real.locator('#result').isVisible(),false);assert(!requests.some(url=>/ocr|tesseract|traineddata/.test(url)));
   const message=execFileSync('python',['-X','utf8','-c',"import sys;from pathlib import Path;sys.path.insert(0,'armylist-app');from parser import parse_pdf;p=Path(sys.argv[1]);\ntry:parse_pdf(p.read_bytes(),p.name)\nexcept ValueError as e:print(e)",process.env.LEGION_OUTLINED_PDF],{encoding:'utf8'}).trim();assert.equal(await real.locator('#status').textContent(),message);
  }
  assert.deepEqual(errors,[]);console.log('PASS: immediate byte snapshot; reader fallback and denied access; stale selection; reselect same file; worker transfer/retry; file limits; optional mixed-page PDF parity and no-text diagnosis without OCR.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
