import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [stage,id]=process.argv.slice(2);if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('Invalid job id');
const dir=`jobs/${id}`,config=JSON.parse(readFileSync(dir+'/config.json','utf8'));
const isStatic=config.production?.morphology==='static';
const base=process.env.WJH_STUDIO_URL||'http://127.0.0.1:5208';
const browser=await chromium.launch({args:['--enable-gpu',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(stage==='rig'){
  await page.goto(base+'/authoring.html');
  const result=await page.evaluate(async({dir,config})=>{
   const module=config.body==='prone'?['rig-prone-character','rigProneCharacter']:config.body==='quadruped'?['rig-doro-character','rigDoroCharacter']:['rig-roster-character','rigRosterCharacter'];
   if(config.production?.morphology==='static'){
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');const asset=await new GLTFLoader().loadAsync('/'+dir+'/corrected.glb');let triangles=0;
    asset.scene.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;triangles+=(o.geometry.index?.count||p.count)/3;for(const x of p.array)if(!Number.isFinite(x))throw Error('Nonfinite geometry');}});
    if(!triangles||triangles>100000)throw Error('Static triangle budget exceeded (100k)');const r=await fetch('/'+dir+'/corrected.glb');const bytes=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return {data:btoa(s),report:{triangles,rig:'none',category:config.production.category}};
   }
   const build=(await import('/tools/'+module[0]+'.js'))[module[1]],asset=await build('/'+dir+'/corrected.glb',config);
   const {runningClip}=await import('/src/running-motion.js');const clip=runningClip(asset.scene,config);if(clip)asset.animations=asset.animations.map(c=>c.name==='Running_A'?clip:c);
   const {inspectGeneratedCharacter}=await import('/tools/generated-character-gate.js');asset.report.qualityGate=inspectGeneratedCharacter(asset);
   const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');const bytes=new Uint8Array(await new GLTFExporter().parseAsync(asset.scene,{binary:true,animations:asset.animations}));
   let str='';for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));return {data:btoa(str),report:asset.report};
  },{dir,config});writeFileSync(dir+'/rigged.glb',Buffer.from(result.data,'base64'));writeFileSync(dir+'/rig.json',JSON.stringify(result.report,null,2));
 }else if(stage==='review'){
  await page.goto(base+'/audit.html');await page.waitForFunction(()=>window.characterAudit?.ready);
  await page.evaluate(config=>characterAudit.load({...config,trellis2:true,url:'/jobs/'+config.id+'/rigged.glb'}),config);
  const poses=[['front','Idle',.2,0],['left','Idle',.2,Math.PI/2],['right','Idle',.2,-Math.PI/2],['back','Idle',.2,Math.PI],...(!isStatic?[['walk','Walking_A',.3,.6],['run','Running_A',.3,.6],['attack','2H_Melee_Attack_Chop',.5,.6],['block','Block_Hit',.4,.6],['death','Death_A',1,.6],['crawl','Crawl_Walk',.3,.6]]:[])];
  mkdirSync(dir+'/review',{recursive:true});for(const [name,clip,phase,angle]of poses){const png=await page.evaluate(({clip,phase,angle})=>{characterAudit.pose(clip,phase);return characterAudit.view(angle);},{clip,phase,angle});writeFileSync(dir+'/review/'+name+'.png',Buffer.from(png.split(',')[1],'base64'));}
  const report=isStatic?{...JSON.parse(readFileSync(dir+'/rig.json','utf8')),failures:[],poses:4}:await page.evaluate(()=>characterAudit.audit());report.errors=errors;report.rigSha256=createHash('sha256').update(readFileSync(dir+'/rigged.glb')).digest('hex');
  writeFileSync(dir+'/review/report.json',JSON.stringify(report,null,2));
  writeFileSync(dir+'/review/index.html','<!doctype html><meta charset="utf-8"><title>'+id+'</title><style>body{background:#19263d;color:white;font:16px sans-serif}img{width:320px}figure{display:inline-block;margin:8px}</style><h1>'+id+' — 외형 검토</h1><figure><img src="../front-cutout.png"><figcaption>Reference</figcaption></figure>'+poses.map(([name])=>'<figure><img src="'+name+'.png"><figcaption>'+name+'</figcaption></figure>').join(''));
  if(report.failures.length||errors.length)throw Error(JSON.stringify(report));console.log(JSON.stringify(report));
 }else throw Error('Unknown stage');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
