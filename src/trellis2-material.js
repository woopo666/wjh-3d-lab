import * as THREE from 'three';

// TL2 atlases contain roughness and metallic information. Keep those channels
// and a gentle stylized light response instead of flattening them into toon RGB.
export class Trellis2Material extends THREE.MeshStandardMaterial {
 constructor(source){
  super();if(source)super.copy(source);this.userData.trellis2=true;
  this.roughness=Math.max(.6,source?.roughness??1);this.envMapIntensity=.55;
  // Generated cloth, hair and wing membranes contain intentional open sheets.
  // Render their reverse surface instead of exposing triangular cutouts.
  this.side=THREE.DoubleSide;
  this.atelierPalette=null;this.avatarTint=null;
 }
 onBeforeCompile(shader){
  if(this.atelierPalette){
   shader.uniforms.tl2Armor={value:this.atelierPalette.armor};shader.uniforms.tl2Coat={value:this.atelierPalette.coat};
   shader.uniforms.tl2HeadY={value:this.userData.paletteHeadY??1.94};
   shader.vertexShader='varying float tl2Height;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntl2Height=position.y;');
   shader.fragmentShader='uniform vec3 tl2Armor,tl2Coat;uniform float tl2HeadY;varying float tl2Height;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    float chroma=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
    float garment=1.-smoothstep(tl2HeadY-.08,tl2HeadY,tl2Height);
    float coat=smoothstep(.008,.045,diffuseColor.b-diffuseColor.r)*smoothstep(-.02,.025,diffuseColor.b-diffuseColor.g)*garment;
    float armor=smoothstep(.19,.48,luma)*(1.-smoothstep(.07,.18,chroma))*garment*(1.-coat);
    diffuseColor.rgb=mix(diffuseColor.rgb,tl2Armor*(.22+luma*.9),armor*.85);
    diffuseColor.rgb=mix(diffuseColor.rgb,tl2Coat*(.35+luma*1.4),coat*.88);`);
  }
 }
 customProgramCacheKey(){return 'gfd-tl2-pbr-1'+(this.atelierPalette?'-palette':'');}
 copy(source){super.copy(source);this.atelierPalette=source.atelierPalette;this.avatarTint=source.avatarTint;return this;}
}
