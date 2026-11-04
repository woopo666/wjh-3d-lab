import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {fableClips} from '../src/fable-characters.js';
import {smoothWeights} from './rig-roster-character.js';

// A genuine four-paw skeleton: the rear feet belong behind the front legs,
// and the large face/hair moves as one head rather than as a human abdomen.
export async function rigDoroCharacter(url,config){
 const input=await new GLTFLoader().loadAsync(url),scene=new THREE.Group(),h=config.height;
 input.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(input.scene),center=box.getCenter(new THREE.Vector3()),scale=h/(box.max.y-box.min.y),parts=[];let material;
 const transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
 input.scene.traverse(o=>{if(o.isMesh){parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform));material??=o.material.clone();}});
 const geometry=parts.length===1?parts[0]:mergeGeometries(parts,false),bones=[],joints={},starts={},ends={};
 function add(name,parent,p,e){const b=new THREE.Bone();b.name=name;const up=parent?joints[parent]:scene,point=new THREE.Vector3(...p).multiplyScalar(h);starts[name]=point;ends[name]=new THREE.Vector3(...e).multiplyScalar(h);scene.updateMatrixWorld(true);b.position.copy(up.worldToLocal(point.clone()));up.add(b);bones.push(b);joints[name]=b;scene.updateMatrixWorld(true);}
 const profile=config.quadruped||{},frontZ=profile.frontZ??.20,rearZ=profile.rearZ??-.24,legX=profile.legX??.19;
 add('Hips',null,[0,.29,rearZ],[0,.35,0]);add('Chest','Hips',[0,.35,.05],[0,.47,frontZ]);add('Head','Chest',[0,.47,frontZ],[0,.86,frontZ]);
 add('Hair','Head',[0,.8,0],[0,.45,0]);add('Cape','Chest',[0,.35,-.10],[0,.22,-.10]);add('Tail','Hips',[0,.3,rearZ-.08],[0,.38,rearZ-.22]);
 for(const [side,s]of [['R',-1],['L',1]]){
  const x=s*legX;
  add('UpperArm'+side,'Chest',[x,.32,frontZ],[x,.20,frontZ]);add('LowerArm'+side,'UpperArm'+side,[x,.20,frontZ],[x,.075,frontZ+.02]);
  add('HandSlot'+side,'LowerArm'+side,[x,.075,frontZ+.02],[x,.055,frontZ+.07]);add('Fingers'+side,'HandSlot'+side,[x,.055,frontZ+.05],[x,.055,frontZ+.075]);add('FingerTips'+side,'Fingers'+side,[x,.055,frontZ+.075],[x,.055,frontZ+.10]);
  add('Thigh'+side,'Hips',[x,.30,rearZ],[x,.18,rearZ]);add('Shin'+side,'Thigh'+side,[x,.18,rearZ],[x,.07,rearZ+.015]);add('Foot'+side,'Shin'+side,[x,.07,rearZ+.015],[x,.04,rearZ+.08]);
 }
 const indices=Object.fromEntries(bones.map((b,i)=>[b.name,i])),skeleton=new THREE.Skeleton(bones);scene.updateMatrixWorld(true);skeleton.calculateInverses();
 const p=geometry.attributes.position,si=new Uint16Array(p.count*4),sw=new Float32Array(p.count*4),v=new THREE.Vector3(),line=new THREE.Line3(),near=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);const y=v.y/h,z=v.z/h,side=v.x<0?'R':'L';
  let choices;
  if(y>.45)choices=['Head'];
  else if(y<.27&&Math.abs(v.x)>h*.07)choices=z>(frontZ+rearZ)*h*.5?['UpperArm'+side,'LowerArm'+side,'HandSlot'+side,'Chest']:['Thigh'+side,'Shin'+side,'Foot'+side,'Hips'];
  else choices=['Head','Chest','Hips'];
  const scores=choices.map(n=>{line.set(starts[n],ends[n]);line.closestPointToPoint(v,true,near);const d=v.distanceToSquared(near);return[indices[n],-d/(h*h*.004)];}).sort((a,b)=>b[1]-a[1]).slice(0,4),m=scores[0][1],sum=scores.reduce((a,b)=>a+Math.exp(b[1]-m),0);
  for(let k=0;k<scores.length;k++){si[i*4+k]=scores[k][0];sw[i*4+k]=Math.exp(scores[k][1]-m)/sum;}
 }
 smoothWeights(geometry,si,sw,bones.length,h*.53);geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 material.name='Doro-atlas';material.userData={trellis2:true,atlasPalette:true,cartoonSoftness:.4,paletteHeadY:h*.48};material.metalness=0;material.roughness=.82;if(material.map)material.map.userData.mimeType='image/webp';
 const mesh=new THREE.SkinnedMesh(geometry,material);scene.add(mesh);mesh.bind(skeleton);mesh.normalizeSkinWeights();mesh.frustumCulled=false;
 const rest=new Map(bones.map(b=>[b,{p:b.position.clone(),q:b.quaternion.clone()}])),animations=[];
 for(const template of fableClips('sera',h*.29)){
  const name=template.name,walk=/Walking|Running|Crawl_Walk|Exhausted_Walk/.test(name),run=/Running/.test(name),attack=/Attack|Shoot|Throw/.test(name),block=/Block/.test(name),hit=name==='Hit_A',dead=/Death/.test(name),spell=/Spellcast/.test(name),duration=walk?(run?.65:1.05):dead?1.1:attack?.85:block?.7:hit?.55:2.2;
  const times=[],rot=new Map(bones.map(b=>[b,[]])),pos=new Map(bones.map(b=>[b,[]]));
  for(let k=0;k<=32;k++){
   const t=k/32,w=Math.sin(t*Math.PI*2),pulse=Math.sin(t*Math.PI);
   for(const[b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);}
   joints.Head.rotation.x=hit?pulse*.12:walk?w*.025:spell?-pulse*.08:0;joints.Head.rotation.z=dead?-.18*t:hit?w*.06:0;
   joints.Hips.position.y+=h*(dead?-.045*t:walk?Math.abs(w)*.006:0);joints.Chest.rotation.y=attack?pulse*.09:0;joints.Tail.rotation.y=w*.12;
   for(const[side,s]of [['R',1],['L',-1]]){
    const phase=w*s,a=joints['UpperArm'+side],leg=joints['Thigh'+side];
    if(walk){a.rotation.x=phase*(run?.28:.18);leg.rotation.x=-phase*(run?.28:.18);joints['LowerArm'+side].rotation.x=Math.max(0,-phase)*.13;joints['Shin'+side].rotation.x=Math.max(0,phase)*.13;}
    if(attack&&side==='R'){const wind=THREE.MathUtils.smoothstep(t,0,.28),strike=THREE.MathUtils.smoothstep(t,.28,.52),recover=THREE.MathUtils.smoothstep(t,.58,1),heavy=/Chop|Diagonal/.test(name),sweep=/Sweep|Backhand/.test(name);a.rotation.x=THREE.MathUtils.lerp(0,heavy?-1.35:-.95,wind)*(1-recover)+strike*.42*(1-recover);a.rotation.y=sweep?pulse*.60:0;joints['LowerArm'+side].rotation.x=-pulse*.22;joints['HandSlot'+side].rotation.x=-pulse*.25;}
    if(block&&side==='L'){a.rotation.x=-pulse*.82;joints['LowerArm'+side].rotation.x=-pulse*.20;}
    if(spell)a.rotation.x=-pulse*.3;
   }
   times.push(t*duration);for(const b of bones){rot.get(b).push(...b.quaternion.toArray());pos.get(b).push(...b.position.toArray());}
  }
  animations.push(new THREE.AnimationClip(name,duration,bones.flatMap(b=>[new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,rot.get(b)),new THREE.VectorKeyframeTrack(b.name+'.position',times,pos.get(b))])));
 }
 for(const[b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);}scene.updateMatrixWorld(true);
 scene.name=config.id;scene.userData={author:'GFD',sourceCharacter:config.id,prone:true,deathDrop:0,weaponSocketRotation:[0,0,0],weaponGrip:[0,.025*h,.04*h],generator:'TRELLIS.2; fitted quadruped skeleton'};
 return{scene,animations,report:{id:config.id,body:'prone',vertices:p.count,triangles:(geometry.index?.count||p.count)/3,bones:bones.length,clips:animations.length,height:h,weaponGrip:scene.userData.weaponGrip,joints:Object.fromEntries(Object.entries(starts).map(([n,p])=>[n,p.toArray()]))}};
}
