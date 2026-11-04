import {AnimationClip,QuaternionKeyframeTrack,VectorKeyframeTrack,Quaternion,Euler,Box3,Vector3} from 'three';
// Fit the sprint to bind joints, never stretch a thigh or translate a knee.
export function runningClip(root,{prone=false,body}={}){
 if(prone)return null;
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 if(!['Hips','ThighR','ThighL','ShinR','ShinL'].every(n=>bones.has(n)))return null;
 const short=body==='mascot'||body==='chibi',duration=.62,times=Array.from({length:17},(_,i)=>duration*i/16),tracks=[],q=new Quaternion(),e=new Euler();
 const add=(name,pose)=>{const bone=bones.get(name);if(!bone)return;const values=[];for(let i=0;i<times.length;i++){e.set(...pose(i/16));q.setFromEuler(e).premultiply(bone.quaternion).toArray(values,values.length);}tracks.push(new QuaternionKeyframeTrack(name+'.quaternion',times,values));};
 for(const [side,offset]of [['R',0],['L',.5]]){
  const cycle=t=>(t+offset)%1;
  add('Thigh'+side,t=>[(short?.65:.92)*Math.cos(cycle(t)*Math.PI*2),0,0]);
  // Heel recovery is concentrated in the airborne half of each stride.
  add('Shin'+side,t=>[.16+(short?.82:1.38)*Math.max(0,Math.sin(cycle(t)*Math.PI*2)),0,0]);
  add('UpperArm'+side,t=>[-.6*Math.cos(cycle(t)*Math.PI*2),0,side==='R'?.28:-.28]);
  add('LowerArm'+side,()=>[short?-.55:-1.15,0,0]);
 }
 add('Chest',t=>[.17,.08*Math.sin(t*Math.PI*2),0]);add('Head',()=>[-.1,0,0]);
 const hip=bones.get('Hips').position,h=Math.max(.6,new Box3().setFromObject(root).getSize(new Vector3()).y),values=[];
 for(let i=0;i<times.length;i++){const t=i/16;values.push(hip.x,hip.y+h*(.025+.027*Math.cos(t*Math.PI*4)),hip.z);}
 tracks.push(new VectorKeyframeTrack('Hips.position',times,values));
 return new AnimationClip('Running_A',duration,tracks);
}
