const $=q=>document.querySelector(q);
let file=null,army=null,busy=false;
let parserPromise;
const parser=()=>parserPromise??=import('./pdf-parser.mjs').catch(e=>{parserPromise=null;console.error('PDF module load failed',e);throw new Error('PDF 解析组件加载失败。请在项目根目录运行 npm ci --ignore-scripts 和 npm run build，再通过 Live Server 打开 dist/index.html；部署时需复制完整的 dist 目录。')});
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error)};
const valid=data=>{if(data?.schema!=='legion-army/v2'||!Array.isArray(data.units)||!data.units.length||!Array.isArray(data.commandCards))throw new Error('JSON 必须是本项目输出的 legion-army/v2 格式。');return data};
function select(f){if(!f)return;file=f;$('#selected-file').textContent=f.name;$('#parse').disabled=busy;status('文件已选择，点击提取。')}
function setBusy(value){busy=value;document.querySelectorAll('button').forEach(b=>b.disabled=value);$('#parse').disabled=value||!file}
function show(data){army=valid(data);$('#result').hidden=false;$('#source-name').textContent=army.source.pdf;$('#metrics').replaceChildren();for(const [label,value]of [['单位条目',army.units.length],['费用合计',army.totals.pdfPoints],['武器',army.totals.weapons],['战术卡',army.commandCards.length]]){const el=document.createElement('div');const b=document.createElement('b');b.textContent=value;const span=document.createElement('span');span.textContent=label;el.append(b,span);$('#metrics').append(el)}const diagnostics=army.diagnostics||[];$('#diagnostics-title').textContent='解析记录 · '+diagnostics.length+' 项提示';$('#diagnostics').replaceChildren();for(const item of diagnostics){const li=document.createElement('li');li.textContent=item.message;$('#diagnostics').append(li)}$('#json-preview').textContent=JSON.stringify(army,null,2);status('军表数据已就绪；未提供本地译文的条目保留原文。')}
async function request(url,opts){const r=await fetch(url,opts);if(!r.ok){let error;try{error=await r.json()}catch{}throw new Error(error?.error||'请求失败：'+r.status)}return r}
$('#pdf-file').addEventListener('change',e=>select(e.target.files[0]));
const panel=$('.upload-panel');panel.addEventListener('dragover',e=>{e.preventDefault();panel.classList.add('dragging')});panel.addEventListener('dragleave',()=>panel.classList.remove('dragging'));panel.addEventListener('drop',e=>{e.preventDefault();panel.classList.remove('dragging');if(!busy)select(e.dataTransfer.files[0])});
async function parseFile(f){const {parsePdf}=await parser();return parsePdf(await f.arrayBuffer(),f.name,message=>status(message))}
$('#parse').addEventListener('click',async()=>{if(!file||busy)return;setBusy(true);$('#result').hidden=true;army=null;status('正在浏览器内解析 PDF、关联中文数据…');try{show(await parseFile(file))}catch(e){status(e.message,true)}finally{setBusy(false)}});
$('#json-file').addEventListener('change',async e=>{try{show(JSON.parse(await e.target.files[0].text()))}catch(error){status(error.message,true)}});
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
$('#download-json').addEventListener('click',()=>{if(army)download(JSON.stringify(army,null,2),'application/json','armylist.json')});
$('#download-html').addEventListener('click',async()=>{if(!army||busy)return;setBusy(true);try{
  const data=JSON.stringify(army).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const [template,css,js]=await Promise.all(['roster.html','style.css','roster.js'].map(async url=>(await request(url)).text()));
  // Live Server injects a development WebSocket script into served HTML.
  // It must not be copied into a standalone offline army roster.
  const cleanTemplate=template.replace(/<!-- Code injected by live-server -->\s*<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const html=cleanTemplate.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>')
    .replace('<!--ARMY_DATA-->',()=>'<script>window.ARMY_DATA='+data+';</script>')
    .replace('<script src="roster.js"></script>',()=>'<script>'+js+'</script>');
  download(html,'text/html','armylist.zh.html');
}catch(e){status(e.message,true)}finally{setBusy(false)}});
$('#preview').addEventListener('click',()=>{try{sessionStorage.setItem('legion-current-army',JSON.stringify(army));location.href='roster.html'}catch{status('浏览器无法暂存数据，请下载 JSON 后在军表页导入。',true)}});
request('catalog.json').then(r=>r.json()).then(c=>$('#catalog-status').textContent=c.upgrades.length+' 张升级卡映射 · '+c.commands.length+' 张战术卡映射 · '+c.keywords.length+' 个词条；自动载入，无需额外上传。').catch(()=>status('运行映射加载失败，请重新构建并发布完整 dist 目录。',true));
