const container=document.querySelector('#studies');
try{
 const response=await fetch('data.json');if(!response.ok)throw Error('Unable to load study data');const records=await response.json();container.textContent='';
 for(const r of records){const article=document.createElement('article');article.dataset.study=r.id;const title=document.createElement('h2');title.textContent=r.label;article.append(title);const meta=document.createElement('div');meta.className='meta';for(const value of [r.kind,r.geometry,r.surface,'Face shift '+(r.faceShift*100).toFixed(1)+'%']){const s=document.createElement('span');s.textContent=value;meta.append(s);}article.append(meta);
  for(const [cls,views]of [['grid',['input','front','run']],['extra',['side','back','attack']]]){const grid=document.createElement('div');grid.className=cls;for(const v of views){if(!r.images[v])continue;const f=document.createElement('figure'),im=document.createElement('img'),c=document.createElement('figcaption');im.src=r.images[v].path;im.alt=r.label+' — '+v;im.loading='lazy';c.textContent={input:'01 / Input reference',front:'02 / Corrected + rigged',run:'03 / Running pose',side:'Side inspection',back:'Rear inspection',attack:'Attack pose'}[v];f.append(im,c);grid.append(f);}article.append(grid);}
  const note=document.createElement('p');note.className='limit';note.textContent=r.limitations;article.append(note);container.append(article);
 }
 for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{for(const b of document.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b===button));for(const a of document.querySelectorAll('[data-study]'))a.hidden=button.dataset.filter!=='all'&&a.dataset.study!==button.dataset.filter;};
}catch(e){container.textContent=e.message;}
