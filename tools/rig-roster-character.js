// Authoring only. Each V2 gets its own generated surface and a fitted skeleton.
// Existing character assets and the Selene authoring path are deliberately stable.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {fableClips} from '../src/fable-characters.js';
import {fitSurfaceAnatomy} from './fit-surface-limbs.js';

export async function rigRosterCharacter(url,config){
 const input=await new GLTFLoader().loadAsync(url),scene=new THREE.Group();
 scene.name=config.id+'_v2';input.scene.updateMatrixWorld(true);
 const pieces=[],bounds=new THREE.Box3();
 input.scene.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);geometry.computeBoundingBox();bounds.union(geometry.boundingBox);if(config.rigidParts&&!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));pieces.push({geometry,material:o.material.clone(),forceBone:config.rigidParts?o.userData.rigBone:undefined});});
 const height=config.height||2.25,scale=height/(bounds.max.y-bounds.min.y),center=bounds.getCenter(new THREE.Vector3());
 const mascot=config.body==='mascot',chibi=config.body==='chibi',golem=config.body==='golem',fox=config.body==='fox';
 const h=height*(config.id==='Usagi'?.76:config.refitSurface&&!mascot?1:config.headTop||1);
 // Large asymmetric tails must not displace the pelvis or the weapon sockets.
 const upper=[];for(const {geometry}of pieces){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const y=(p.getY(i)-bounds.min.y)*scale;if(y>h*.66&&y<h*.81)upper.push([p.getX(i),p.getZ(i)]);}}
 if(upper.length){for(const [axis,key]of [[0,'x'],[1,'z']]){const values=upper.map(p=>p[axis]).sort((a,b)=>a-b);center[key]=values[Math.floor(values.length*.5)];}}
 if(mascot&&upper.length){
  const z=upper.map(p=>p[1]).sort((a,b)=>a-b),front=z[Math.floor(z.length*.9)];
  const x=upper.filter(p=>p[1]>=z[Math.floor(z.length*.65)]).map(p=>p[0]).sort((a,b)=>a-b);
  center.x=x[Math.floor(x.length*.5)];center.z=front-h*.22/scale;
 }
 if(config.rigidParts){center.x=0;center.z=0;}
 const transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
 for(const p of pieces)p.geometry.applyMatrix4(transform);
 const anatomy=config.refitSurface&&!mascot?fitSurfaceAnatomy(pieces,height,config.proportions):{},fittedArms=anatomy.arms||{};
 if(config.fittedArms)Object.assign(fittedArms,config.fittedArms);
 if(config.missingArm)delete fittedArms[config.missingArm];
 if(config.fittedLegs)anatomy.legs=config.fittedLegs;
 const profile=mascot?{hip:.21,chest:.34,head:.43,headCut:.46,shoulderY:.36,shoulderX:.275,elbowY:.32,elbowX:.31,wristY:.28,wristX:.345,tipY:.26,tipX:.36,legX:.135,knee:.08,ankle:.04,thigh:.14,armRadius:.043}:
 {hip:.51,chest:.715,head:.842,headCut:.865,shoulderY:.785,shoulderX:golem?.18:.10,elbowY:.655,elbowX:golem?.235:.17,wristY:.535,wristX:golem?.30:.23,tipY:.445,tipX:golem?.32:.265,legX:golem?.13:.068,knee:.29,ankle:.065,thigh:.495,armRadius:golem?.062:.034};
 Object.assign(profile,config.rig||{});
 if(anatomy.neck&&!config.lockProfile){const shoulders=Object.values(fittedArms).map(a=>a.shoulder[1]),shoulderY=shoulders.length?shoulders.reduce((n,y)=>n+y,0)/shoulders.length:h*profile.shoulderY;
  profile.head=THREE.MathUtils.clamp(Math.max(anatomy.neck[1],shoulderY+h*.065)/h,chibi?.50:.75,chibi?.65:.89);profile.headCut=Math.min(.96,profile.head+.045);
  profile.chest=THREE.MathUtils.clamp((shoulderY-h*.035)/h,chibi?.43:.66,profile.head-.065);
 }
 const value=k=>profile[k]*h;
 const paws={};
 if(mascot)for(const [side,sign]of [['R',-1],['L',1]]){
  const candidates=[];for(const {geometry}of pieces){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(sign*x>h*.22&&y>h*.19&&y<h*.445&&(config.id!=='Momonga'||z>-h*.10))candidates.push(new THREE.Vector3(x,y,z));}}
  if(candidates.length>12){candidates.sort((a,b)=>sign*(b.x-a.x));const tipPoints=candidates.slice(0,Math.max(10,Math.floor(candidates.length*.09))),tip=tipPoints.reduce((p,v)=>p.add(v),new THREE.Vector3()).multiplyScalar(1/tipPoints.length);
   const shoulder=new THREE.Vector3(tip.x*.74,tip.y+h*.028,tip.z),wrist=tip.clone().lerp(shoulder,.13),elbow=shoulder.clone().lerp(wrist,.55);
   paws[side]={shoulder:shoulder.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray(),tip:tip.toArray()};
  }
 }
 // Fit separated arm cross-sections to the surface instead of using the same
 // shoulder/elbow width for plate armour, slim shinobi and short mascot arms.
 function armX(y,fallback,sign=1){
  if(mascot)return fallback;const values=[];
  for(const {geometry}of pieces){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-y)<h*.012&&p.getX(i)*sign>h*.145)values.push(p.getX(i)*sign);}
  if(values.length<8)return fallback;values.sort((a,b)=>a-b);const edge=values[Math.floor(values.length*.92)];return THREE.MathUtils.clamp(edge-h*.024,fallback*.80,fallback*1.9);
 }
 function armZ(y,x,fallback=0){
  const samples=[];for(const {geometry}of pieces){const p=geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-y)<h*.016&&Math.abs(p.getX(i)-x)<h*.037)samples.push(p.getZ(i));}
  if(samples.length<8)return fallback;samples.sort((a,b)=>a-b);return THREE.MathUtils.clamp(samples[Math.floor(samples.length*.5)],-h*.16,h*.18);
 }
 if(config.armJoints)for(const [side,points]of Object.entries(config.armJoints))paws[side]=Object.fromEntries(Object.entries(points).map(([name,p])=>[name,new THREE.Vector3(...p).applyMatrix4(transform).toArray()]));
 if(mascot&&config.fittedArms)Object.assign(paws,config.fittedArms);
 const hip=value('hip'),bones=[],joints={},indices={},starts={},ends={};
 function bone(name,parent,point,end,angle=0){
  const b=new THREE.Bone();b.name=name;const position=new THREE.Vector3(...point),up=parent?joints[parent]:scene;
  scene.updateMatrixWorld(true);b.position.copy(up.worldToLocal(position.clone()));
  b.quaternion.copy(up.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(angle?.isQuaternion?angle:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle));
  up.add(b);indices[name]=bones.length;bones.push(b);joints[name]=b;starts[name]=position;ends[name]=new THREE.Vector3(...end);scene.updateMatrixWorld(true);
 }
 const mean=(points,index,fallback=0)=>points.length?points.reduce((n,p)=>n+p[index],0)/points.length:fallback;
 const chestZ=config.fittedSpine?mean(Object.values(fittedArms).map(a=>a.shoulder),2):0;
 const hipZ=config.fittedSpine?mean(Object.values(anatomy.legs||{}).map(l=>l.thigh),2,chestZ):0;
 const headZ=config.fittedSpine?(config.lockProfile?chestZ:anatomy.neck?.[2]??chestZ):0;
 bone('Hips',null,[0,hip,hipZ],[0,value('chest')-.04*h,chestZ]);
 bone('Chest','Hips',[0,value('chest'),chestZ],[0,value('head'),headZ]);
 bone('Head','Chest',[0,value('head'),headZ],[0,h*.96,headZ]);
 bone('Cape','Chest',[0,value('chest'),-.055*h],[0,hip,-.07*h]);
 bone('Hair','Head',[0,h*.9,-.05*h],[0,value('head'),-.06*h]);
 bone('Tail','Hips',[0,hip,-.065*h],[0,hip-.04*h,-.28*h]);
 for(const [side,sign]of [['R',-1],['L',1]]){
  const shoulder=paws[side]?.shoulder||[sign*value('shoulderX'),value('shoulderY'),0],elbow=paws[side]?.elbow||[sign*armX(value('elbowY'),value('elbowX'),sign),value('elbowY'),0],wrist=paws[side]?.wrist||[sign*armX(value('wristY'),value('wristX'),sign),value('wristY'),.005*h],tip=paws[side]?.tip||[sign*value('tipX'),value('tipY'),.008*h];
  if(!mascot){const projected=Math.abs(wrist[0])+(Math.abs(wrist[0])-Math.abs(elbow[0]))*(wrist[1]-tip[1])/(elbow[1]-wrist[1]);tip[0]=sign*armX(tip[1],Math.max(value('tipX'),projected),sign);for(const point of [shoulder,elbow,wrist,tip])point[2]=armZ(point[1],point[0],point===tip?wrist[2]:point[2]);}
  const fitted=fittedArms[side];if(fitted)for(const [name,point]of Object.entries({shoulder,elbow,wrist,tip}))point.splice(0,3,...fitted[name]);
  const axisRotation=(from,to)=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize());
  const a=fitted?axisRotation(shoulder,elbow):Math.atan2(elbow[0]-shoulder[0],shoulder[1]-elbow[1]),b=fitted?axisRotation(elbow,wrist):Math.atan2(wrist[0]-elbow[0],elbow[1]-wrist[1]);
  const handAngle=fitted?axisRotation(wrist,tip):b;
  bone('UpperArm'+side,'Chest',shoulder,elbow,a);bone('LowerArm'+side,'UpperArm'+side,elbow,wrist,b);bone('HandSlot'+side,'LowerArm'+side,wrist,tip,handAngle);
  const axis=new THREE.Vector3(...tip).sub(new THREE.Vector3(...wrist)),finger=new THREE.Vector3(...wrist).addScaledVector(axis,config.refitSurface?.65:.38),knuckle=new THREE.Vector3(...wrist).addScaledVector(axis,config.refitSurface?.83:.65);
  ends['HandSlot'+side]=finger.clone();bone('Fingers'+side,'HandSlot'+side,finger.toArray(),knuckle.toArray(),handAngle);bone('FingerTips'+side,'Fingers'+side,knuckle.toArray(),tip,handAngle);
  const leg=anatomy.legs?.[side],thigh=leg?.thigh||[sign*value('legX'),value('thigh'),0],knee=leg?.knee||[sign*value('legX')*1.13,value('knee'),0],ankle=leg?.ankle||[sign*value('legX')*1.25,value('ankle'),0],toe=leg?.toe||[sign*value('legX')*1.25,h*.025,h*.07];
  bone('Thigh'+side,'Hips',thigh,knee);bone('Shin'+side,'Thigh'+side,knee,ankle);bone('Foot'+side,'Shin'+side,ankle,toe);
 }
 const skeleton=new THREE.Skeleton(bones);scene.updateMatrixWorld(true);skeleton.calculateInverses();
 const segment=new THREE.Line3(),closest=new THREE.Vector3(),v=new THREE.Vector3();
  function weights(point){
  if(config.backAttachment&&point.z<h*config.backAttachment.z&&point.y>h*config.backAttachment.minY&&point.y<h*(config.backAttachment.maxY??2))return [[indices.Chest,1]];
  if(config.armourSkinning&&Math.abs(point.x)>h*config.armourSkinning.x&&point.y>h*config.armourSkinning.y&&point.z>h*(config.backAttachment?.z??-.14))return [[indices['UpperArm'+(point.x<0?'R':'L')],1]];
  if(config.torsoCore&&Math.abs(point.x)<h*config.torsoCore&&point.y>hip-h*.025&&point.y<value('headCut')){const chest=THREE.MathUtils.smoothstep(point.y,hip,value('chest'));return [[indices.Chest,chest],[indices.Hips,1-chest]];}
  // Flight units stay on the torso instead of following the nearest arm.
  if(config.sdWings&&(Math.abs(point.x)>h*.37&&point.y>h*.25||Math.abs(point.x)>h*.25&&point.y>h*.50||point.z<-h*.02&&point.y>h*.36))return [[indices.Chest,1]];
  if(config.sdMecha&&point.y>value('headCut')&&Math.abs(point.x)<h*.24&&point.z>-h*.16)return [[indices.Head,1]];
  if(config.mechanical&&point.z<-(config.sdMecha?.12:.14)*h&&point.y>(config.sdMecha?.29:.50)*h)return [[indices.Chest,1]];
  const side=point.x<0?'R':'L',arm=config.missingArm===side?[]:['UpperArm'+side,'LowerArm'+side,'HandSlot'+side,'Fingers'+side,'FingerTips'+side];
  // A hand below the waist is still a hand. Long sleeves and low demon claws
  // must not enter the robe/back-hair safeguards used for torso vertices.
  let nearArm=false;
  if(config.preservePbr){
   let distance=Infinity;
   for(const name of arm){segment.set(starts[name],ends[name]);segment.closestPointToPoint(point,true,closest);distance=Math.min(distance,point.distanceTo(closest));}
   nearArm=distance<h*(golem?.10:.075)&&Math.abs(point.x)>h*.13;
  }
  if(config.fittedSpine){
   // Back hair and coat panels are not legs. Spatial nearest-bone weights can
   // attach their hem to ankles and rip the whole cape apart while crawling.
   const torsoZ=point.y>hip?chestZ:hipZ,back=torsoZ-h*(chibi?.10:.065),rear=1-THREE.MathUtils.smoothstep(point.z,back-h*.025,back+h*.025);
   if(!nearArm&&rear>.02&&point.y<h*profile.headCut&&point.y>h*(chibi?.24:.15)){
    const head=THREE.MathUtils.smoothstep(point.y,h*(chibi?.20:.40),h*(chibi?.24:.53));
    const chest=THREE.MathUtils.smoothstep(point.y,hip-h*.02,value('chest'))*(1-head);
    if(rear>.92)return [[indices.Head,head],[indices.Chest,chest],[indices.Hips,1-head-chest]];
   }
   if(!nearArm&&point.y<hip-h*.02){
    segment.set(starts['Thigh'+side],ends['Thigh'+side]);segment.closestPointToPoint(point,true,closest);let legDistance=point.distanceTo(closest);
    segment.set(starts['Shin'+side],ends['Shin'+side]);segment.closestPointToPoint(point,true,closest);legDistance=Math.min(legDistance,point.distanceTo(closest));
    // A robe remains a robe when the knee folds. Only the actual leg tube
    // should follow the shin; outer hems stay with the pelvis.
    if(legDistance>h*(chibi?.085:.075)&&point.y>starts['Foot'+side].y+h*.015)return [[indices.Hips,1]];
   }
  }
  if(config.solidChest&&point.y>h*.65&&point.y<h*.81&&Math.abs(point.x)<h*.15&&point.z>(fittedArms[side]?.shoulder[2]||0)+h*.022)return [[indices.Chest,1]];
  if(config.refitSurface&&!mascot&&point.y<starts['Foot'+side].y-h*.012)return [[indices['Foot'+side],1]];
  if(mascot){
   if(config.mascotBackHair&&point.z<h*config.mascotBackHair.z&&point.y>h*config.mascotBackHair.minY)return [[indices.Head,1]];
   const paw=paws[side],y=point.y/h,py=paw?paw.tip[1]/h:.32,px=paw?Math.abs(paw.shoulder[0])/h:.22,tx=paw?Math.abs(paw.tip[0])/h:.32,pz=paw?paw.tip[2]/h:0;
   const skin=config.mascotSkinProfile||{};
   const limb=THREE.MathUtils.smoothstep(Math.abs(point.x)/h,px*.94,px+(tx-px)*.65)*THREE.MathUtils.smoothstep(y,py-.15,py-.07)*(1-THREE.MathUtils.smoothstep(y,py+.065,py+.13))*THREE.MathUtils.smoothstep(point.z/h,pz-.12,pz-.055),head=THREE.MathUtils.smoothstep(y,skin.headStart??.38,skin.headEnd??.48)*(1-limb),leg=(1-THREE.MathUtils.smoothstep(y,skin.legStart??.055,skin.legEnd??.17))*(1-head-limb),body=1-head-limb-leg,chest=THREE.MathUtils.smoothstep(y,skin.chestStart??.20,skin.chestEnd??.37);
   return [[indices.Head,head],[indices['UpperArm'+side],limb],[indices['Thigh'+side],leg],[indices.Chest,body*chest],[indices.Hips,body*(1-chest)]].sort((a,b)=>b[1]-a[1]).slice(0,4).map((v,i,a)=>[v[0],v[1]/a.reduce((s,p)=>s+p[1],0)]);
  }
  const fitted=fittedArms[side],handFloor=fitted?Math.min(fitted.tip[1],fitted.wrist[1])-h*.075:value('tipY')-h*.025,handCeiling=fitted?Math.min(fitted.tip[1],fitted.wrist[1])-h*.035:value('tipY')+h*.035,shoulderTop=fitted?fitted.shoulder[1]:value('shoulderY');
  let armMask=THREE.MathUtils.smoothstep(Math.abs(point.x),value('shoulderX')-h*.02,value('shoulderX')+h*.06)*THREE.MathUtils.smoothstep(point.y,handFloor,handCeiling)*(1-THREE.MathUtils.smoothstep(point.y,shoulderTop+h*(fitted?.005:.05),shoulderTop+h*(fitted?.06:.11)));
  if(config.separatedLimbSkinning){
   let axisX=Math.abs(starts[point.y<starts['HandSlot'+side].y?'HandSlot'+side:'UpperArm'+side].x);
   for(const name of ['UpperArm'+side,'LowerArm'+side,'HandSlot'+side]){const a=starts[name],b=name.startsWith('HandSlot')?ends['FingerTips'+side]:ends[name];if(point.y<=a.y&&point.y>=b.y){const t=(a.y-point.y)/Math.max(1e-6,a.y-b.y);axisX=Math.abs(THREE.MathUtils.lerp(a.x,b.x,t));break;}}
   const radius=h*(point.y>value('elbowY')?(config.limbRadius?.upper??.075):(config.limbRadius?.lower??.045));
   armMask*=THREE.MathUtils.smoothstep(Math.abs(point.x),axisX-radius,axisX-radius+h*.02);
  }
  if(config.nearestArmSkinning)armMask=THREE.MathUtils.smoothstep(Math.abs(point.x),h*.10,h*.15);
  if(config.legArmSeparation&&point.y<hip+h*.025&&Math.abs(point.x)<value('legX')+h*.075)armMask=0;
  if(point.y>value('headCut')+h*.02)return [[indices.Head,1]];
  const inTail=(fox||config.id==='Momonga')&&point.z<-h*(mascot?.19:.12)&&point.y<value('headCut');
  const legs=config.separateUpperBody&&point.y>hip+h*.05?[]:['Thigh'+side,'Shin'+side,'Foot'+side];
  const choices=inTail?['Tail','Hips']:['Hips','Chest','Head',...(armMask<=0&&(config.separatedLimbSkinning||config.legArmSeparation)?[]:arm),...legs];
  const scores=choices.map(name=>{segment.set(starts[name],ends[name]);segment.closestPointToPoint(point,true,closest);let d=point.distanceTo(closest);if(name==='Hips'||name==='Chest')d*=mascot?.56:.87;const sigma=h*(config.skinSigma??(mascot?.055:.028));const bias=arm.includes(name)?Math.log(Math.max(1e-12,armMask)):0;return [indices[name],-d*d/(2*sigma*sigma)+bias];}).sort((a,b)=>b[1]-a[1]).slice(0,4);
  // Stable softmax also handles broad hats, cloaks and very thick golem plates.
  const max=scores[0][1],sum=scores.reduce((n,s)=>n+Math.exp(s[1]-max),0);return scores.map(([i,w])=>[i,Math.exp(w-max)/sum]);
 }
 let vertices=0,triangles=0;const surfaces=[],rigidChest=new Set(config.rigidChestVertexIndices||[]);
 for(const piece of pieces){let {geometry,material,forceBone}=piece;
  const p=geometry.attributes.position,skinIndices=new Uint16Array(p.count*4),skinWeights=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);(forceBone?[[indices[forceBone],1]]:weights(v)).forEach(([index,weight],j)=>{skinIndices[i*4+j]=index;skinWeights[i*4+j]=weight;});}
  for(const [boneName,vertexIds]of Object.entries(config.garmentBoneVertexIndices||{}))for(const vertex of vertexIds){const i=vertex-vertices;if(i>=0&&i<p.count){skinIndices.set([indices[boneName],0,0,0],i*4);skinWeights.set([1,0,0,0],i*4);}}
  // Keep connected joint surfaces continuous; per-triangle rigid assignments
  // create visible cracks on reconstructed meshes without separate armour parts.
  if(!forceBone)smoothWeights(geometry,skinIndices,skinWeights,bones.length,value('headCut')+h*.04,config.weightSmoothPasses??18);
  if(rigidChest.size)for(let i=0;i<p.count;i++)if(rigidChest.has(vertices+i)){skinIndices.set([indices.Chest,0,0,0],i*4);skinWeights.set([1,0,0,0],i*4);}
  for(const [boneName,vertexIds] of Object.entries(config.rigidBoneVertexIndices||{})){
   if(indices[boneName]===undefined)throw Error('Unknown rigid plate bone '+boneName);
   for(const vertex of vertexIds){const i=vertex-vertices;if(i>=0&&i<p.count){skinIndices.set([indices[boneName],0,0,0],i*4);skinWeights.set([1,0,0,0],i*4);}}
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
  material.name=config.id+'-atlas-v2';material.userData={atlasPalette:!config.rigidParts,paletteHeadY:value('headCut'),cartoonSoftness:config.softLight??(mascot?.32:.14),seamlessMascot:!!config.rigidParts};
  if(config.preservePbr){material.userData.trellis2=true;if(material.map)material.map.userData.mimeType='image/webp';}
  else{if(material.map)material.map.userData.mimeType='image/jpeg';material.metalness=golem?.10:.03;material.roughness=.77;}
  if(config.rigidParts&&config.id==='Hachiware')Object.assign(material.userData,{referenceCat:true,mascotSourceScale:scale,mascotSourceBase:bounds.min.y});
  surfaces.push(geometry);vertices+=p.count;triangles+=(geometry.index?.count||p.count)/3;
 }
 const geometry=surfaces.length===1?surfaces[0]:mergeGeometries(surfaces,false),mesh=new THREE.SkinnedMesh(geometry,pieces[0].material);mesh.name=config.id+'Body_v2';scene.add(mesh);mesh.bind(skeleton);mesh.normalizeSkinWeights();mesh.frustumCulled=false;
 const animations=fableClips(golem?'moru':'sera',hip);
 for(const clip of animations){
  if(config.fittedSpine)for(const track of clip.tracks)if(track.name==='Hips.position')for(let i=0;i<track.values.length;i+=3)track.values[i+2]+=hipZ;
  if(config.neutralBody&&['Idle','Vigorous_Idle'].includes(clip.name))for(const track of clip.tracks)if(/^(Hips|Chest|Head)\.quaternion$/.test(track.name))for(let i=0;i<track.values.length;i+=4)track.values.set([0,0,0,1],i);
  if(mascot)for(const track of clip.tracks)if(/^LowerArm[RL]\.quaternion$/.test(track.name))for(let i=0;i<track.values.length;i+=4){track.values.set([0,0,0,1],i);}
  // Stubby mascot arms punch from the shoulder. A human overhead rotation folds
  // the entire short shoulder junction inside out under glTF linear skinning.
  if(mascot)for(const track of clip.tracks)if(/^UpperArm[RL]\.quaternion$/.test(track.name))for(let i=0;i<track.values.length;i+=4){const q=new THREE.Quaternion().fromArray(track.values,i),e=new THREE.Euler().setFromQuaternion(q);e.x=THREE.MathUtils.clamp(e.x*.48,-1.05,.65);e.y*=.6;e.z*=.6;q.setFromEuler(e).toArray(track.values,i);}
  for(const side of ['R','L']){
   const open=/Spellcast|Throw/.test(clip.name),grip=!open&&(/Attack|Shoot|Block/.test(clip.name)||!config.refitSurface&&side==='R');
   for(const [prefix,angle]of [['Fingers',config.refitSurface?(grip?-.24:0):open?-.06:grip?-.9:-.25],['FingerTips',config.refitSurface?(grip?-.18:0):open?-.08:grip?-.6:-.2]]){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(mascot?0:angle,0,0));clip.tracks.push(new THREE.QuaternionKeyframeTrack(prefix+side+'.quaternion',[0,clip.duration],[...q.toArray(),...q.toArray()]));}
  }
  for(const name of ['UpperArmR','UpperArmL','LowerArmR','LowerArmL','ThighR','ThighL','ShinR','ShinL'])if(!clip.tracks.some(t=>t.name===name+'.quaternion'))clip.tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',[0,clip.duration],[0,0,0,1,0,0,0,1]));
 }
 if(config.shoulderRaiseLimit)for(const clip of animations)for(const track of clip.tracks){
  if(!/^UpperArm[RL]\.quaternion$/.test(track.name))continue;
  for(let i=0;i<track.values.length;i+=4){const q=new THREE.Quaternion().fromArray(track.values,i),e=new THREE.Euler().setFromQuaternion(q);e.x=Math.max(e.x,-config.shoulderRaiseLimit);q.setFromEuler(e).toArray(track.values,i);}
 }
 if(config.mechanical||config.relativeLimbAnimations)for(const clip of animations)for(const track of clip.tracks){
  const name=track.name.replace('.quaternion','');
  if(!track.name.endsWith('.quaternion')||!joints[name])continue;
  const rest=joints[name].quaternion.clone(),q=new THREE.Quaternion();
  for(let i=0;i<track.values.length;i+=4){q.fromArray(track.values,i);if(config.mechanical&&/^Finger/.test(name))q.identity();
   if(config.sdMecha&&/^UpperArm/.test(name)){
    const e=new THREE.Euler().setFromQuaternion(q),raise=THREE.MathUtils.smoothstep(-e.x,.8,2);
    e.x=Math.max(e.x,-1.8);e.z+=(name.endsWith('R')?-1:1)*raise*.38;
    q.setFromEuler(e);
   }
   q.premultiply(rest);q.toArray(track.values,i);}
 }
 // Fit the socket to the actual curled palm, independently of body/clothing
 // depth. The same local point then follows the hand in every animation.
 const weaponGrip=mascot?[0,-.03,.025]:fitPalmGrip(scene,mesh,joints.HandSlotR,starts.HandSlotR,ends.FingerTipsR,animations,h);
 // Calibrate against the actual fallen surface. Large fox tails and wide
 // mascot heads need a different floor offset from a slim humanoid torso.
 const death=animations.find(c=>c.name==='Death_A'),calibration=new THREE.AnimationMixer(scene),action=calibration.clipAction(death);
 action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();calibration.update(death.duration+.001);scene.updateMatrixWorld(true);skeleton.update();mesh.computeBoundingBox();
 const deathDrop=mesh.boundingBox.min.y-.045;
 calibration.stopAllAction();calibration.uncacheRoot(scene);scene.updateMatrixWorld(true);skeleton.update();
 scene.userData={author:'GFD',character:config.preservePbr?config.label:config.label+'_v2',sourceCharacter:config.id,version:2,generator:config.preservePbr?'Microsoft TRELLIS.2; generated PBR atlas, fitted skinning and animation':'Microsoft TRELLIS; authored atlas, fitted skinning and animation',deathDrop,weaponGrip,corpseRearDepth:mascot?.22*h:.065*h};
 return {scene,animations,report:{id:config.id+'_v2',body:config.body,vertices,triangles,bones:bones.length,clips:animations.length,height,profile,weaponGrip,fittedArms,anatomy,joints:Object.fromEntries(Object.entries(starts).map(([n,p])=>[n,p.toArray()]))}};
}

