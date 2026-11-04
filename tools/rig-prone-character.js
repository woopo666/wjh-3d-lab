import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {fableClips} from '../src/fable-characters.js';
import {fitProneCombat} from './fit-prone-combat.js';
import {smoothWeights} from './rig-roster-character.js';

// Speki is authored on hands and knees. Never bend a standing human skeleton
// into this surface: the hips, short legs and head occupy different places.
export async function rigProneCharacter(url,config){
 const input=await new GLTFLoader().loadAsync(url),scene=new THREE.Group(),h=config.height||1.45;
 input.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(input.scene),center=box.getCenter(new THREE.Vector3()),scale=h/(box.max.y-box.min.y),parts=[];let material;
 const transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
 input.scene.traverse(o=>{if(o.isMesh){parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform));material??=o.material.clone();}});
 const geometry=parts.length===1?parts[0]:mergeGeometries(parts,false),bones=[],joints={},starts={},ends={};
 const fittedLegs={};
 if(config.preservePbr){
  const p=geometry.attributes.position,samples=[];for(let i=0;i<p.count;i++)if(p.getY(i)<h*.19&&p.getZ(i)<-h*.13)samples.push([p.getX(i)/h,p.getY(i)/h,p.getZ(i)/h]);
  const sorted=samples.map(p=>p[0]).sort((a,b)=>a-b),middle=sorted[Math.floor(sorted.length*.5)]??0;
  for(const[side,sign]of[['R',-1],['L',1]]){
   const foot=samples.filter(p=>(p[0]-middle)*sign>0);if(foot.length<25)continue;
   const center=[0,1,2].map(axis=>{const values=foot.map(p=>p[axis]).sort((a,b)=>a-b);return(values[Math.floor(values.length*.12)]+values[Math.floor(values.length*.88)])*.5;});
   const ankle=[center[0],Math.max(.07,center[1]),center[2]],knee=[center[0],.075,center[2]+.16],thigh=[center[0]*.85,.23,center[2]+.24],toe=[center[0],ankle[1],center[2]-.10];
   fittedLegs['Thigh'+side]=[thigh,knee];fittedLegs['Shin'+side]=[knee,ankle];fittedLegs['Foot'+side]=[ankle,toe];
  }
 }
 const add=(name,parent,point,end)=>{if(fittedLegs[name])[point,end]=fittedLegs[name];const b=new THREE.Bone();b.name=name;const p=new THREE.Vector3(...point).multiplyScalar(h);starts[name]=p;ends[name]=new THREE.Vector3(...end).multiplyScalar(h);const up=joints[parent]||scene;scene.updateMatrixWorld(true);b.position.copy(up.worldToLocal(p.clone()));up.add(b);bones.push(b);joints[name]=b;scene.updateMatrixWorld(true);};
 add('Hips',null,[-.15,.24,-.11],[.09,.36,.04]);add('Chest','Hips',[.09,.36,.04],[.11,.49,.05]);add('Head','Chest',[.11,.49,.05],[.11,.84,.02]);
 add('Cape','Chest',[.08,.39,-.09],[.05,.17,-.14]);add('Hair','Head',[.11,.76,-.10],[.11,.26,-.14]);add('Tail','Hips',[-.17,.2,-.2],[-.24,.17,-.27]);
 for(const [side,x,z]of [['R',-.035,.19],['L',.205,.21]]){
  add('UpperArm'+side,'Chest',[x,.355,z],[x,.21,z]);add('LowerArm'+side,'UpperArm'+side,[x,.21,z],[x,.045,z+.01]);
  add('HandSlot'+side,'LowerArm'+side,[x,.045,z+.01],[x,.035,z+.07]);add('Fingers'+side,'HandSlot'+side,[x,.035,z+.045],[x,.03,z+.062]);add('FingerTips'+side,'Fingers'+side,[x,.03,z+.062],[x,.03,z+.082]);
  const shift=side==='R'?0:.12;
  add('Thigh'+side,'Hips',[-.19+shift,.205,-.1-shift],[-.26+shift,.065,-.04-shift]);add('Shin'+side,'Thigh'+side,[-.26+shift,.065,-.04-shift],[-.36+shift,.09,-.12-shift]);add('Foot'+side,'Shin'+side,[-.36+shift,.09,-.12-shift],[-.42+shift,.09,-.15-shift]);
 }
 const skeleton=new THREE.Skeleton(bones);scene.updateMatrixWorld(true);skeleton.calculateInverses();const indices=Object.fromEntries(bones.map((b,i)=>[b.name,i]));
 const p=geometry.attributes.position,si=new Uint16Array(p.count*4),sw=new Float32Array(p.count*4),v=new THREE.Vector3(),line=new THREE.Line3(),near=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);const y=v.y/h,z=v.z/h,x=v.x/h;
  const head=THREE.MathUtils.smoothstep(y,.43,.53),handSide=Math.abs(x+.035)<Math.abs(x-.205)?'R':'L';
  const armRegion=z>.10&&y<.45&&Math.abs(x-(handSide==='R'?-.035:.205))<.115;
  const fittedFace=config.fitFrontSurface&&y>.36&&z>.195;
  const garment=config.preservePbr&&z<.08&&y>.19&&y<.43;
  const legRegion=config.preservePbr&&y<.19&&z<-.10,legSide=Math.abs(v.x-starts.ShinR.x)<Math.abs(v.x-starts.ShinL.x)?'R':'L';
  const candidates=head>.99||fittedFace?['Head']:armRegion?['UpperArm'+handSide,'LowerArm'+handSide,'HandSlot'+handSide,'Fingers'+handSide,'FingerTips'+handSide,'Chest','Head']:legRegion?['Thigh'+legSide,'Shin'+legSide,'Foot'+legSide]:garment?['Hips','Chest','Head']:['Hips','Chest','Head','ThighR','ShinR','FootR','ThighL','ShinL','FootL'];
  const scores=candidates.map(name=>{line.set(starts[name],ends[name]);line.closestPointToPoint(v,true,near);let d=v.distanceToSquared(near);if(name==='Head'&&y>.42)d*=.25;if(name==='Hips'&&z<0)d*=.5;return[indices[name],-d/(h*h*(legRegion?.0018:.008))];}).sort((a,b)=>b[1]-a[1]).slice(0,4),max=scores[0][1],sum=scores.reduce((n,s)=>n+Math.exp(s[1]-max),0);
  for(let j=0;j<scores.length;j++){si[i*4+j]=scores[j][0];sw[i*4+j]=Math.exp(scores[j][1]-max)/sum;}
 }
 if(config.preservePbr)smoothWeights(geometry,si,sw,bones.length,h*.54);
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 material.name='Speki-prone-atlas';material.userData={atlasPalette:true,paletteHeadY:h*.52,cartoonSoftness:.38};
 if(config.surfaceProfile==='speki-clean-v1')Object.assign(material.userData,{cartoonSoftness:.68,seamlessMascot:true,surfaceProfile:config.surfaceProfile});
 material.metalness=0;material.roughness=.85;if(material.map)material.map.userData.mimeType=config.preservePbr?'image/webp':'image/jpeg';
 if(config.preservePbr)Object.assign(material.userData,{trellis2:true,atlasPalette:true});
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='SpekiProneBody';scene.add(mesh);mesh.bind(skeleton);mesh.frustumCulled=false;
 const rest=new Map(bones.map(b=>[b,{p:b.position.clone(),q:b.quaternion.clone()}])),animations=[];
 for(const template of fableClips('sera',h*.24)){
  const name=template.name,walk=/Walking|Running|Crawl_Walk|Exhausted_Walk/.test(name),run=/Running/.test(name),attack=/Attack|Shoot|Throw/.test(name),block=/Block/.test(name),hit=/Hit_A/.test(name),dead=/Death/.test(name),spell=/Spellcast/.test(name);
  const duration=walk?(run?.65:1.15):dead?1.1:attack?.8:block?.65:hit?.55:2.2,times=[],rot=new Map(bones.map(b=>[b,[]])),pos=new Map(bones.map(b=>[b,[]]));
  for(let k=0;k<17;k++){
   const t=k/16,w=Math.sin(t*Math.PI*2),pulse=Math.sin(t*Math.PI),sobbing=Math.sin(t*Math.PI*8)*.008;
   for(const [b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);}
   joints.Head.rotation.set((hit?.09:dead?.13:spell?-.08:-.012)*pulse,hit?w*.12:walk?w*.025:0,sobbing*(hit?4:1));
   joints.Chest.rotation.z=walk?w*.015:sobbing*.5;joints.Hips.position.y+=h*(dead?-.014*t:Math.abs(w)*.004);
   for(const [side,sign]of [['R',1],['L',-1]]){
    const phase=w*sign,arm=joints['UpperArm'+side],leg=joints['Thigh'+side];
    if(walk){arm.position.z+=phase*h*.025;arm.rotation.x=phase*.085;leg.position.z-=phase*h*.018;leg.rotation.x=-phase*.055;}
    if(walk&&config.preservePbr){joints['Shin'+side].rotation.x=phase*.12;joints['Foot'+side].rotation.x=-phase*.08;leg.position.y+=Math.max(0,phase)*h*.008;}
    if(attack&&side==='R'){arm.rotation.x=-Math.sin(Math.min(1,t/.55)*Math.PI)*.72;arm.rotation.z=-pulse*.06;joints.Chest.rotation.y=pulse*.06;joints.Hips.position.z+=pulse*h*.018;}
    if(block){arm.rotation.x=-pulse*(side==='R'?.24:.55);}
    if(spell){arm.rotation.x=-pulse*.32;}
    if(hit)arm.rotation.x=pulse*.05;
   }
   times.push(t*duration);for(const b of bones){rot.get(b).push(...b.quaternion.toArray());pos.get(b).push(...b.position.toArray());}
  }
  const tracks=[];for(const b of bones){tracks.push(new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,rot.get(b)),new THREE.VectorKeyframeTrack(b.name+'.position',times,pos.get(b)));}
  animations.push(new THREE.AnimationClip(name,duration,tracks));
 }
 for(const [b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);}scene.updateMatrixWorld(true);
 scene.name=config.id;scene.userData={author:'GFD',character:config.label,sourceCharacter:config.id,version:1,prone:true,deathDrop:0,weaponGrip:[0,-.018*h,.035*h],corpseRearDepth:.1*h,generator:'Microsoft TRELLIS; custom prone skeleton and animation'};
 if(config.generator==='TRELLIS.2')scene.userData.generator='Microsoft TRELLIS.2; fitted prone skeleton and animation';
 return fitProneCombat({scene,animations,report:{id:config.id,body:'prone',vertices:p.count,triangles:(geometry.index?.count||p.count)/3,bones:bones.length,clips:animations.length,height:h,joints:Object.fromEntries(Object.entries(starts).map(([n,p])=>[n,p.toArray()]))}});
}
