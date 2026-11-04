import * as THREE from 'three';
import {Trellis2Material} from './trellis2-material.js';

// One lighting model for the arena, imported avatars and crafted props. This is
// real diffuse cel shading, so the battery renderer does not depend on post FX.
// Analytic ramps use derivatives to soften only the band boundary (no ramp map).
const ramp=`
vec3 getGradientIrradiance(vec3 normal, vec3 lightDirection) {
 float d=dot(normal,lightDirection), aa=max(fwidth(d)*.65,max(.008,cartoonSoftness));
 float mid=smoothstep(-.12-aa,-.12+aa,d);
 float lit=smoothstep(.58-aa,.58+aa,d);
 return mix(mix(vec3(.16,.22,.36),vec3(.61,.65,.78),mid),vec3(1.,.98,.94),lit);
}`;

export const CARTOON_LIGHTING=Object.freeze({
 sky:'#d9eeff',ground:'#625470',ambient:.9,
 key:'#fff0d9',keyIntensity:2.55,rim:'#bdd8ff',rimIntensity:.48
});

export class CartoonMaterial extends THREE.MeshToonMaterial {
 constructor(parameters={}, {ink=.65,gloss=0}={}) {
  super(parameters);
  this.cartoonInk=ink;this.cartoonGloss=gloss;this.avatarTint=null;
  this.atelierPalette=null;
  this.userData.cartoon=true;
 }
 onBeforeCompile(shader) {
  if(this.userData.referenceCat){
   shader.uniforms.catScale={value:this.userData.mascotSourceScale||1};shader.uniforms.catBase={value:this.userData.mascotSourceBase||0};
   shader.vertexShader='varying vec3 catRest;uniform float catScale,catBase;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncatRest=position/catScale;catRest.y+=catBase;');
   shader.fragmentShader='varying vec3 catRest;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float capFront=smoothstep(-.12,.18,catRest.z);
    float crest=1.39+.14*exp(-pow(catRest.x/.19,2.))-.13*pow(abs(catRest.x)/.91,1.7);
    crest=mix(.98,crest,capFront);
    float aa=max(fwidth(catRest.y-crest),.001);
    float eligible=max(step(.70,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b))),step(.15,diffuseColor.b-diffuseColor.r)*step(.3,diffuseColor.b));
    diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(1.,.9823,.9301),vec3(.2831,.491,.6105),smoothstep(-aa,aa,catRest.y-crest)),eligible);`);
  }
  if(this.userData.mascotCap){
   shader.uniforms.mascotBody={value:this.color};shader.uniforms.mascotBlue={value:new THREE.Color('#76a5c2')};
   shader.vertexShader='varying vec3 mascotRest;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmascotRest=position;');
   shader.fragmentShader='varying vec3 mascotRest;uniform vec3 mascotBody,mascotBlue;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float crest=1.50+.18*exp(-pow(mascotRest.x/.24,2.))+.025*pow(abs(mascotRest.x)/.8,2.);
    crest=mix(1.28,crest,smoothstep(-.20,.08,mascotRest.z));
    float aa=max(fwidth(mascotRest.y-crest),.001);
    diffuseColor.rgb=mix(mascotBody,mascotBlue,smoothstep(-aa,aa,mascotRest.y-crest));`);
  }
  shader.uniforms.cartoonInk={value:this.cartoonInk};
  shader.uniforms.cartoonGloss={value:this.cartoonGloss};
  shader.uniforms.cartoonSoftness={value:this.userData.cartoonSoftness||0};
  shader.fragmentShader='uniform float cartoonInk,cartoonGloss,cartoonSoftness;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <gradientmap_pars_fragment>',ramp);
  // A small, hard highlight keeps blades/gems readable without PBR reflections.
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_toon_pars_fragment>',
   THREE.ShaderChunk.lights_toon_pars_fragment.replace(
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
    `reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
     float shine=dot(geometryNormal,normalize(directLight.direction+geometryViewDir));
     float width=max(fwidth(shine),.004);
     reflectedLight.directSpecular+=directLight.color*cartoonGloss*.22*smoothstep(.965-width,.965+width,shine);`));
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   outgoingLight+=reflectedLight.directSpecular;
   float edge=1.-smoothstep(.025,.19,abs(dot(normal,normalize(vViewPosition))));
   outgoingLight=mix(outgoingLight,diffuseColor.rgb*vec3(.19,.23,.34),edge*cartoonInk);
   ${this.userData.seamlessMascot?'outgoingLight=mix(diffuseColor.rgb*.95,outgoingLight,.48);':''}
   #include <opaque_fragment>`);
  if(this.avatarTint){
   shader.uniforms.avatarTint={value:this.avatarTint};
   shader.fragmentShader='uniform vec3 avatarTint;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float clothLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb=mix(diffuseColor.rgb,avatarTint*(.45+clothLuma*.8),.9);`);
  }
  if(this.atelierPalette){
   shader.uniforms.atelierArmor={value:this.atelierPalette.armor};shader.uniforms.atelierCoat={value:this.atelierPalette.coat};
   shader.uniforms.atelierHeadY={value:this.userData.paletteHeadY??1.94};
   shader.vertexShader='varying float atelierHeight;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\natelierHeight=position.y;');
   shader.fragmentShader='uniform vec3 atelierArmor,atelierCoat;uniform float atelierHeadY;varying float atelierHeight;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    float chroma=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
    float garment=1.-smoothstep(atelierHeadY-.08,atelierHeadY,atelierHeight);
    float coat=smoothstep(.008,.045,diffuseColor.b-diffuseColor.r)*smoothstep(-.02,.025,diffuseColor.b-diffuseColor.g)*garment;
    float armor=smoothstep(.19,.48,luma)*(1.-smoothstep(.07,.18,chroma))*garment*(1.-coat);
    diffuseColor.rgb=mix(diffuseColor.rgb,atelierArmor*(.22+luma*.9),armor*.85);
    diffuseColor.rgb=mix(diffuseColor.rgb,atelierCoat*(.35+luma*1.4),coat*.88);`);
  }
 }
 customProgramCacheKey(){return 'cartoon-v5-'+Boolean(this.avatarTint)+'-'+Boolean(this.userData.mascotCap)+'-'+Boolean(this.atelierPalette)+'-'+Boolean(this.userData.seamlessMascot)+'-'+Boolean(this.userData.referenceCat);}
 copy(source){
  super.copy(source);
  this.cartoonInk=source.cartoonInk??.65;this.cartoonGloss=source.cartoonGloss??0;
  this.avatarTint=source.avatarTint?.clone()??null;
  this.atelierPalette=source.atelierPalette?{armor:source.atelierPalette.armor.clone(),coat:source.atelierPalette.coat.clone()}:null;
  this.userData.cartoon=true;
  return this;
 }
}

// Preserve skinning/vertex colors, texture UVs, alpha cutouts, AO and custom
// palettes. The cached source asset is left intact for export and reuse.
export function cartoonizeMaterial(source,{ink=.65,gloss}={}){
 if(source.userData.trellis2)return new Trellis2Material(source);
 if(source instanceof CartoonMaterial)return source.clone();
 const material=new CartoonMaterial({}, {ink,gloss:gloss??Math.min(.65,(source.metalness||0)*.75)});
 THREE.Material.prototype.copy.call(material,source);
 for(const key of ['color','emissive','normalScale'])if(source[key])material[key].copy(source[key]);
 for(const key of ['map','emissiveMap','emissiveIntensity','alphaMap','lightMap','lightMapIntensity','aoMap','aoMapIntensity','normalMap','normalMapType','bumpMap','bumpScale','displacementMap','displacementScale','displacementBias','flatShading','wireframe','fog']){
  if(source[key]!==undefined)material[key]=source[key];
 }
 material.userData.cartoon=true;
 return material;
}
