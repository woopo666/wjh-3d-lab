import * as THREE from 'three';
import {createGltfLoader} from '../src/gltf-loader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {cartoonizeMaterial,CARTOON_LIGHTING as CEL} from '../src/cartoon-material.js';
import {addHealthClips} from '../src/health-pose.js';
import {fitDefenseClip} from '../src/defense-motion.js';
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setSize(420,500);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NeutralToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.style.cssText='margin:0;background:#19263d';document.body.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(29,420/500,.01,60);scene.add(new THREE.HemisphereLight(CEL.sky,CEL.ground,CEL.ambient));
const pmrem=new THREE.PMREMGenerator(renderer),studio=new RoomEnvironment(),environment=pmrem.fromScene(studio,.06);scene.environment=environment.texture;scene.environmentIntensity=.5;studio.dispose();pmrem.dispose();
for(const [color,intensity,pos]of [[CEL.key,CEL.keyIntensity,[-3,6,7]],[CEL.rim,CEL.rimIntensity,[4,4,-4]]]){const l=new THREE.DirectionalLight(color,intensity);l.position.set(...pos);scene.add(l);}
let asset,definition,mixer,meshes=[];const originalMaterials=[];
function dispose(){if(!asset)return;mixer.stopAllAction();mixer.uncacheRoot(asset.scene);scene.remove(asset.scene);const gs=new Set(),ms=new Set(originalMaterials),ts=new Set(),ss=new Set();for(const m of meshes){gs.add(m.geometry);ms.add(m.material);if(m.skeleton)ss.add(m.skeleton);}for(const m of ms){for(const v of Object.values(m))if(v?.isTexture)ts.add(v);m.dispose();}for(const g of gs)g.dispose();for(const t of ts)t.dispose();for(const s of ss)s.dispose();originalMaterials.length=0;asset=null;meshes=[];renderer.renderLists.dispose();}
async function load(def){dispose();definition=def;asset=await createGltfLoader().loadAsync(def.url||'/assets/characters/'+def.asset);if(!asset.animations.length)asset.animations.push(new THREE.AnimationClip('Idle',1,[]));else addHealthClips(asset,def);if(def.auditDefense)fitDefenseClip(asset,def);mixer=new THREE.AnimationMixer(asset.scene);asset.scene.traverse(o=>{if(o.isMesh){originalMaterials.push(o.material);if(def.trellis2)o.material.userData.trellis2=true;o.material=def.unlit?new THREE.MeshBasicMaterial({map:o.material.map,side:THREE.DoubleSide}):cartoonizeMaterial(o.material,{ink:.14});if(def.noPbrMaps){o.material.roughnessMap=null;o.material.metalnessMap=null;o.material.metalness=0;o.material.roughness=1;}if(def.normals)o.material=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});meshes.push(o);}});scene.add(asset.scene);pose('Idle',.22);view(0);return {id:def.id,clips:asset.animations.length};}
function pose(name,f=.22){mixer.stopAllAction();if(name==='Rest'){asset.scene.updateMatrixWorld(true);for(const m of meshes)m.skeleton?.update();return;}const clip=asset.animations.find(c=>c.name===name);if(!clip)throw Error('Missing clip '+name);const a=mixer.clipAction(clip).reset();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.update(clip.duration*f);asset.scene.updateMatrixWorld(true);for(const m of meshes)m.skeleton?.update();}
function bounds(){const b=new THREE.Box3();for(const m of meshes){if(m.isSkinnedMesh){m.computeBoundingBox();b.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld));}else b.union(new THREE.Box3().setFromObject(m));}return b;}
function view(angle=0,transparent=false){const b=bounds(),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3()),d=Math.max(size.y*1.10,Math.max(size.x,size.z)*1.10/camera.aspect)/2/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));camera.position.set(c.x+Math.sin(angle)*d,c.y+size.y*.06,c.z+Math.cos(angle)*d);camera.lookAt(c);camera.updateProjectionMatrix();renderer.setClearColor('#19263d',transparent?0:1);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');}
function audit(){const failures=[],v=new THREE.Vector3(),base=bounds(),h=base.max.y-base.min.y;let triangles=0,vertices=0,weightError=0,normalError=0;const poses=[];
 for(const mesh of meshes){const g=mesh.geometry;triangles+=(g.index?.count||g.attributes.position.count)/3;vertices+=g.attributes.position.count;const p=g.attributes.position,n=g.attributes.normal,w=g.attributes.skinWeight,j=g.attributes.skinIndex;if(!w||!j)failures.push('Missing skin');else for(let i=0;i<p.count;i++){weightError=Math.max(weightError,Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1));normalError=Math.max(normalError,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));for(const get of ['getX','getY','getZ','getW'])if(!Number.isFinite(w[get](i))||w[get](i)<0||j[get](i)>=mesh.skeleton.bones.length)failures.push('Invalid skin');}}
 for(const clip of asset.animations)for(const f of [0,.2,.5,.8,1]){pose(clip.name,f);let extent=0;for(const m of meshes){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i+=29){v.fromBufferAttribute(p,i);m.applyBoneTransform(i,v);if(!Number.isFinite(v.lengthSq()))failures.push('Nonfinite '+clip.name);extent=Math.max(extent,Math.abs(v.x),Math.abs(v.y),Math.abs(v.z));}}if(extent>h*3.8)failures.push('Unbounded '+clip.name);poses.push({clip:clip.name,f,extent});}
 if(weightError>1e-4)failures.push('Weight normalization');if(normalError>.01)failures.push('Normal normalization');pose('Idle');view(0);
 const ext=renderer.getContext().getExtension('WEBGL_debug_renderer_info');return {id:definition.id,triangles,vertices,meshCount:meshes.length,bones:meshes[0]?.skeleton?.bones.length,clips:asset.animations.length,poses:poses.length,weightError,normalError,failures,drawCalls:renderer.info.render.calls,renderer:ext?renderer.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'};
}
function detail({angle=0,region='head',clay=false,width=720,height=800,featuresOnly=false}={}){
 const box=bounds(),span=box.max.y-box.min.y,target=box.clone();
 if(region==='head')target.min.y=box.max.y-span*.23;
 else if(region==='legs')target.max.y=box.min.y+span*.56;
 const center=target.getCenter(new THREE.Vector3()),size=target.getSize(new THREE.Vector3());
 if(region==='head'){center.x=0;center.z=0;size.x=span*.30;size.z=span*.30;
  if(definition.body==='mascot'){center.y=box.min.y+span*(definition.id.includes('Usagi')?.56:.64);size.set(span*.78,span*.62,span*.7);}
  if(definition.body==='prone'){center.y=box.min.y+span*.61;center.z=span*.12;size.set(span*.90,span*.68,span*.7);}
 }
 renderer.setSize(width,height);camera.aspect=width/height;
 const distance=Math.max(size.y*1.16,size.x*1.06/camera.aspect)/2/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
 camera.position.set(center.x+Math.sin(angle)*distance,center.y,center.z+Math.cos(angle)*distance);camera.lookAt(center);camera.updateProjectionMatrix();
 const override=clay?new THREE.MeshStandardMaterial({color:0xd1b9a3,roughness:.68}):null;scene.overrideMaterial=override;
 if(featuresOnly)meshes.forEach(m=>m.visible=/fitted-face|facial-surface/.test(m.material.name));
 renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');meshes.forEach(m=>m.visible=true);scene.overrideMaterial=null;override?.dispose();renderer.setSize(420,500);camera.aspect=420/500;
 return png;
}
function inspect(){return{bounds:bounds().toJSON?.()||{min:bounds().min.toArray(),max:bounds().max.toArray()},bones:meshes[0].skeleton.bones.map(b=>({name:b.name,position:b.getWorldPosition(new THREE.Vector3()).toArray()}))};}
function surfacePoint(x,y,width=720,height=800){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);return ray.intersectObjects(meshes,false).slice(0,4).map(hit=>({point:hit.point.toArray(),local:hit.object.worldToLocal(hit.point.clone()).toArray(),face:hit.faceIndex}));}
window.characterAudit={load,pose,view,detail,inspect,surfacePoint,audit,dispose,ready:true};
