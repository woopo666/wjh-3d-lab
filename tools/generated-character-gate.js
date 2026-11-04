import * as THREE from 'three';

// Called before an authored model can be exported to public/. This numerical
// gate complements (and never substitutes for) six-view visual inspection.
export function inspectGeneratedCharacter(asset,{triangleBudget=50000}={}){
 if(!Number.isInteger(triangleBudget)||triangleBudget<1||triangleBudget>100000)throw Error('Invalid triangle budget');
 const failures=[],warnings=[],textures=[],meshes=[];let triangles=0,vertices=0,weightError=0,normalError=0;
 asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();meshes.push(o);}});
 if(!meshes.length)failures.push('No skinned mesh');
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,w=g.attributes.skinWeight,j=g.attributes.skinIndex;
  triangles+=(g.index?.count||p.count)/3;vertices+=p.count;
  if(!n||!w||!j){failures.push('Missing normals or skin attributes');continue;}
  for(let i=0;i<p.count;i++){
   if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))failures.push('Non-finite vertex');
   normalError=Math.max(normalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
   weightError=Math.max(weightError,Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1));
   for(const get of ['getX','getY','getZ','getW'])if(!Number.isFinite(w[get](i))||w[get](i)<0||j[get](i)>=mesh.skeleton.bones.length)failures.push('Invalid skin weight/joint');
  }
  const image=mesh.material.map?.image;if(image){textures.push([image.width,image.height]);if(Math.max(image.width,image.height)>2048)failures.push('Texture exceeds 2K production budget');}else failures.push('Missing albedo atlas');
 }
 if(triangles>triangleBudget)failures.push('Triangle budget exceeds '+triangleBudget);
 if(weightError>1e-4)failures.push('Skin weights are not normalized');if(normalError>.01||!Number.isFinite(normalError))failures.push('Normals are not normalized');
 for(const name of ['Idle','Walking_A','Death_A','Block_Hit'])if(!asset.animations.some(c=>c.name===name))failures.push('Missing '+name);
 const mixer=new THREE.AnimationMixer(asset.scene),v=new THREE.Vector3(),bounds=new THREE.Box3().setFromObject(asset.scene),height=bounds.max.y-bounds.min.y;let poses=0,maxExtent=0;
 for(const clip of asset.animations)for(const fraction of [0,.2,.5,.8,1]){
  mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopOnce,1).play();action.clampWhenFinished=true;mixer.update(clip.duration*fraction);asset.scene.updateMatrixWorld(true);
  for(const mesh of meshes){mesh.skeleton.update();const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i+=23){v.fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);if(!Number.isFinite(v.lengthSq()))failures.push('Non-finite pose '+clip.name);maxExtent=Math.max(maxExtent,Math.abs(v.x),Math.abs(v.y),Math.abs(v.z));}}poses++;
 }
 mixer.stopAllAction();mixer.uncacheRoot(asset.scene);asset.scene.updateMatrixWorld(true);
 if(maxExtent>height*3.8)failures.push('Pose escaped bounds');
 const result={version:1,ok:failures.length===0,triangleBudget,triangles,vertices,meshes:meshes.length,textures,weightError,normalError,poses,maxExtent,failures:[...new Set(failures)],warnings};
 if(!result.ok)throw Error('Generated character export rejected: '+JSON.stringify(result));return result;
}
