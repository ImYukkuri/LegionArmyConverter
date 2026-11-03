// Synthetic geometry is public; optional real PDFs stay outside the repository.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.STATIC_BASE_URL||'http://127.0.0.1:5500/dist/';
const semantic=u=>Object.fromEntries(['name','subtitle','rank','points','stats','weapons','keywords','fromUpgrades','upgrades','zh'].filter(k=>k in u).map(k=>[k,u[k]]));
const pythonPdf=file=>JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json,logging;from pathlib import Path;logging.getLogger('pdfminer').setLevel(logging.ERROR);sys.path.insert(0,'armylist-app');from parser import parse_pdf;p=Path(sys.argv[1]);print(json.dumps(parse_pdf(p.read_bytes(),p.name)))",file],{encoding:'utf8',maxBuffer:12*1024*1024}));
(async()=>{
  const b=await chromium.launch();try{
    const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.routeWebSocket(/\/ws$/,ws=>ws.close());await p.goto(base);
    const synthetic=await p.evaluate(async()=>{
      const m=await import('./pdf-parser.mjs'),t=(text,x,y,width,height=10,font='body')=>({text,x,y,width,height,font});
      const box=[0,0,400,260],xs=[10,48,86,124,162,200,295,390],headers=['Mini','HP','Def','Cor','Spd','Hit Surge','Def Surge'],values=['1','5','Red','2','2','Hit','Block'];
      const geo={items:[t('Example Leader — A Long Title',10,20,290,14,'heading'),t('CORPS · 35 pts',310,20,80,10),
        ...headers.map((s,i)=>t(s,xs[i]+2,52,xs[i+1]-xs[i]-4)),...values.map((s,i)=>t(s,xs[i]+2,73,Math.min(28,xs[i+1]-xs[i]-4))),
        t('Weapon',12,96,100),t('Range',182,96,40),t('Dice',232,96,40),t('Keywords',292,96,96),
        t('Test Blaster',12,117,100),t('1-3',182,117,30),t('2R 1B',232,117,45),t('Test Rule 1',292,117,90),
        t('Test Blade',12,143,100),t('0',182,143,10),t('2W',232,143,20),
        t('Keywords:',10,177,60),t('Direct Vehicle, Equip Armament, Doctrine',72,177,260),
        t('From upgrades:',10,196,90),t('Target 1',104,196,45),t('Upgrades:',10,215,60),t('Example Upgrade',72,215,100)],
        rects:[...headers.flatMap((_,i)=>[[xs[i],40,xs[i+1],60],[xs[i],60,xs[i+1],82]]),[10,85,180,103],[180,85,230,103],[230,85,290,103],[290,85,390,103]],
        edges:[[10,103,180,103],[10,130,180,130],[10,155,180,155]]};
      const review=[],whole=m.parseUnitPanel(geo,box,1,1,review);
      const fragment=item=>{const step=item.width/item.text.length;return [...item.text].map((c,i)=>({...item,text:c,x:item.x+i*step,width:step,font:/[a-m]/i.test(c)?'subset-a':/[n-z]/i.test(c)?'subset-b':'punctuation'}))};
      const fragments={...geo,items:geo.items.flatMap(fragment).reverse()},fragmentReview=[],split=m.parseUnitPanel(fragments,box,1,1,fragmentReview);
      const scaled=[.75,1.4].map(scale=>{const q={items:fragments.items.map(t=>({...t,x:t.x*scale,y:t.y*scale,width:t.width*scale,height:t.height*scale})),rects:geo.rects.map(b=>b.map(x=>x*scale)),edges:geo.edges.map(b=>b.map(x=>x*scale))};return m.parseUnitPanel(q,box.map(x=>x*scale),1,1,[])});
      const headingFonts=new Set(['subset-a','subset-b']),row=(text,pieces)=>({text,items:pieces.map(([text,font])=>({text,font}))});
      const headingCases=[row('Unmapped Rule 2. Retained original rule.',[['Unmapped','subset-a'],['Rule','subset-b'],['2','numeric-only'],['.','punctuation'],['Retained original rule.','body']]),
        row('This is a sentence. It continues.',[['This is a sentence.','body']]),row('Mixed Role. Not a heading.',[['Mixed','subset-a'],['Role','body'],['.','punctuation']])];
      const commandBox=[0,0,400,200],commandItems=[t('Example Order? (2-',10,23,220,14,'heading'),t('pip)',10,43,35,14,'heading'),t('Example Owner',280,23,105,10),t('2 units',10,87,65),t('Retained card text.',10,115,150)];
      const commandGeo={items:commandItems,rects:[[5,65,395,90]],edges:[]},command=m.parseCommandPanel(commandGeo,commandBox,2,1),fragmentCommand=m.parseCommandPanel({...commandGeo,items:commandItems.flatMap(fragment).reverse()},commandBox,2,1);
      return {whole,split,scaled,review,fragmentReview,headings:headingCases.map(r=>m.glossaryHeading(r,headingFonts)),command,fragmentCommand};
    });
    assert.deepEqual(synthetic.review,[]);assert.deepEqual(synthetic.fragmentReview,[]);
    assert.equal(synthetic.whole.subtitle,'A Long Title');assert.equal(synthetic.whole.stats.defenseSurge,'Block');assert.equal(synthetic.whole.weapons.length,2);
    assert.deepEqual(synthetic.whole.keywords,['Direct Vehicle','Equip Armament, Doctrine']);assert.deepEqual(synthetic.whole.fromUpgrades,['Target 1']);assert.deepEqual(synthetic.whole.upgrades,['Example Upgrade']);
    assert.deepEqual(semantic(synthetic.split),semantic(synthetic.whole));for(const u of synthetic.scaled)assert.deepEqual(semantic(u),semantic(synthetic.whole));
    assert.deepEqual(synthetic.headings,['Unmapped Rule 2',null,null]);assert.deepEqual(synthetic.fragmentCommand,synthetic.command);assert.equal(synthetic.command.pips,2);assert.equal(synthetic.command.owner,'Example Owner');
    const pythonHeadings=JSON.parse(execFileSync('python',['-X','utf8','-c',"import sys,json;sys.path.insert(0,'armylist-app');from parser import glossary_heading;cases=json.loads(sys.stdin.read());print(json.dumps([glossary_heading({'text':r['text'],'chars':[{'text':c,'fontname':f}for s,f in r['parts']for c in s]},{'subset-a','subset-b'})for r in cases]))"],{input:JSON.stringify([
      {text:'Unmapped Rule 2. Retained original rule.',parts:[['Unmapped','subset-a'],['Rule','subset-b'],['2','numeric-only'],['.','punctuation'],['Retained original rule.','body']]},
      {text:'This is a sentence. It continues.',parts:[['This is a sentence.','body']]},{text:'Mixed Role. Not a heading.',parts:[['Mixed','subset-a'],['Role','body'],['.','punctuation']]}
    ]),encoding:'utf8'}));assert.deepEqual(pythonHeadings,synthetic.headings);
    if(process.env.LEGION_MOBILE_PDF){
      const expected=pythonPdf(process.env.LEGION_MOBILE_PDF);
      await p.locator('#pdf-file').setInputFiles(process.env.LEGION_MOBILE_PDF);await p.locator('#parse').click();await p.locator('#result').waitFor();const army=await p.evaluate(()=>army);
      assert.equal(army.units.length,10);assert.equal(army.totals.pdfPoints,1000);assert.equal(army.totals.weapons,27);assert.equal(army.totals.incomplete,false);assert.equal(army.commandCards.length,0);assert.deepEqual(army.reviewItems,[]);
      assert.equal(Object.keys(army.pdfGlossary).length,44);assert.deepEqual(Object.keys(army.pdfGlossary).sort(),Object.keys(expected.pdfGlossary).sort());
      assert.deepEqual(army.units.map(semantic),expected.units.map(semantic));
      const normalize=s=>s.replace(/\s+/g,' ').replace(/\s+([.,:;])/g,'$1').trim();
      for(const [key,text]of Object.entries(expected.pdfGlossary))assert.equal(normalize(army.pdfGlossary[key]),normalize(text),key);
      assert.equal(army.units[0].subtitle,'Imperial High Command');assert(army.pdfGlossary.retinue.includes('Activation Phase'));assert(army.pdfGlossary.immune_range_1_weapons.includes('maximum Range'));
      if(process.env.LEGION_EMPIRE_PDF){const desktop=pythonPdf(process.env.LEGION_EMPIRE_PDF);assert.deepEqual(army.units.map(semantic),desktop.units.map(semantic))}
      await p.locator('#preview').click();await p.locator('.unit').first().waitFor();assert.equal(await p.locator('.unit').count(),10);await p.locator('#expand-all').click();assert.equal(await p.locator('.unit-weapons .weapon').count(),27);
      for(const width of [1280,390]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.locator('#review-items,#notes,.partial-unit-note').count(),0)}
    }
    assert.deepEqual(errors,[]);console.log('PASS: per-cell fragmented/shuffled/scaled text; complete long titles; multi-font and numeric glossary labels; wrapped commands; Python/browser parity; optional mobile PDF and viewer.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
