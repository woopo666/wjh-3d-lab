import * as THREE from 'three';
import {fableClips} from './fable-characters.js';
import {fitHumanoidHealthClips} from './humanoid-health-clips.js';

export function healthStance(hp){return hp<=0?'dead':hp<=10?'crawl':hp<=20?'exhausted':hp>=60?'vigorous':'normal';}
export function healthClip(hp,walking,running=false){
 switch(healthStance(hp)){
  case 'crawl':return walking?'Crawl_Walk':'Crawl_Idle';
  case 'exhausted':return walking?'Exhausted_Walk':'Exhausted_Idle';
  case 'vigorous':if(!walking)return 'Vigorous_Idle';
 }
 return walking?(running?'Running_A':'Walking_A'):'Idle';
}
const healthName=/^(Crawl_|Exhausted_|Vigorous_)/;
// Older rigs receive the same poses, retargeted to their own bind rotations.
// Positions, movement speeds and all combat values stay in the game engine.
export function addHealthClips(asset,definition={}){
 if(definition.authored&&definition.family!=='mascot'&&!definition.prone)fitHumanoidHealthClips(asset);
 const existing=new Set(asset.animations.map(c=>c.name));
 if(existing.has('Crawl_Idle')&&existing.has('1H_Melee_Attack_Backhand'))return;
 const nodes=new Map();asset.scene.traverse(o=>{if(o.isBone)nodes.set(o.name.replace(/[._-]/g,'').toLowerCase(),o);});
 const aliases={hips:['hips','pelvis'],chest:['chest','spine2','spine'],upperarmr:['upperarmr','armr'],upperarml:['upperarml','arml'],lowerarmr:['lowerarmr','forearmr'],lowerarml:['lowerarml','forearml'],thighr:['thighr','uplegr'],thighl:['thighl','uplegl'],shinr:['shinr','legr'],shinl:['shinl','legl']};
 const find=name=>(aliases[name.toLowerCase()]||[name.toLowerCase()]).map(n=>nodes.get(n)).find(Boolean),hip=find('Hips');if(!hip)return;
 const q=new THREE.Quaternion();
 for(const source of fableClips('generic',hip.position.y).filter(c=>(healthName.test(c.name)||c.name.includes('Melee_Attack'))&&!existing.has(c.name))){
  const tracks=[];
  for(const original of source.tracks){const [name,property]=original.name.split('.'),node=find(name);if(!node)continue;const t=original.clone();t.name=node.name+'.'+property;
   if(property==='quaternion')for(let i=0;i<t.values.length;i+=4){q.fromArray(t.values,i).premultiply(node.quaternion).toArray(t.values,i);}
   else for(let i=0;i<t.values.length;i+=3){t.values[i]=node.position.x;t.values[i+2]=node.position.z;}
   tracks.push(t);
  }
  asset.animations.push(new THREE.AnimationClip(source.name,source.duration,tracks));
 }
}
export function measureCrawlLift(asset){
 if(asset.crawlLift!==undefined)return asset.crawlLift;
 if(asset.fittedHealthClips)return asset.crawlLift=0;
 const clips=asset.animations.filter(c=>c.name.startsWith('Crawl_'));if(!clips.length)return asset.crawlLift=0;
 const mixer=new THREE.AnimationMixer(asset.scene),bounds=new THREE.Box3(),part=new THREE.Box3();let min=Infinity;
 for(const clip of clips){mixer.stopAllAction();mixer.clipAction(clip).play();for(let i=0;i<5;i++){mixer.setTime(clip.duration*i/4);asset.scene.updateMatrixWorld(true);bounds.makeEmpty();asset.scene.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();bounds.union(part.copy(o.boundingBox).applyMatrix4(o.matrixWorld));}});min=Math.min(min,bounds.min.y);}}
 mixer.stopAllAction();mixer.uncacheRoot(asset.scene);asset.scene.updateMatrixWorld(true);
 return asset.crawlLift=Math.max(0,.045-min);
}
export function healthBodyPose(actor,state,dt,busy){
 const r=actor.rig,stance=healthStance(state.hp);
 if(stance==='dead'){actor.body.scale.setScalar(1);r.healthLift=0;return;}
 const targetScale=stance==='vigorous'?1.12:1;
 actor.body.scale.setScalar(THREE.MathUtils.damp(actor.body.scale.x,targetScale,7,dt));
 const lift=!busy&&stance==='crawl'?measureCrawlLift(r.asset)*r.scale:0;
 r.healthLift=THREE.MathUtils.damp(r.healthLift||0,lift,12,dt);actor.body.position.y+=r.healthLift;
 // Cosmetic weapons rest across the back while crawling instead of piercing the floor.
 if(actor.held&&!r.prone&&!busy&&stance==='crawl'){actor.held.position.set(0,.08,-.1);actor.held.rotation.set(-2.7,0,.5);}
}
