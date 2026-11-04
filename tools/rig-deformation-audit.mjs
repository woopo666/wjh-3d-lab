import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
globalThis.ProgressEvent??=class{constructor(type,init){Object.assign(this,{type},init);}};
export async function loadRig(path){
 const buffer=readFileSync(path),length=buffer.readUInt32LE(12),doc=JSON.parse(buffer.toString('utf8',20,20+length)),binary=buffer.subarray(28+length);
 delete doc.images;delete doc.textures;delete doc.materials;for(const m of doc.meshes)for(const p of m.primitives)delete p.material;
 doc.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');
 return new GLTFLoader().parseAsync(JSON.stringify(doc),'');
}
export function deformation(asset,samples=[['Idle',.22],['Walking_A',.32],['2H_Melee_Attack_Chop',.32],['2H_Melee_Attack_Chop',.48],['Block_Hit',.4],['Vigorous_Idle',.4]]){
 let mesh;asset.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index.array;
 const h=geometry.boundingBox?.getSize(new THREE.Vector3()).y||2.25,mixer=new THREE.AnimationMixer(asset.scene),v=new THREE.Vector3(),posed=new Float32Array(positions.count*3),edges=[];
 for(let t=0;t<index.length;t+=9){const a=index[t],b=index[t+1],c=index[t+2];for(const [u,w]of [[a,b],[b,c],[c,a]]){v.fromBufferAttribute(positions,u);const rest=v.distanceTo(new THREE.Vector3().fromBufferAttribute(positions,w));if(rest>h*.001)edges.push({u,w,rest});}}
 const results=[];
 for(const [name,fraction]of samples){
  mixer.stopAllAction();const clip=asset.animations.find(c=>c.name===name);mixer.clipAction(clip).play();mixer.update(clip.duration*fraction);asset.scene.updateMatrixWorld(true);mesh.skeleton.update();
  for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,v);v.toArray(posed,i*3);}
  const ratios=edges.map(({u,w,rest})=>Math.hypot(posed[u*3]-posed[w*3],posed[u*3+1]-posed[w*3+1],posed[u*3+2]-posed[w*3+2])/rest).sort((a,b)=>a-b);
  results.push({name,fraction,edges:ratios.length,compressed:ratios.filter(x=>x<.5).length,stretched:ratios.filter(x=>x>2).length,p01:ratios[Math.floor(ratios.length*.01)],p99:ratios[Math.floor(ratios.length*.99)],max:ratios.at(-1)});
 }
 mixer.stopAllAction();return results;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/rig-deformation-audit.mjs')){
 const roster=JSON.parse(readFileSync('artifacts/v0423/roster.json','utf8')),selected=new Set(process.argv.slice(2)),report=[];
 for(const c of roster.filter(c=>!selected.size||selected.has(c.id))){const asset=await loadRig('public/assets/characters/'+c.asset),poses=deformation(asset);report.push({id:c.id,poses,score:Math.max(...poses.map(p=>p.compressed+p.stretched))});asset.scene.traverse(o=>o.geometry?.dispose());}
 report.sort((a,b)=>b.score-a.score);mkdirSync('artifacts/v0424',{recursive:true});writeFileSync('artifacts/v0424/deformation-before.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.slice(0,18).map(({id,score,poses})=>({id,score,poses:poses.map(p=>({name:p.name,fraction:p.fraction,bad:p.compressed+p.stretched,p99:p.p99}))})),null,2));
}