function fitPalmGrip(scene,mesh,joint,wrist,tip,animations,height){
 const positions=mesh.geometry.attributes.position,direction=tip.clone().sub(wrist),length=direction.lengthSq(),vertex=new THREE.Vector3(),axis=new THREE.Vector3(),candidates=[];
 for(let i=0;i<positions.count;i++){
  vertex.fromBufferAttribute(positions,i);const t=vertex.clone().sub(wrist).dot(direction)/length;axis.copy(wrist).addScaledVector(direction,t);
  if(t>.22&&t<.82&&vertex.distanceTo(axis)<height*.055)candidates.push(i);
 }
 if(candidates.length<8)return[0,-.07,.028];
 const mixer=new THREE.AnimationMixer(scene),points=[],inverse=new THREE.Matrix4();
 for(const name of ['Idle','2H_Melee_Attack_Chop','2H_Ranged_Shoot']){
  const clip=animations.find(c=>c.name===name);mixer.stopAllAction();mixer.clipAction(clip).reset().play();mixer.update(clip.duration*.35);scene.updateMatrixWorld(true);mesh.skeleton.update();inverse.copy(joint.matrixWorld).invert();
  for(const i of candidates){vertex.fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,vertex);vertex.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);points.push(vertex.clone());}
 }
 mixer.stopAllAction();mixer.uncacheRoot(scene);scene.updateMatrixWorld(true);mesh.skeleton.update();
 return ['x','y','z'].map(axis=>{const values=points.map(p=>p[axis]).sort((a,b)=>a-b);return THREE.MathUtils.clamp(values[Math.floor(values.length*.5)],-height*.16,height*.16);});
}

