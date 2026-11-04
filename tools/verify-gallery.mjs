import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const base=process.env.GALLERY_URL||'http://127.0.0.1:5208/artifacts/gallery-site/';const browser=await chromium.launch();mkdirSync('artifacts/gallery',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.glb'))requests.push(r.url());});
 await page.goto(base+'?test');await page.waitForFunction(()=>window.__gallery);assert.equal(await page.locator('[data-study]').count(),12);assert.equal(requests.length,0);
 await page.locator('[data-filter="sd"]').click();assert.equal(await page.locator('[data-study]:visible').count(),6);await page.locator('[data-filter="all"]').click();
 for(let i=0;i<12;i++){
  await page.evaluate(i=>window.__gallery.open(window.__gallery.records[i]),i);await page.waitForFunction(()=>document.querySelector('#model-dialog').dataset.state!=='loading',null,{timeout:60000});assert.equal(await page.locator('#model-dialog').getAttribute('data-state'),'ready');assert((await page.locator('#animation option').count())>1);
  if(i===0){
   const before=await page.evaluate(()=>window.__gallery.getViewer().state().camera);const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5,{steps:12});await page.mouse.up();assert.notDeepEqual(await page.evaluate(()=>window.__gallery.getViewer().state().camera),before);
   await page.mouse.wheel(0,-300);await page.locator('#animation').selectOption({index:1});assert(await page.evaluate(()=>window.__gallery.getViewer().state().playing));await page.screenshot({path:'artifacts/gallery/interactive.png'});
  }
  await page.evaluate(()=>{const viewer=window.__gallery.getViewer();window.__gallery.close();if(!viewer.state().dead)throw Error('Viewer not disposed');});assert.equal(await page.locator('canvas').count(),0);
 }
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>window.__gallery.open(window.__gallery.records[1]));await page.waitForFunction(()=>document.querySelector('#model-dialog').dataset.state==='ready');assert(await page.evaluate(()=>document.querySelector('#model-dialog').scrollWidth<=document.querySelector('#model-dialog').clientWidth));await page.screenshot({path:'artifacts/gallery/mobile-viewer.png'});await page.evaluate(()=>window.__gallery.close());assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,base,models:12,lazyLoading:true,rotation:true,motion:true,dispose:true,mobile:true}));
}finally{await browser.close();}
