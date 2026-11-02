// Resolve the runnable site before loading the application or PDF dependencies.
(()=>{
  const scriptUrl=new URL(document.currentScript.src);
  const built=document.querySelector('meta[name="legion-site"]')?.content==='built-v1';
  const status=document.querySelector('#status');
  function explain(message){
    status.textContent=message;status.classList.add('error');
    document.querySelector('#local-setup').hidden=false;
    document.querySelector('#catalog-status').textContent='入口尚未启动，请按上方步骤准备本地站点。';
  }
  if(location.protocol==='file:'){
    document.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    explain('请使用 Live Server 打开 dist/index.html；直接双击入口文件无法加载 PDF 模块。');return;
  }
  if(built){
    const script=document.createElement('script');script.src=new URL('entry.js',scriptUrl).href;
    script.onerror=()=>explain('入口脚本加载失败。请重新运行 npm run build，并刷新 dist/index.html。');
    document.body.append(script);return;
  }
  document.querySelectorAll('button,input').forEach(el=>el.disabled=true);
  status.textContent='正在定位已构建的本地站点…';
  const target=new URL('../../dist/index.html',scriptUrl);
  fetch(target,{cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error('Build missing');
    const html=await response.text();
    if(!html.includes('<meta name="legion-site" content="built-v1">'))throw new Error('Build missing or outdated');
    location.replace(target.href);
  }).catch(()=>explain('当前打开的是源码目录，缺少运行所需的 PDF.js 和中文卡库。请先构建，再通过 Live Server 打开 dist/index.html。'));
})();
