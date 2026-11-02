// Presentation only. Retain unrecognized user data without adding it to catalogs.
window.LegionReview={render(container,army){
  const items=army.reviewItems||[],labels={parsing:'无法完整解析',keyword:'未匹配词条',upgrade:'未匹配升级卡',command:'未匹配战术卡'};
  container.replaceChildren();container.hidden=!items.length;if(!items.length)return;
  const summary=document.createElement('summary');summary.textContent='待核对内容 · '+items.length+' 项';container.append(summary);
  const intro=document.createElement('p');intro.className='review-intro';intro.textContent='未匹配内容保留原文；可读的单位照常导入。下列条目可集中核对或下载。';container.append(intro);
  const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='下载待核对内容 JSON';download.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({source:army.source.pdf,items},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='armylist-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  });container.append(download);
  const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item)}
  for(const [category,list]of [...groups].sort((a,b)=>Object.keys(labels).indexOf(a[0])-Object.keys(labels).indexOf(b[0]))){
    const section=document.createElement('section');section.className='review-group';section.dataset.category=category;
    const title=document.createElement('h3');title.textContent=(labels[category]||'其他待核对内容')+' · '+list.length;section.append(title);
    for(const item of list){
      const article=document.createElement('article');article.className='review-item';
      const name=document.createElement('h4');name.textContent=item.title;article.append(name);
      const message=document.createElement('p');message.textContent=item.message;article.append(message);
      const locations=document.createElement('ul');locations.className='review-locations';
      for(const loc of item.locations||[]){const li=document.createElement('li');li.textContent=[loc.page?'PDF 第 '+loc.page+' 页':'',loc.unitName,loc.context].filter(Boolean).join(' · ');locations.append(li)}article.append(locations);
      if(item.rawText){const raw=document.createElement('details'),label=document.createElement('summary'),text=document.createElement('pre');label.textContent='原始文字';text.textContent=item.rawText;raw.append(label,text);article.append(raw)}
      section.append(article);
    }
    container.append(section);
  }
}};
