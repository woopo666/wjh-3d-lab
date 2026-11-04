const container=document.querySelector('#studies'),dialog=document.querySelector('#model-dialog'),host=document.querySelector('#model-stage'),status=document.querySelector('#model-status'),animation=document.querySelector('#animation');
let records=[],viewer=null,opening=0,filter='all',query='';
function node(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
function figure(record,key,label){const f=node('figure'),im=node('img');im.src=record.images[key].path;im.alt=record.label+' — '+key;im.loading='lazy';f.append(im,node('figcaption',label));return f;}
function closeViewer(){opening++;viewer?.dispose();viewer=null;dialog.close();host.replaceChildren();dialog.dataset.state='closed';}
document.querySelector('#close-viewer').onclick=closeViewer;dialog.addEventListener('cancel',e=>{e.preventDefault();closeViewer();});dialog.addEventListener('click',e=>{if(e.target===dialog)closeViewer();});
document.querySelector('#reset-view').onclick=()=>viewer?.reset();document.querySelector('#auto-rotate').onchange=e=>viewer?.autoRotate(e.target.checked);animation.onchange=()=>viewer?.animate(animation.value);
async function openViewer(record){
 const ticket=++opening;viewer?.dispose();viewer=null;host.replaceChildren();dialog.dataset.state='loading';document.querySelector('#model-title').textContent=record.label;status.textContent='Loading 3D viewer…';animation.replaceChildren(new Option('Still / 정지',''));document.querySelector('#auto-rotate').checked=false;document.querySelector('#download-model').href=record.model.path;if(!dialog.open)dialog.showModal();
 try{const {createViewer}=await import('./viewer.js');if(ticket!==opening)return;viewer=createViewer(host,s=>{if(ticket!==opening)return;dialog.dataset.state=s.state;status.textContent=s.state==='loading'?'Downloading model…':s.state==='error'?s.message:`${s.triangles.toLocaleString()} triangles · Drag to rotate · Scroll / pinch to zoom`;if(s.clips)for(const c of s.clips)animation.add(new Option(c,c));});await viewer.load(record);}catch(e){if(ticket!==opening)return;dialog.dataset.state='error';status.textContent='3D unavailable: '+e.message;}
}
function applyFilter(){let count=0;for(const article of document.querySelectorAll('[data-study]')){const visible=(filter==='all'||article.dataset.group===filter)&&article.dataset.study.includes(query);article.hidden=!visible;if(visible)count++;}document.querySelector('#study-count').textContent=count+' / '+records.length+' studies';}
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.setAttribute('aria-pressed',String(x===b));applyFilter();};
document.querySelector('#study-search').oninput=e=>{query=e.target.value.toLowerCase().trim();applyFilter();};
try{
 const response=await fetch('data.json');if(!response.ok)throw Error('Unable to load study data');records=await response.json();container.replaceChildren();
 for(const r of records){const article=node('article');article.dataset.study=r.id;article.dataset.group=r.group;article.append(node('h2',r.label));const meta=node('div',null,'meta');for(const value of [r.geometry,r.surface])meta.append(node('span',value));article.append(meta);
  const grid=node('div',null,'pair');grid.append(figure(r,'input','Input reference'),figure(r,'front','Corrected + rigged'));article.append(grid);
  const button=node('button',`Explore 3D ↗ · ${(r.model.bytes/1048576).toFixed(1)} MB`,'open-model');button.dataset.model=r.id;button.onclick=()=>openViewer(r);article.append(button);
  const details=node('details'),summary=node('summary','Historical pose renders');details.append(summary);const extra=node('div',null,'extra');for(const v of ['side','back','run','attack'])if(r.images[v])extra.append(figure(r,v,v));details.append(extra);article.append(details,node('p',r.limitations,'limit'));container.append(article);
 }
 applyFilter();
 if(new URLSearchParams(location.search).has('test'))window.__gallery={records,getViewer:()=>viewer,open:openViewer,close:closeViewer};
}catch(e){container.textContent=e.message;}
