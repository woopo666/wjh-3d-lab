import * as THREE from 'three';

export const DEFENSE_CLIP='Shield_Brace';
export function defenseTiming(reaction){
 const impact=Math.max(.16,reaction?.impactDelay??.26);
 return {impact,duration:reaction?.duration??impact+.64};
}
export function defensePhase(reaction,time){
 const {impact,duration}=defenseTiming(reaction),age=Math.max(0,time-reaction.start);
 // The shield is in place BEFORE contact, recoils at contact, then lowers.
 const raise=Math.min(.19,impact*.7),hold=Math.max(raise+.01,impact);
 if(age<raise)return age/raise*.22;
 if(age<hold)return .22+(age-raise)/(hold-raise)*.20;
 if(age<impact+.09)return .42+(age-impact)/.09*.15;
 if(age<impact+.27)return .57+(age-impact-.09)/.18*.13;
 return Math.min(1,.70+(age-impact-.27)/Math.max(.01,duration-impact-.27)*.30);
}

// Fit a defensive pose to the actual shoulder/elbow/wrist chain once per
// cached model. Short mascot arms and the prone rig retain their proportions.
export function fitDefenseClip(asset,definition={}){
 if(asset.fittedDefense)return true;
 const root=asset.scene,nodes=new Map();root.updateMatrixWorld(true);
 root.traverse(n=>{if(n.isBone)nodes.set(n.name.replace(/[._-]/g,'').toLowerCase(),n);});
 const get=(...names)=>names.map(n=>nodes.get(n.toLowerCase())).find(Boolean);
 const hip=get('Hips','Pelvis'),chest=get('Chest','Spine2','Spine'),head=get('Head');
 const arms=['L','R'].map(side=>({side,sign:side==='L'?1:-1,upper:get('UpperArm'+side,'Arm'+side),lower:get('LowerArm'+side,'ForeArm'+side),hand:get('HandSlot'+side,'Wrist'+side,'Fist'+side)}));
 if(!hip||!chest||arms.some(a=>!a.upper||!a.lower||!a.hand))return false;
 const point=n=>n.getWorldPosition(new THREE.Vector3()),rest=new Map([...nodes.values()].map(n=>[n,{p:n.position.clone(),q:n.quaternion.clone(),world:point(n)}]));
 const bounds=new THREE.Box3().setFromObject(root),height=bounds.max.y-bounds.min.y;
 if(!(height>0))return false;
 const prone=!!definition.prone,short=definition.family==='mascot'||definition.id==='Guest_Speaki'||arms[0].upper.getWorldPosition(new THREE.Vector3()).distanceTo(point(arms[0].hand))<height*.19;
 for(const a of arms)a.lengths=[point(a.upper).distanceTo(point(a.lower)),point(a.lower).distanceTo(point(a.hand))];
 const reset=()=>{for(const [n,p]of rest){n.position.copy(p.p);n.quaternion.copy(p.q);}root.updateMatrixWorld(true);};
 const orient=(n,q)=>{n.quaternion.copy(n.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(q);root.updateMatrixWorld(true);};
 const aim=(n,end,target)=>{const p=point(n),delta=new THREE.Quaternion().setFromUnitVectors(point(end).sub(p).normalize(),target.clone().sub(p).normalize());orient(n,delta.multiply(n.getWorldQuaternion(new THREE.Quaternion())));};
 const solve=(arm,target,pole)=>{
  const start=point(arm.upper),axis=target.clone().sub(start),raw=axis.length(),[a,b]=arm.lengths;if(Math.min(a,b,raw)<1e-5)return;
  const d=THREE.MathUtils.clamp(raw,Math.abs(a-b)+.0001,a+b-.0001);axis.multiplyScalar(1/raw);
  const bend=pole.clone().sub(start);bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-8)bend.set(arm.sign,0,0);bend.normalize();
  const along=(a*a-b*b+d*d)/(2*d),lift=Math.sqrt(Math.max(0,a*a-along*along));
  aim(arm.upper,arm.lower,start.clone().addScaledVector(axis,along).addScaledVector(bend,lift));aim(arm.lower,arm.hand,start.addScaledVector(axis,d));
 };
 const times=[0,.22,.42,.49,.57,.70,.84,1],tracks=new Map([...nodes.values()].map(n=>[n,[]]));
 for(let i=0;i<times.length;i++){
  reset();const strength=[0,1,1,1,1,.95,.55,0][i],recoil=[0,0,0,.6,1,.35,0,0][i];
  chest.quaternion.copy(rest.get(chest).q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((prone?-.025:.10)*strength-.09*recoil,-.10*strength,0)));
  if(head)head.quaternion.copy(rest.get(head).q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.025*strength,0,0)));
  root.updateMatrixWorld(true);
  for(const arm of arms){
   const shoulder=point(arm.upper),span=arm.lengths[0]+arm.lengths[1],left=arm.side===(definition.shieldSide||'L');
   const target=shoulder.clone().add(new THREE.Vector3(
    short?-.08*span*arm.sign:(left?-.080:-.055)*height*arm.sign,
    short?(prone?.23:-.15)*span:(left?-.12:-.18)*height,
    short?span*(left?.48:.25):(left?.20:.11)*height));
   target.z-=recoil*Math.min(span*.17,height*.025);
   const wanted=rest.get(arm.hand).world.clone().lerp(target,strength);
   solve(arm,wanted,shoulder.clone().add(new THREE.Vector3(arm.sign*span*.8,-span*.8,-span*.1)));
   // Preserve the wrist's anatomical axis. Making the wrist world-upright
   // hyperextends fitted hands; the independent shield socket handles facing.
   arm.hand.quaternion.copy(rest.get(arm.hand).q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.10*strength,0,-arm.sign*.04*strength)));
   if(!short)for(const [prefix,bend]of [['Fingers',-.32],['FingerTips',-.25]]){const finger=get(prefix+arm.side);if(finger)finger.quaternion.copy(rest.get(finger).q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),bend*strength));}
   root.updateMatrixWorld(true);
  }
  for(const [n,values]of tracks)values.push(...n.quaternion.toArray());
 }
 reset();const clip=new THREE.AnimationClip(DEFENSE_CLIP,1,[...tracks].map(([n,v])=>new THREE.QuaternionKeyframeTrack(n.name+'.quaternion',times,v)));
 asset.animations=asset.animations.filter(c=>c.name!==DEFENSE_CLIP).concat(clip);asset.fittedDefense={version:1,short,prone};return true;
}

const parentQ=new THREE.Quaternion(),actorQ=new THREE.Quaternion(),offsetQ=new THREE.Quaternion();
export function alignDefenseShield(actor,reaction,time){
 if(!actor.rig||!actor.shield?.parent||!reaction?.block)return;
 const {impact,duration}=defenseTiming(reaction),age=time-reaction.start;if(age>duration)return;
 const recoil=age<impact?0:Math.sin(Math.min(1,(age-impact)/.30)*Math.PI);
 actor.root.getWorldQuaternion(actorQ);actor.shield.parent.getWorldQuaternion(parentQ);
 offsetQ.setFromEuler(new THREE.Euler(-.08-recoil*.13,-.10,.025+recoil*.10));
 actor.shield.quaternion.copy(parentQ.invert()).multiply(actorQ).multiply(offsetQ);
}