// Diffuse across actual mesh edges, welding UV duplicates. This prevents sharp
// selection boundaries from pulling a row of torso vertices into a moving hand.
export function smoothWeights(geometry,indices,weights,boneCount,rigidHeadY,passes=18){
 const p=geometry.attributes.position,lookup=new Map(),canonical=[],originalToCanonical=new Uint32Array(p.count);
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');let id=lookup.get(key);if(id===undefined){id=canonical.length;lookup.set(key,id);canonical.push(i);}originalToCanonical[i]=id;}
 const neighbors=canonical.map(()=>new Set()),index=geometry.index?.array||Array.from({length:p.count},(_,i)=>i);
 for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++){const a=originalToCanonical[index[i+j]],b=originalToCanonical[index[i+(j+1)%3]];if(a!==b){neighbors[a].add(b);neighbors[b].add(a);}}
 let data=new Float32Array(canonical.length*boneCount);canonical.forEach((i,c)=>{for(let j=0;j<4;j++)data[c*boneCount+indices[i*4+j]]+=weights[i*4+j];});
 const adjacency=neighbors.map(n=>[...n]);
 for(let pass=0;pass<passes;pass++){const next=data.slice();for(let c=0;c<canonical.length;c++){if(p.getY(canonical[c])>rigidHeadY||!adjacency[c].length)continue;const offset=c*boneCount;for(let b=0;b<boneCount;b++){let sum=0;for(const n of adjacency[c])sum+=data[n*boneCount+b];next[offset+b]=data[offset+b]*.45+sum/adjacency[c].length*.55;}}data=next;}
 for(let i=0;i<p.count;i++){const c=originalToCanonical[i],best=Array.from({length:boneCount},(_,b)=>[b,data[c*boneCount+b]]).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=best.reduce((n,b)=>n+b[1],0);for(let j=0;j<4;j++){indices[i*4+j]=best[j][0];weights[i*4+j]=best[j][1]/sum;}}
}
