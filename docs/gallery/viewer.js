import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {cartoonizeMaterial} from '../../src/cartoon-material.js';

function release(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}if(o.skeleton)skeletons.add(o.skeleton);});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();t.source?.data?.close?.();}for(const s of skeletons)s.dispose();
}
export function createViewer(host,onStatus){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.setClearColor('#172233');host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D model — drag to rotate, scroll to zoom');renderer.domElement.tabIndex=0;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);scene.add(new THREE.HemisphereLight(0xe4efff,0x5b5670,2.1));const key=new THREE.DirectionalLight(0xffedda,3);key.position.set(-3,6,7);scene.add(key);const rim=new THREE.DirectionalLight(0xaccfff,1.8);rim.position.set(4,4,-4);scene.add(rim);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.06);scene.environment=env.texture;scene.environmentIntensity=.5;release(room);pmrem.dispose();
 const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.autoRotateSpeed=1.3;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI-.08;
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),clock=new THREE.Clock();let asset=null,mixer=null,dead=false,revision=0,abort=null,playing=false,auto=false,frameCount=0,savedDistance=4,center=new THREE.Vector3(),clips=[];
 function render(){if(dead||document.hidden)return;renderer.render(scene,camera);frameCount++;}
 controls.addEventListener('change',render);
 function loop(){const dt=Math.min(clock.getDelta(),.06);if(playing)mixer?.update(dt);if(auto)controls.update(dt);render();}
 function schedule(){renderer.setAnimationLoop(!dead&&!document.hidden&&(playing||auto)?loop:null);clock.getDelta();render();}
 function resize(){if(dead)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
 const observer=new ResizeObserver(resize);observer.observe(host);document.addEventListener('visibilitychange',schedule);
 function clear(){if(!asset)return;mixer?.stopAllAction();mixer?.uncacheRoot(asset.scene);scene.remove(asset.scene);release(asset.scene);asset=null;mixer=null;clips=[];renderer.renderLists.dispose();}
 function reset(){camera.position.copy(center).add(new THREE.Vector3(0,0,savedDistance));controls.target.copy(center);controls.update();render();}
 async function load(record){
  const version=++revision;abort?.abort();abort=new AbortController();clear();playing=false;auto=false;controls.autoRotate=false;schedule();onStatus({state:'loading',label:record.label});
  try{
   const url=new URL(record.model.path,location.href);const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw Error('Model download failed ('+response.status+')');const buffer=await response.arrayBuffer();if(dead||version!==revision)return;
   const loaded=await loader.parseAsync(buffer,new URL('.',url).href);if(dead||version!==revision){release(loaded.scene);return;}
   asset=loaded;asset.scene.traverse(o=>{if(!o.isMesh)return;const originals=Array.isArray(o.material)?o.material:[o.material];const converted=originals.map(m=>{const next=cartoonizeMaterial(m,{ink:.14});m.dispose();return next;});o.material=Array.isArray(o.material)?converted:converted[0];});scene.add(asset.scene);asset.scene.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(asset.scene);bounds.getCenter(center);const size=bounds.getSize(new THREE.Vector3());savedDistance=Math.max(size.y,size.x/camera.aspect,size.z)*.68/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));camera.near=Math.max(.001,savedDistance/1000);camera.far=savedDistance*30;camera.updateProjectionMatrix();controls.minDistance=savedDistance*.25;controls.maxDistance=savedDistance*3;
   mixer=new THREE.AnimationMixer(asset.scene);clips=asset.animations;reset();onStatus({state:'ready',label:record.label,clips:clips.map(c=>c.name),triangles:record.model.triangles});
  }catch(e){if(e.name==='AbortError'||dead||version!==revision)return;onStatus({state:'error',message:e.message});}
 }
 function animate(name){mixer?.stopAllAction();playing=Boolean(name);if(name){const clip=clips.find(c=>c.name===name);if(clip)mixer.clipAction(clip).reset().play();else playing=false;}mixer?.update(0);schedule();}
 function dispose(){if(dead)return;dead=true;revision++;abort?.abort();renderer.setAnimationLoop(null);observer.disconnect();document.removeEventListener('visibilitychange',schedule);controls.removeEventListener('change',render);controls.dispose();clear();env.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
 resize();return {load,reset,animate,dispose,autoRotate(value){auto=value;controls.autoRotate=value;schedule();},state(){return {dead,loaded:!!asset,camera:camera.position.toArray(),frameCount,playing,auto,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}};
}
