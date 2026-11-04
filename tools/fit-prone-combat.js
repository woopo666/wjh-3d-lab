import * as THREE from 'three';

// Authoring-only: support the body with the left hand and folded legs while
// the right arm lifts the weapon. Shafts point along the hand's local +Z.
export function fitProneCombat(asset){
 const root=asset.scene,upper=root.getObjectByName('UpperArmR'),lower=root.getObjectByName('LowerArmR'),hand=root.getObjectByName('HandSlotR');
 if(!upper||!lower||!hand)throw Error('Prone arm chain missing');
 const rest=new Map();root.traverse(n=>{if(n.isBone)rest.set(n,{p:n.position.clone(),q:n.quaternion.clone()});});
 const changed=[upper,lower,hand],mixer=new THREE.AnimationMixer(root),q=new THREE.Quaternion(),parent=new THREE.Quaternion();
 for(const clip of asset.animations){
  const attack=/Attack|Shoot|Throw/.test(clip.name),heavy=/2H_Melee_Attack_(Chop|Diagonal|Sweep)/.test(clip.name),thrust=/Stab|Jab|Lunge|Ranged|Shoot/.test(clip.name),walk=/Walk|Running/.test(clip.name),dead=/Death/.test(clip.name),block=/Block/.test(clip.name);
  if(dead||block)continue;
  const action=mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const times=[],values=new Map(changed.map(n=>[n,[]])),samples=32;
  const variant=/Backhand|Diagonal/.test(clip.name)?1:/Rising|Sweep/.test(clip.name)?2:0;
  for(let i=0;i<=samples;i++){
   const t=i/samples;mixer.setTime(t*clip.duration);let lift=0,swing=0,recovery=0;
   if(attack){lift=THREE.MathUtils.smoothstep(t,0,.27);swing=THREE.MathUtils.smoothstep(t,.27,.49);recovery=THREE.MathUtils.smoothstep(t,.57,1);}
   const carry=-.55,wave=walk?Math.sin(t*Math.PI*2)*.045:0;
   let ux=carry+wave,lx=-.50,uy=0,uz=-.035,wx=-.30,wy=0;
   if(attack){
    const wind=heavy?-2.2:thrust?-1.65:-1.45,contact=heavy?-1.45:thrust?-1.38:-1.15;
    ux=THREE.MathUtils.lerp(carry,wind,lift);ux=THREE.MathUtils.lerp(ux,contact,swing);ux=THREE.MathUtils.lerp(ux,carry,recovery);
    lx=THREE.MathUtils.lerp(-.50,heavy?.20:.08,lift*(1-recovery));
    const side=variant===1?-1:1,arc=(thrust?.16:heavy?.38:.82)*side;
    uy=(lift*(1-swing)*-arc+swing*arc)*(1-recovery);uz=-.035+Math.sin(t*Math.PI)*.10*side;
    wx=THREE.MathUtils.lerp(-.30,heavy?-1.5:-.65,lift);wx=THREE.MathUtils.lerp(wx,heavy?-.32:thrust?-.10:-.25,swing);wx=THREE.MathUtils.lerp(wx,-.30,recovery);
    wy=uy*(heavy?.45:1);if(variant===2&&!thrust)wx-=Math.sin(t*Math.PI)*.17;
   }
   upper.rotation.set(ux,uy,uz);lower.rotation.set(lx,0,0);root.updateMatrixWorld(true);
   // Set the hand's world orientation through its own joint, never detach the
   // weapon or translate its socket away from the fingers.
   q.setFromEuler(new THREE.Euler(wx,wy,0,'YXZ'));hand.parent.getWorldQuaternion(parent);hand.quaternion.copy(parent.invert()).multiply(q);root.updateMatrixWorld(true);
   times.push(t*clip.duration);for(const n of changed)values.get(n).push(...n.quaternion.toArray());
  }
  mixer.stopAllAction();mixer.uncacheClip(clip);
  clip.tracks=clip.tracks.filter(track=>!changed.some(n=>track.name===n.name+'.quaternion'));
  for(const n of changed)clip.tracks.push(new THREE.QuaternionKeyframeTrack(n.name+'.quaternion',times,values.get(n)));
 }
 mixer.uncacheRoot(root);for(const[n,r]of rest){n.position.copy(r.p);n.quaternion.copy(r.q);}root.updateMatrixWorld(true);
 root.userData.proneCombatVersion=1;root.userData.weaponGrip=[0,0,0];root.userData.weaponSocketRotation=[0,0,0];
 return asset;
}
