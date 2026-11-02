// Real PDFs are supplied outside the repository; never commit fixtures or outputs.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
(async()=>{
  const browser=await chromium.launch(),errors=[],requests=[],out=await fs.mkdtemp(path.join(os.tmpdir(),'legion-public-smoke-'));
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
    await page.routeWebSocket(/\/ws$/,ws=>ws.close());page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
    await page.goto(base);await page.locator('#catalog-status').filter({hasText:'503'}).waitFor();
    assert.equal(await page.locator('#catalog-file,[data-sample]').count(),0);
    const catalog=await page.evaluate(async()=>await(await fetch('catalog.json')).json());
    assert.equal(catalog.commands.length,183);assert(catalog.keywords.length>=154);
    assert(!(JSON.stringify(catalog).includes('ocrEvidence')));assert(!(JSON.stringify(catalog).includes('referenceUrl')));
    for(const target of ['samples/test_armylist.pdf','unitcards/test.webp','tactical_card_origin/test.pdf','catalog-store.mjs']){
      const response=await page.request.get(new URL(target,base).href);assert.equal(response.status(),404,target);
    }
    if(process.env.LEGION_FIXTURE_DIR){
      for(const [name,points]of [['test_armylist.pdf',577],['test_armylist2.pdf',600]]){
        await page.locator('#pdf-file').setInputFiles(path.join(process.env.LEGION_FIXTURE_DIR,name));await page.locator('#parse').click();await page.locator('#result').waitFor();
        assert.equal(await page.evaluate(()=>army.totals.pdfPoints),points);assert.equal(await page.evaluate(()=>army.commandCards.length),6);
        assert(await page.evaluate(()=>army.units.every(u=>u.upgrades.every(c=>c.match==='local_catalog'))));
      }
      const download=page.waitForEvent('download');await page.locator('#download-html').click();const file=await download;
      const html=path.join(out,'army.html');await file.saveAs(html);
      const offline=await browser.newPage({viewport:{width:390,height:844}});offline.on('pageerror',e=>errors.push(e.message));await offline.route(/^https?:/,r=>r.abort());await offline.goto(pathToFileURL(html).href);
      assert.equal(await offline.locator('.unit').count(),6);assert.equal(await offline.locator('#points').textContent(),'600');await offline.locator('#unit-2 > summary').click();
      const tactical=offline.locator('#unit-2 .unit-body > .timing-rule-list [data-rule-id=tactical]');assert.equal(await tactical.count(),1);await tactical.click();assert.match(await offline.locator('#pop-upgrades').textContent(),/技师/);await offline.keyboard.press('Escape');
      await offline.locator('#show-commands').click();await offline.locator('.command-card [data-set-state=played]').first().click();assert.equal(await offline.locator('.command-card').first().getAttribute('data-play-state'),'played');
      assert(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    assert(requests.every(r=>r.method==='GET'&&new URL(r.url).origin===new URL(base).origin));assert.deepEqual(errors,[]);
    console.log('PASS: minimal deployed assets; automatic runtime mappings; no extra catalog upload; GET only; optional external real-PDF fixtures; offline rules, states and mobile layout.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
