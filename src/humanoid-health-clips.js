import * as THREE from 'three';

// Bake against each model's actual joints once when loading. Ground contacts
// stay fixed while the pelvis and spine bend; no IK runs in the frame loop.
export function fitHumanoidHealthClips(asset){
 if(asset.fittedHealthClips)return true;
 const root=asset.scene,nodes=new Map();root.updateMatrixWorld(true);
 root.traverse(node=>{if(node.isBone)nodes.set(node.name.replace(/[._-]/g,'').toLowerCase(),node);});
 const find=(...names)=>names.map(n=>nodes.get(n.toLowerCase())).find(Boolean);
 const hip=find('Hips','Pelvis'),chest=find('Chest','Spine2','Spine'),head=find('Head');
 const sides=['R','L'].map(side=>({side,sign:side==='R'?-1:1,arm:find('UpperArm'+side,'Arm'+side),elbow:find('LowerArm'+side,'ForeArm'+side),hand:find('HandSlot'+side,'Wrist'+side,'Fist'+side),thigh:find('Thigh'+side,'UpLeg'+side),knee:find('Shin'+side,'Leg'+side),foot:find('Foot'+side)}));
 if(!hip||!chest||!head||sides.some(s=>!s.arm||!s.elbow||!s.hand||!s.thigh||!s.knee||!s.foot))return false;
 const world=node=>node.getWorldPosition(new THREE.Vector3());
 const rest=new Map([...nodes.values()].map(node=>[node,{p:node.position.clone(),q:node.quaternion.clone(),world:world(node),rotation:node.getWorldQuaternion(new THREE.Quaternion())}]));
 const bounds=new THREE.Box3().setFromObject(root),h=bounds.max.y-bounds.min.y,ground=bounds.min.y;
 if(!(h>0)||rest.get(hip).world.y-ground<h*.30)return false;
 const shortBody=(rest.get(head).world.y-ground)/h<.72;
 for(const s of sides){s.armLengths=[world(s.arm).distanceTo(world(s.elbow)),world(s.elbow).distanceTo(world(s.hand))];s.legLengths=[world(s.thigh).distanceTo(world(s.knee)),world(s.knee).distanceTo(world(s.foot))];}
 const reset=()=>{for(const [node,pose]of rest){node.position.copy(pose.p);node.quaternion.copy(pose.q);}root.updateMatrixWorld(true);};
 const orient=(node,q)=>{const parent=node.parent.getWorldQuaternion(new THREE.Quaternion());node.quaternion.copy(parent.invert()).multiply(q);root.updateMatrixWorld(true);};
 const pitch=(node,x,z=0)=>{node.quaternion.copy(rest.get(node).q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,0,z)));root.updateMatrixWorld(true);};
 const aim=(node,end,target)=>{const start=world(node),from=world(end).sub(start).normalize(),to=target.clone().sub(start).normalize();const delta=new THREE.Quaternion().setFromUnitVectors(from,to);orient(node,delta.multiply(node.getWorldQuaternion(new THREE.Quaternion())));};
 const solve=(upper,lower,end,target,pole,lengths)=>{
  const start=world(upper),direction=target.clone().sub(start),raw=direction.length(),[a,b]=lengths;
  if(a<1e-5||b<1e-5||raw<1e-5)return;
  const d=THREE.MathUtils.clamp(raw,Math.abs(a-b)+.0001,a+b-.0001);direction.multiplyScalar(1/raw);
  const bend=pole.clone().sub(start);bend.addScaledVector(direction,-bend.dot(direction));
  if(bend.lengthSq()<1e-7)bend.set(1,0,0);bend.normalize();
  const along=(a*a-b*b+d*d)/(2*d),lift=Math.sqrt(Math.max(0,a*a-along*along));
  const joint=start.clone().addScaledVector(direction,along).addScaledVector(bend,lift);
  aim(upper,lower,joint);aim(lower,end,start.addScaledVector(direction,d));
 };
 const clips=[];
 for(const crawling of [false,true])for(const moving of [false,true]){
  const name=(crawling?'Crawl_':'Exhausted_')+(moving?'Walk':'Idle'),duration=moving?(crawling?1.35:1.2):(crawling?2.6:2.4),count=17;
  const times=[],quaternions=new Map([...nodes.values()].map(n=>[n,[]])),positions=[];
  for(let frame=0;frame<count;frame++){
   reset();const t=frame/(count-1),wave=Math.sin(t*Math.PI*2),breath=Math.sin(t*Math.PI*2)**2;
   const hipRest=rest.get(hip).world,hipTarget=hipRest.clone();
   const upperLeg=(sides[0].legLengths[0]+sides[1].legLengths[0])*.5;
   hipTarget.y=ground+(crawling?upperLeg*(shortBody?.62:.89)+h*((shortBody?.025:.065)+breath*.002):hipRest.y-ground-h*(.045+breath*.004));
   hipTarget.z+=(crawling?-.075:-.07)*h;hipTarget.x+=wave*h*(moving?.009:.004);
   hip.position.copy(hip.parent.worldToLocal(hipTarget.clone()));
   pitch(hip,crawling?(shortBody?.88:1.30):.40,crawling?wave*.018:wave*.006);
   pitch(chest,crawling?.08:.35+breath*.03);
   pitch(head,crawling?(shortBody?-.88:-.95):-.32,breath*.012);
   for(const s of sides){
    const phase=t*Math.PI*2+(s.sign>0?Math.PI:0),cycle=Math.sin(phase),swing=Math.max(0,Math.cos(phase));
    const foot=rest.get(s.foot).world.clone();
    if(crawling){
     const start=world(s.thigh),kneeY=ground+h*(.035+(moving?swing*.014:0));
     const dy=Math.min(s.legLengths[0]*.98,start.y-kneeY),dz=Math.sqrt(Math.max(0,s.legLengths[0]**2-dy**2));
     const knee=start.clone().setY(start.y-dy);knee.z+=dz+(moving?cycle*h*.035:0);
     aim(s.thigh,s.knee,knee);
     const actual=world(s.knee);foot.copy(actual);foot.y=ground+h*.06;foot.z-=Math.sqrt(Math.max(0,s.legLengths[1]**2-(foot.y-actual.y)**2));
     aim(s.knee,s.foot,foot);
    }else{
     if(moving){foot.z+=cycle*h*.09;foot.y+=swing*h*.018;}
     const kneePole=world(s.thigh).add(new THREE.Vector3(s.sign*h*.035,-h*.23,h*.38));
     solve(s.thigh,s.knee,s.foot,foot,kneePole,s.legLengths);
    }
    orient(s.foot,rest.get(s.foot).rotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(crawling?2.5:0,0,0))));
    const hand=crawling?new THREE.Vector3(s.sign*h*.15,ground+h*(.035+(moving?swing*.035:0)),world(s.arm).z+h*.06+(moving?cycle*h*.09:0)):
     new THREE.Vector3(hipTarget.x+s.sign*h*.033,hipTarget.y+h*(s.sign<0?.165:.14),hipTarget.z+h*.20);
    const elbowPole=world(s.arm).add(new THREE.Vector3(s.sign*h*.23,-h*.30,crawling?-h*.09:h*.03));
    solve(s.arm,s.elbow,s.hand,hand,elbowPole,s.armLengths);
    orient(s.hand,new THREE.Quaternion().setFromEuler(new THREE.Euler(crawling?-Math.PI/2:-.12,0,crawling?0:-s.sign*1.35)));
   }
   times.push(t*duration);positions.push(...hip.position.toArray());
   for(const [node,values]of quaternions)values.push(...node.quaternion.toArray());
  }
  const tracks=[new THREE.VectorKeyframeTrack(hip.name+'.position',times,positions)];
  for(const [node,values]of quaternions)tracks.push(new THREE.QuaternionKeyframeTrack(node.name+'.quaternion',times,values));
  clips.push(new THREE.AnimationClip(name,duration,tracks));
 }
 reset();const replaced=new Set(clips.map(c=>c.name));asset.animations=asset.animations.filter(c=>!replaced.has(c.name)).concat(clips);delete asset.crawlLift;asset.fittedHealthClips=true;return true;
}
