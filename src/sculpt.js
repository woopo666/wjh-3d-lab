import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Continuous tapered forms. Cross sections follow a parallel transport frame,
// avoiding the disconnected balls and constant-width tubes of the blockout.
export function sweep(points,radii,{segments=32,sides=12,flat=1}={}){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),g=new THREE.TubeGeometry(curve,segments,1,sides,false),p=g.attributes.position;
 for(let j=0;j<=segments;j++){const t=j/segments,f=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(f)),r=THREE.MathUtils.lerp(radii[k],radii[k+1],f-k),c=curve.getPointAt(t);for(let i=0;i<=sides;i++){const n=j*(sides+1)+i;p.setXYZ(n,c.x+(p.getX(n)-c.x)*r,c.y+(p.getY(n)-c.y)*r*flat,c.z+(p.getZ(n)-c.z)*r);}}
 g.computeVertexNormals();return g;
}

export function patch(uCount,vCount,point){const p=[],uv=[],indices=[];for(let j=0;j<=vCount;j++)for(let i=0;i<=uCount;i++){p.push(...point(i/uCount,j/vCount));uv.push(i/uCount,j/vCount);}for(let j=0;j<vCount;j++)for(let i=0;i<uCount;i++){const k=j*(uCount+1)+i;indices.push(k,k+uCount+1,k+1,k+1,k+uCount+1,k+uCount+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;}

export function feather(length=.8,width=.13,curve=.12){
 return patch(8,18,(u,v)=>{const w=width*Math.pow(Math.sin(v*Math.PI),.65)*(1-.35*v),x=(u-.5)*2*w;return [x,Math.sin(u*Math.PI)*.025+curve*v*v,v*length];});
}

// Merge only meshes under the same motion pivot: animated wings and jaws stay separate.
export function batchPivot(group){const batches=new Map(),original=[];group.updateMatrixWorld(true);for(const child of [...group.children]){if(child.isGroup){batchPivot(child);continue;}if(!child.isMesh)continue;child.updateMatrix();let g=child.geometry.clone().applyMatrix4(child.matrix);if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(g);original.push(child);}
 for(const child of original){child.removeFromParent();child.geometry.dispose();}
 for(const [mat,parts]of batches){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());const m=new THREE.Mesh(g,mat);m.castShadow=!mat.transparent;m.receiveShadow=true;group.add(m);}
}
