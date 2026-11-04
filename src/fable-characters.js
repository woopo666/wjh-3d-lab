import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {patch,sweep} from './sculpt.js';

// Four separately authored silhouettes. No geometry from the human prophet asset
// is reused. Meshes are indexed and batched by material onto a shared skeleton.
const palettes={
 sera:{skin:'#ffe1cb',hair:'#bf576f',cloth:'#8d314e',armor:'#f0e8e4',gold:'#d4a45c',eye:'#5ab6b0',gem:'#ee8ca5'},
 lune:{skin:'#ffe5da',hair:'#ddd8f2',cloth:'#493968',armor:'#9182c5',gold:'#dfbc78',eye:'#a588e0',gem:'#91ddeb'},
 koha:{skin:'#d88139',hair:'#a95229',cloth:'#255f60',armor:'#c8955d',gold:'#dfbb7b',eye:'#60c3a9',gem:'#6de0c5'},
 moru:{skin:'#718889',hair:'#335d57',cloth:'#244948',armor:'#b1c3ba',gold:'#bca372',eye:'#89ffdf',gem:'#7cf3dc'}
};

// Y/radius-X/radius-Z/center-Z/center-X sections, interpolated as one surface.
function loft(sections,segments=32,rows=30){
 const curve=new THREE.CatmullRomCurve3(sections.map(s=>new THREE.Vector3(s[1],s[0],s[2])));
 const centers=new THREE.CatmullRomCurve3(sections.map(s=>new THREE.Vector3(s[4]||0,s[0],s[3]||0)));
 return patch(segments,rows,(u,v)=>{const p=curve.getPoint(v),c=centers.getPoint(v),a=u*Math.PI*2;return [c.x+Math.sin(a)*Math.max(.001,p.x),p.y,c.z+Math.cos(a)*Math.max(.001,p.z)];});
}

function rigBuilder(kind){
 const golem=kind==='moru',fox=kind==='koha',p=palettes[kind];
 const scene=new THREE.Group();scene.name='Fable-'+kind;
 const bones=[],ids={},batches=new Map(),joint={};
 const bone=(name,parent,x,y,z=0)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);ids[name]=bones.length;bones.push(b);joint[name]=b;(parent?joint[parent]:scene).add(b);return b;};
 const hip=golem?.78:fox?.76:.72,shoulder=golem?.62:fox?.39:.37,chest=golem?1.23:1.13,head=golem?1.70:1.67;
 bone('Hips',null,0,hip);bone('Chest','Hips',0,chest-hip);bone('Head','Chest',0,head-chest);
 bone('Cape','Chest',0,.02,-.19);bone('Hair','Head',0,.14,-.12);bone('Tail','Hips',0,0,-.24);
 for(const [s,x]of [['R',-1],['L',1]]){
  bone('UpperArm'+s,'Chest',x*shoulder,.01);bone('LowerArm'+s,'UpperArm'+s,0,golem?-.30:-.23);bone('HandSlot'+s,'LowerArm'+s,0,golem?-.31:-.24,.025);
  bone('Thigh'+s,'Hips',x*(golem?.29:.17),-.04);bone('Shin'+s,'Thigh'+s,0,golem?-.32:-.28);bone('Foot'+s,'Shin'+s,0,-.27,.04);
 }
 scene.updateMatrixWorld(true);
 const materials={};
 for(const [name,color]of Object.entries({...p,ivory:'#fff5e4',ink:'#242333',white:'#ffffff'})){
  const metallic=['armor','gold'].includes(name),mat=new THREE.MeshStandardMaterial({color,roughness:golem&&name==='armor'?.74:metallic?.36:.68,metalness:golem&&name==='armor'?.12:metallic?.45:0,side:THREE.DoubleSide,vertexColors:true});
  mat.name='fable-'+name;mat.userData.tintSlot=name==='cloth'?'coat':name==='armor'?'armor':null;
  if(name==='eye'||name==='gem'){mat.emissive.set(color);mat.emissiveIntensity=golem?.85:.18;mat.roughness=.28;}
  materials[name]=mat;
 }
 const add=(geometry,material,binding,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],shade)=>{
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale)));
  const n=geometry.attributes.position.count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4),colors=new Float32Array(n*3),point=new THREE.Vector3();
  if(!geometry.index)geometry.setIndex(Array.from({length:n},(_,i)=>i));
  for(let i=0;i<n;i++){
   indices[i*4]=ids[binding];weights[i*4]=1;point.fromBufferAttribute(geometry.attributes.position,i);
   const tint=shade?shade(point):[1,1,1];colors.set(tint,i*3);
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry);
 };
 const egg=(mat,b,p,s,r=[0,0,0],shade)=>add(new THREE.SphereGeometry(1,28,18),mat,b,p,s,r,shade);
 const tube=(points,r,mat,b='Head',segments=18)=>add(sweep(points,[r,r],{segments,sides:8}),mat,b);
 const strand=(points,radii,mat='hair',b='Hair',flat=.65)=>add(sweep(points,radii,{segments:24,sides:12,flat}),mat,b);
 const ring=(mat,b,p,r,t=.012,rot=[Math.PI/2,0,0])=>add(new THREE.TorusGeometry(r,t,8,32),mat,b,p,[1,1,1],rot);
 const gem=(p,s,mat='gem',b='Chest')=>add(new THREE.OctahedronGeometry(1,1),mat,b,p,s);
 const star=(x,y,z,size,mat='gold',b='Head')=>{
  const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?size*.43:size,px=Math.cos(a)*r,py=Math.sin(a)*r;if(i)shape.lineTo(px,py);else shape.moveTo(px,py);}shape.closePath();
  add(new THREE.ExtrudeGeometry(shape,{depth:.015,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.006,bevelThickness:.005}),mat,b,[x,y,z]);
 };
 return {scene,kind,p,bones,ids,joint,materials,add,egg,tube,strand,ring,gem,star,hip,head,shoulder,chest,
  finish(){
   scene.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
   for(const [key,parts]of batches){const merged=mergeGeometries(parts,false),geometry=mergeVertices(merged);merged.dispose();parts.forEach(g=>g.dispose());const mesh=new THREE.SkinnedMesh(geometry,materials[key]);mesh.name='FableSurface_'+key;mesh.frustumCulled=false;scene.add(mesh);mesh.bind(skeleton);}
   for(const [key,mat]of Object.entries(materials))if(!batches.has(key))mat.dispose();
   return {scene,animations:fableClips(kind,hip),references:0,original:true,deathDrop:hip-.40,style:kind};
  }};
}

function humanoidFace(r){
 const {add,egg,tube,strand,kind}=r,lune=kind==='lune';
 const section=[[1.31,.03,.05,.05],[1.38,.22,.21,.035],[1.51,.38,.32,.01],[1.73,.48,.385],[1.97,.49,.38,-.005],[2.16,.39,.32,-.015],[2.26,.22,.20,-.02],[2.30,.002,.003,-.02]];
 const profile=new THREE.CatmullRomCurve3(section.map(s=>new THREE.Vector3(s[1],s[0],s[2]))).getPoints(400),centers=new THREE.CatmullRomCurve3(section.map(s=>new THREE.Vector3(0,s[0],s[3]||0))).getPoints(400);
 const faceZ=(x,y)=>{let i=1;while(i<profile.length-1&&profile[i].y<y)i++;const a=profile[i-1],b=profile[i],t=THREE.MathUtils.clamp((y-a.y)/(b.y-a.y||1),0,1),rx=THREE.MathUtils.lerp(a.x,b.x,t),rz=THREE.MathUtils.lerp(a.z,b.z,t),cz=THREE.MathUtils.lerp(centers[i-1].z,centers[i].z,t);return cz+rz*Math.sqrt(Math.max(.015,1-(x/rx)**2));};
 add(loft(section,48,42),'skin','Head',[0,0,0],[1,1,1],[0,0,0],p=>{
  const cheek=Math.exp(-((Math.abs(p.x)-.31)**2/.007+(p.y-1.61)**2/.006))*Math.max(0,p.z)*2.3;
  return [1,1-cheek*.22,1-cheek*.17];
 });
 for(const s of [-1,1]){
  egg('skin','Head',[s*.458,1.73,-.018],[lune?.15:.078,.14,.066],[0,0,s*(lune?.40:0)]);
  const cx=s*.202,cy=1.79;
  // Curved eye patches conform to the face, instead of protruding eyeballs.
  const disk=(mat,x,y,rx,ry,lift)=>add(patch(32,8,(u,v)=>{const a=u*Math.PI*2,px=x+Math.cos(a)*rx*v,py=y+Math.sin(a)*ry*v;return [px,py,faceZ(px,py)+lift+.008*(1-v*v)];}),'white'===mat?'white':mat,'Head');
  disk('ink',cx,cy,.139,.127,.012);disk('white',cx,cy-.006,.129,.117,.019);
  disk('eye',cx-s*.008,cy-.012,.080,.103,.032);disk('ink',cx-s*.008,cy+.007,.039,.060,.045);
  disk('white',cx-.024,cy+.043,.027,.029,.052);disk('white',cx+.035,cy-.061,.012,.014,.054);
  const lash=[];for(let i=0;i<=12;i++){const t=i/12*Math.PI,x=cx+Math.cos(t)*.137,y=cy+Math.sin(t)*.127;lash.push([x,y,faceZ(x,y)+.022]);}tube(lash,.011,'ink');
  tube([[cx+s*.12,cy+.04,faceZ(cx+s*.12,cy+.04)+.023],[cx+s*.156,cy+.069,faceZ(cx+s*.156,cy+.069)+.023]],.011,'ink');
  tube([[cx-.11,2.006,faceZ(cx-.11,2.006)+.008],[cx,2.035,faceZ(cx,2.035)+.01],[cx+.1,2.006,faceZ(cx+.1,2.006)+.008]],.015,'hair');
 }
 egg('skin','Head',[0,1.65,faceZ(0,1.65)+.008],[.037,.026,.032]);
 add(sweep([[-.048,1.51,faceZ(-.048,1.51)+.012],[0,1.498,faceZ(0,1.498)+.012],[.049,1.519,faceZ(.049,1.519)+.012]],[.008,.008],{segments:18,sides:8}),'skin','Head',[0,0,0],[1,1,1],[0,0,0],()=>[.78,.35,.42]);
 // Scalp has an open forehead; individual tapered locks form the fringe.
 add(patch(48,22,(u,v)=>{const a=u*Math.PI*2,front=Math.max(0,Math.cos(a)),end=2.12-front*.85,t=.02+v*end;return [Math.sin(a)*Math.sin(t)*.515,1.85+Math.cos(t)*.48,-.02+Math.cos(a)*Math.sin(t)*.416];}),'hair','Head');
 const fringe=lune?[
  [[-.38,2.16,.18],[-.24,2.19,.33],[-.06,2.06,.396],[.07,1.99,.388]],
  [[-.15,2.26,.13],[.02,2.2,.32],[.22,2.08,.374],[.33,1.96,.325]],
  [[.13,2.24,.17],[.33,2.15,.28],[.42,1.92,.26],[.41,1.76,.25]]
 ]:[
  [[-.39,2.12,.22],[-.25,2.16,.35],[-.08,2.04,.402],[.02,1.96,.404]],
  [[-.21,2.25,.17],[.03,2.19,.32],[.23,2.05,.37],[.34,1.91,.33]],
  [[.12,2.25,.12],[.34,2.16,.25],[.45,1.92,.24],[.41,1.61,.22]]
 ];
 for(const points of fringe){if(lune)points.forEach((p,i)=>{p[1]-=i<2?.11:i===2?.04:0;});strand(points,[.065,.15,.125,.007],'hair','Head',.6);}
 for(const s of [-1,1]){
  strand([[s*.43,2.10,.035],[s*.49,1.83,.012],[s*.47,1.51,.04],[s*(lune?.58:.43),lune?1.04:1.37,lune?-.14:.07]],[.10,.14,.15,.018]);
  if(lune)strand([[s*.34,2.04,-.25],[s*.40,1.58,-.29],[s*.46,1.09,-.28],[s*.57,.87,-.13]],[.13,.19,.17,.025]);
 }
 if(!lune){
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;egg('ivory','Head',[-.40+Math.cos(a)*.09,2.10+Math.sin(a)*.09,.252],[.064,.082,.022],[0,0,a]);}
  egg('gold','Head',[-.40,2.10,.282],[.042,.042,.025]);
 }
}

function compactBody(r){
 const {add,egg,tube,ring,gem,star,kind,shoulder}=r,lune=kind==='lune',fox=kind==='koha';
 // Shaped fitted torso and short rounded limbs; seams lie under cuffs/armor.
 add(loft([[.63,.15,.12],[.74,.255,.18],[.93,.245,.165],[1.13,.31,.175],[1.25,.27,.16],[1.30,.11,.095]],32,26),'cloth','Chest');
 add(loft([[1.23,.085,.09],[1.39,.095,.088]],24,8),'skin','Head');
 for(const [side,s]of [['R',-1],['L',1]]){
  const x=s*shoulder;
  add(loft([[.79,.085,.085,0,x],[.97,.112,.115,0,x],[1.13,.15,.13,0,x],[1.23,.06,.055,0,x]],24,16),'cloth','UpperArm'+side);
  add(loft([[.62,.08,.08,.025,x],[.72,.12,.11,.014,x],[.88,lune?.15:.115,.115,0,x],[.95,.081,.08,0,x]],24,14),lune?'cloth':fox?'skin':'armor','LowerArm'+side);
  egg(fox?'skin':lune?'skin':'armor','HandSlot'+side,[x,.61,.035],[.103,.113,.087]);
  egg(fox?'skin':lune?'skin':'armor','HandSlot'+side,[x-s*.075,.636,.077],[.04,.063,.046],[0,0,s*.35]);
  ring('gold','LowerArm'+side,[x,.70,.025],.096,.014);
  add(loft([[.31,.085,.085,0,s*.17],[.49,.103,.113,0,s*.17],[.70,.13,.13,0,s*.17]],24,14),'cloth','Thigh'+side);
  add(loft([[.09,.12,.15,.038,s*.17],[.22,.105,.115,.014,s*.17],[.4,.115,.105,0,s*.17]],24,14),fox?'hair':lune?'cloth':'armor','Shin'+side);
  egg(fox?'hair':lune?'cloth':'armor','Foot'+side,[s*.17,.105,.115],[.14,.105,.22]);
  tube([[s*.17-.102,.32,.06],[s*.17,.305,.116],[s*.17+.102,.32,.06]],.013,'gold','Shin'+side);
  if(!lune&&!fox){
   add(loft([[1.11,.17,.145,0,x],[1.20,.19,.17,0,x],[1.28,.145,.13,0,x],[1.34,.02,.023,0,x]],28,16),'armor','UpperArm'+side);
   tube([[x-.14,1.18,.084],[x,1.21,.17],[x+.14,1.18,.084]],.017,'gold','UpperArm'+side);
  }
 }
 if(!fox){
  // Separate curved gores give the skirt a sculpted, scalloped hem.
  for(let i=0;i<8;i++){
   const a=i/8*Math.PI*2;
   add(patch(8,12,(u,v)=>{const angle=a+(u-.5)*.80,rad=.235+v*(lune?.24:.13),length=lune?.49:.27;return [Math.sin(angle)*rad,.76-length*v-Math.sin(u*Math.PI)*.025*v,Math.cos(angle)*rad*.78];}),'cloth','Hips');
   const line=[];for(let j=0;j<=10;j++){const u=j/10,angle=a+(u-.5)*.80,rad=lune?.478:.373;line.push([Math.sin(angle)*rad,.76-(lune?.49:.27)-Math.sin(u*Math.PI)*.025,Math.cos(angle)*rad*.78]);}tube(line,.009,'gold','Hips');
   if(!lune&&i%2===0)add(patch(8,10,(u,v)=>{const angle=a+(u-.5)*.56,rad=.262+v*.115;return [Math.sin(angle)*rad,.84-v*(.23+Math.sin(u*Math.PI)*.08),Math.cos(angle)*rad*.83];}),'armor','Hips');
  }
 }
 add(loft([[.73,.269,.19],[.81,.266,.185]],32,4),'hair','Hips');gem([0,.774,.199],[.047,.045,.022],'gold','Hips');
 add(loft([[1.15,.312,.196],[1.25,.30,.185],[1.29,.218,.141],[1.32,.126,.102]],32,16),lune?'ivory':fox?'ivory':'armor','Chest');
 tube([[-.12,1.272,.066],[0,1.234,.184],[.12,1.272,.066]],.015,'gold','Chest');gem([0,1.181,.19],[.045,.063,.028]);
 if(lune){
  for(const s of [-1,1]){tube([[s*.25,1.11,.135],[s*.14,.92,.159],[s*.17,.82,.163]],.014,'gold','Chest');star(s*.215,.455,.30,.043,'gold','Hips');}
 }else if(!fox){
  add(loft([[.86,.18,.128],[.99,.25,.18],[1.13,.29,.19]],32,18),'armor','Chest');
  tube([[0,1.11,.202],[0,.995,.199],[0,.86,.149]],.011,'gold','Chest');
  for(const s of [-1,1])tube([[s*.24,1.1,.139],[s*.19,.965,.144],[s*.10,.88,.143]],.01,'gold','Chest');
 }
 if(!fox){
  add(patch(20,22,(u,v)=>{const width=.27+v*(lune?.22:.10),x=(u-.5)*2*width;return [x,1.245-v*(lune?.96:.64),-.19-v*.13+Math.cos(u*Math.PI*6)*v*.025];}),'cloth','Cape');
  const hem=[];for(let j=0;j<=20;j++){const u=j/20;hem.push([(u-.5)*(lune?.98:.74),lune?.285:.605,-.32+Math.cos(u*Math.PI*6)*.025]);}tube(hem,.014,'gold','Cape');
 }
}

function witchHat(r){
 const {add,tube,egg,star,gem}=r;
 // A thick wavy brim and a bent, asymmetric tip: recognizable in silhouette.
 const brimPoint=(u,v,lower=0)=>{const a=u*Math.PI*2,rad=.19+v*.60;return [Math.sin(a)*rad,2.19+Math.cos(a*2+.5)*.055*v+Math.sin(a)*.045-lower,Math.cos(a)*rad*.77-.015];};
 add(patch(64,10,(u,v)=>brimPoint(u,v)),'cloth','Head');add(patch(64,10,(u,v)=>brimPoint(u,v,.037)),'armor','Head');
 const hem=[];for(let i=0;i<=64;i++)hem.push(brimPoint(i/64,1,.012));tube(hem,.019,'gold','Head',64);
 add(loft([[2.19,.44,.33],[2.29,.39,.30],[2.51,.26,.20,-.015,.025],[2.73,.165,.133,-.01,.09],[2.91,.10,.085,.018,.205],[2.98,.068,.057,.04,.35],[2.92,.003,.003,.055,.49]],40,38),'cloth','Head');
 add(loft([[2.245,.431,.336,0,.004],[2.30,.404,.313,-.002,.007],[2.36,.375,.294,-.004,.012]],40,10),'armor','Head');
 tube([[-.30,2.325,.175],[0,2.328,.296],[.33,2.32,.153]],.012,'gold');
 gem([0,2.295,.327],[.06,.073,.022],'gem','Head');star(.11,2.59,.179,.10);star(-.135,2.42,.247,.041);
 tube([[.476,2.92,.05],[.50,2.82,.061],[.50,2.74,.068]],.008,'gold');star(.50,2.68,.07,.08);egg('gem','Head',[.50,2.79,.068],[.019,.024,.018]);
}

function foxSculpt(r){
 const {add,egg,tube,strand,gem}=r;
 // The muzzle, triangular face mask, ears and long articulated tail are animal
 // anatomy, rather than human geometry with ears attached.
 add(loft([[1.31,.025,.065,.09],[1.40,.25,.24,.035],[1.55,.43,.32],[1.77,.52,.35,-.03],[1.99,.40,.29,-.055],[2.13,.21,.19,-.055],[2.18,.004,.004,-.055]],44,38),'skin','Head');
 for(const s of [-1,1]){
  const ear=[[1.95,.17,.085,-.075,s*.35],[2.12,.185,.081,-.081,s*.395],[2.39,.095,.046,-.085,s*.42],[2.61,.002,.003,-.09,s*.50]];
  add(loft(ear,28,25),'hair','Head');
  add(loft([[2.05,.105,.047,-.004,s*.386],[2.23,.103,.036,-.027,s*.414],[2.48,.003,.003,-.049,s*.477]],24,18),'ivory','Head');
  // Flared cheek fur and a softly pointed muzzle.
  strand([[s*.22,1.6,.21],[s*.41,1.54,.20],[s*.54,1.52,.10],[s*.61,1.59,.02]],[.17,.15,.10,.003],'ivory','Head',.8);
  strand([[s*.30,1.53,.15],[s*.40,1.42,.11],[s*.52,1.43,.01]],[.13,.14,.003],'ivory','Head');
  egg('ivory','Head',[s*.126,1.525,.338],[.20,.115,.18],[0,s*.18,0]);
  const cx=s*.235;
  egg('ink','Head',[cx,1.795,.265],[.14,.133,.043],[0,s*.34,-s*.12]);
  egg('ivory','Head',[cx,1.78,.291],[.121,.106,.029],[0,s*.34,-s*.12]);
  egg('eye','Head',[cx-s*.014,1.78,.316],[.058,.09,.013],[0,s*.34,0]);
  egg('ink','Head',[cx-s*.014,1.79,.328],[.022,.064,.008]);
  egg('white','Head',[cx-.022,1.819,.337],[.018,.019,.009]);
  tube([[cx-s*.10,1.95,.292],[cx,1.984,.265],[cx+s*.08,1.966,.223]],.025,'hair');
  // Glove straps, boots and a travelling hood; no permanent held weapon.
  tube([[s*.36-.072,.785,.061],[s*.36,.77,.112],[s*.36+.072,.785,.061]],.019,'cloth','LowerArm'+(s<0?'R':'L'));
 }
 egg('ink','Head',[0,1.58,.508],[.063,.043,.035]);tube([[0,1.554,.514],[0,1.505,.492],[.045,1.486,.459]],.009,'ink');tube([[0,1.505,.492],[-.045,1.486,.459]],.009,'ink');
 for(let i=0;i<3;i++)strand([[-.15+i*.1,2.03,.0],[-.15+i*.08,2.20,.022],[-.20+i*.11,2.29,.10]],[.095,.07,.001],'skin','Head');
 // Bushy tail sweeps sideways, with a separately modeled ivory tip on same bone.
 strand([[0,.80,-.21],[.28,.69,-.53],[.57,.91,-.57],[.68,1.24,-.55]],[.10,.27,.30,.21],'skin','Tail',1);
 strand([[.67,1.17,-.55],[.64,1.42,-.48],[.52,1.60,-.39],[.37,1.61,-.34]],[.23,.20,.13,.003],'ivory','Tail',1);
 add(loft([[1.11,.28,.19],[1.20,.37,.23],[1.29,.29,.20],[1.32,.13,.09]],32,14),'cloth','Chest');
 for(const s of [-1,1])add(patch(10,14,(u,v)=>[s*(.035+u*.12+v*.09),1.20-v*.38,.223+Math.sin(u*Math.PI)*.026]),'cloth','Chest');
 gem([0,1.226,.24],[.055,.064,.021]);
 add(loft([[.63,.13,.06,-.16,-.24],[.66,.15,.075,-.16,-.24],[.86,.15,.075,-.16,-.24],[.91,.10,.054,-.16,-.24]],24,16),'hair','Hips');
 tube([[-.26,1.20,.127],[0,.98,.205],[.25,.77,.15]],.043,'hair','Chest');
}

function golemSculpt(r){
 const {add,egg,tube,ring,gem,strand,star}=r;
 const stone=(sections,b='Chest',mat='armor')=>add(loft(sections,12,16),mat,b);
 // Barrel-shaped torso, recessed luminous core and overlapping hewn plates.
 stone([[.64,.28,.25],[.77,.49,.34],[1.05,.55,.38],[1.36,.50,.33],[1.49,.32,.25],[1.52,.18,.18]],'Chest','skin');
 for(const s of [-1,1]){
  stone([[.78,.19,.16,.23,s*.285],[1.08,.24,.14,.25,s*.31],[1.33,.26,.15,.18,s*.26],[1.43,.07,.10,.15,s*.23]]);
  const side=s<0?'R':'L',x=s*.66;
  stone([[1.14,.20,.22,0,x],[1.31,.30,.25,0,x],[1.52,.27,.23,0,x],[1.61,.10,.12,0,x]],'UpperArm'+side);
  stone([[.77,.165,.17,0,x],[1.12,.19,.18,0,x]],'UpperArm'+side,'skin');
  stone([[.54,.16,.16,.01,x],[.66,.245,.23,.01,x],[.87,.255,.235,.01,x],[.99,.16,.16,.01,x]],'LowerArm'+side);
  egg('skin','HandSlot'+side,[x,.555,.048],[.22,.18,.21]);
  for(let f=0;f<3;f++)egg('armor','HandSlot'+side,[x-.12+f*.12,.515,.206],[.048,.09,.08]);
  egg('armor','HandSlot'+side,[x-s*.20,.593,.13],[.075,.105,.08],[0,0,s*.35]);
  tube([[x-.185,.83,.14],[x,.81,.25],[x+.185,.83,.14]],.018,'gem','LowerArm'+side);
  stone([[.30,.14,.14,0,s*.29],[.66,.20,.20,0,s*.29]],'Thigh'+side,'skin');
  stone([[.13,.22,.235,.058,s*.29],[.36,.215,.20,.01,s*.29],[.49,.14,.14,0,s*.29]],'Shin'+side);
  egg('armor','Foot'+side,[s*.29,.12,.14],[.23,.13,.29]);
  tube([[s*.29-.15,.22,.247],[s*.29,.20,.334],[s*.29+.15,.22,.247]],.018,'gold','Foot'+side);
  ring('gold','UpperArm'+side,[x,1.37,0],.266,.024);
  gem([x,1.446,.216],[.056,.09,.035],'gem','UpperArm'+side);
 }
 ring('gold','Chest',[0,1.09,.396],.187,.031,[0,0,0]);egg('ink','Chest',[0,1.09,.386],[.17,.17,.055]);gem([0,1.09,.439],[.098,.127,.053]);
 stone([[1.45,.21,.17],[1.56,.29,.22],[1.85,.34,.27],[2.04,.25,.22],[2.11,.10,.10]],'Head');
 egg('ink','Head',[0,1.80,.253],[.274,.123,.025]);
 for(const s of [-1,1]){egg('eye','Head',[s*.126,1.806,.277],[.074,.038,.015]);tube([[s*.23,1.998,.112],[s*.11,2.04,.197],[0,2.065,.136]],.017,'gold');}
 stone([[1.43,.12,.10,.17],[1.57,.28,.07,.195],[1.64,.28,.07,.195]],'Head','gold');
 tube([[-.102,1.66,.267],[0,1.648,.289],[.102,1.66,.267]],.009,'ink');
 // Moss crown and tiny mineral growths establish an old forest construct.
 for(const [x,y,z,s]of [[-.17,2.078,-.045,.13],[.03,2.098,-.13,.12],[.18,2.06,-.08,.10],[-.68,1.595,-.06,.11]])egg('hair',x<-.5?'UpperArmR':'Head',[x,y,z],[s,s*.36,s*.76]);
 strand([[-.13,2.10,-.06],[-.14,2.24,-.05],[-.06,2.29,-.04]],[.025,.02,.001],'gold','Head');
 add(new THREE.SphereGeometry(1,14,10),'hair','Head',[-.05,2.27,-.04],[.11,.032,.052],[0,0,.35]);
 star(.02,1.957,.232,.063,'gem');
}

export function createFableAsset(def){
 const kind=def.archetype;if(!palettes[kind])throw new Error('Unknown fable character: '+kind);
 const r=rigBuilder(kind);
 if(kind==='moru')golemSculpt(r);else{compactBody(r);if(kind==='koha')foxSculpt(r);else{humanoidFace(r);if(kind==='lune')witchHat(r);}}
 return r.finish();
}

export function fableClips(kind,hip){
 const clips=[],golem=kind==='moru',fox=kind==='koha';
 const make=(name,duration,poses,bob)=>{
  const tracks=[];for(const [bone,frames]of Object.entries(poses))tracks.push(new THREE.QuaternionKeyframeTrack(bone+'.quaternion',frames.map(f=>f[0]*duration),frames.flatMap(([,x=0,y=0,z=0])=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)).toArray())));
  if(bob)tracks.push(new THREE.VectorKeyframeTrack('Hips.position',bob.map(f=>f[0]*duration),bob.flatMap(([,y])=>[0,hip+y,0])));
  clips.push(new THREE.AnimationClip(name,duration,tracks));
 };
 make('Idle',3.4,{Chest:[[0,.01,-.035],[.5,-.015,-.045],[1,.01,-.035]],Head:[[0,0,.045,-.03],[.5,-.025,.07,-.02],[1,0,.045,-.03]],UpperArmR:[[0,0,0,-.11],[1,0,0,-.11]],UpperArmL:[[0,0,0,.11],[1,0,0,.11]],LowerArmR:[[0,-.16],[1,-.16]],LowerArmL:[[0,-.12],[1,-.12]],Hair:[[0,.02],[.5,-.035],[1,.02]],Cape:[[0,.02],[.5,.08],[1,.02]],Tail:[[0,0,-.13],[.5,0,.17],[1,0,-.13]]},[[0,0],[.5,.018],[1,0]]);
 for(const [name,amp,duration]of [['Walking_A',.52,.84],['Running_A',.87,.56]]){
  const poses={Chest:[[0,.10],[1,.10]],Head:[[0,-.05],[1,-.05]],Cape:[[0,.18],[.5,.32],[1,.18]],Hair:[[0,.09],[.5,-.08],[1,.09]],Tail:[[0,-.14,-.2],[.5,-.08,.2],[1,-.14,-.2]]};
  for(const [side,s]of [['R',1],['L',-1]]){poses['Thigh'+side]=[[0,amp*s],[.5,-amp*s],[1,amp*s]];poses['Shin'+side]=[[0,Math.max(0,-s)*amp*.75],[.5,Math.max(0,s)*amp*.75],[1,Math.max(0,-s)*amp*.75]];poses['UpperArm'+side]=[[0,-amp*s*.6,0,-s*.12],[.5,amp*s*.6,0,-s*.12],[1,-amp*s*.6,0,-s*.12]];poses['LowerArm'+side]=[[0,-.5],[1,-.5]];}
  make(name,duration*(golem?1.18:1),poses,[[0,0],[.25,.04],[.5,0],[.75,.04],[1,0]]);
 }
 const attack=(name,wind,impact,two=false)=>make(name,.92,{Chest:[[0,0],[.27,-.14,-.4],[.45,.16,.45],[.62,.14,.40],[1,0]],Head:[[0,0],[.27,0,.28],[.45,-.07,-.25],[1,0]],UpperArmR:[[0,0,0,-.11],[.27,...wind],[.45,...impact],[.60,...impact],[1,0,0,-.11]],LowerArmR:[[0,-.16],[.27,-.8],[.45,-.12],[1,-.16]],UpperArmL:two?[[0,0,0,.11],[.27,-2.6,0,.45],[.45,-1.0,0,.25],[1,0,0,.11]]:[[0,0,0,.11],[.27,.25,0,.4],[.45,-.4,0,.3],[1,0,0,.11]],Cape:[[0,0],[.27,-.12],[.6,.3],[1,0]],Tail:[[0,0],[.27,0,-.4],[.6,0,.35],[1,0]]},[[0,0],[.27,-.07],[.45,.015],[1,0]]);
 attack('1H_Melee_Attack_Slice_Diagonal',[-1.8,-.6,-.85],[-1.0,.8,.3]);attack('1H_Melee_Attack_Backhand',[-1.2,.9,.45],[-1.35,-.75,-.8]);attack('1H_Melee_Attack_Rising',[-.25,-.5,-.75],[-2.35,.25,.18]);
 attack('2H_Melee_Attack_Diagonal',[-2.5,-.3,-.5],[-.55,.25,.18],true);
 attack('2H_Melee_Attack_Sweep',[-1.35,-.9,-.7],[-1.15,.8,.05],true);
 // A straight sagittal chop: the old torso yaw turned a hammer's end face sideways.
 make('2H_Melee_Attack_Chop',.96,{Chest:[[0,0],[.32,-.18,0,0],[.48,.22,0,0],[.68,.22,0,0],[1,0]],Head:[[0,0],[.32,-.12],[.48,-.1],[1,0]],UpperArmR:[[0,-.2,0,-.08],[.32,-2.8,0,0],[.48,-.70,0,0],[.67,-.70,0,0],[1,-.2,0,-.08]],LowerArmR:[[0,-.2],[.32,-.6],[.48,-.04],[.67,-.04],[1,-.2]],UpperArmL:[[0,0,0,.1],[.32,-2.4,0,.25],[.48,-.65,0,.2],[1,0,0,.1]],LowerArmL:[[0,-.2],[.32,-.8],[.48,-.3],[1,-.2]],Cape:[[0,0],[.32,-.18],[.6,.35],[1,0]]},[[0,0],[.32,-.06],[.48,-.035],[1,0]]);
 attack('1H_Melee_Attack_Stab',[-.6,-.15,-.4],[-1.65,.10,.08]);attack('1H_Melee_Attack_Jab',[-.8,.25,-.3],[-1.8,-.1,0]);attack('1H_Melee_Attack_Lunge',[-.45,-.5,-.25],[-1.8,.35,0]);attack('2H_Melee_Attack_Spin',[-1.3,-1.1,-.9],[-1.3,1.2,.25],true);attack('Throw',[-2.6,-.3,-.2],[-1.3,.3,.10]);
 make('2H_Ranged_Shoot',.9,{Chest:[[0,0,-.15],[1,0,-.15]],UpperArmL:[[0,-1.45,0,.16],[1,-1.45,0,.16]],UpperArmR:[[0,-1.35,0,-.3],[.38,-1.5,-.5,-.55],[.53,-1.35,.2,-.25],[1,0]],LowerArmR:[[0,-1.1],[.38,-1.65],[.53,-.25],[1,-.15]]});
 make('1H_Ranged_Shoot',.7,{UpperArmR:[[0,-1.5],[.28,-1.8],[.5,-1.5],[1,-1.4]],LowerArmR:[[0,-.12],[.28,-.40],[1,-.12]]});
 for(const name of ['Spellcast_Raise','Spellcast_Shoot'])make(name,1.2,{UpperArmR:[[0,0,0,-.11],[.35,-1.9,0,-.55],[.65,-1.1,0,-.18],[1,0,0,-.11]],UpperArmL:[[0,0,0,.11],[.35,-1.9,0,.55],[.65,-1.1,0,.18],[1,0,0,.11]],Head:[[0,0],[.35,-.15],[.65,.1],[1,0]],Cape:[[0,0],[.5,.35],[1,0]]},[[0,0],[.35,.07],[.65,-.025],[1,0]]);
 make('Block_Hit',.8,{UpperArmL:[[0,-.2,0,.15],[.18,-1.35,0,.55],[.38,-1.2,0,.65],[.7,-1.3,0,.55],[1,-.2,0,.15]],LowerArmL:[[0,-.2],[.18,-1.12],[.7,-1.12],[1,-.2]],Chest:[[0,0],[.18,.10,.15],[.38,-.12,.25],[1,0]],Head:[[0,0],[.38,-.08],[1,0]]},[[0,0],[.2,-.055],[.5,-.07],[1,0]]);
 make('Hit_A',.65,{Chest:[[0,0],[.16,-.25],[.6,.12],[1,0]],Head:[[0,0],[.18,-.22],[.6,.06],[1,0]],UpperArmR:[[0,0],[.2,.2,0,-.35],[1,0]],Hair:[[0,0],[.25,-.25],[1,0]]});
 for(const walking of [false,true]){
  const step=walking?.28:.025,poses={Hips:[[0,.20],[.5,.24],[1,.20]],Chest:[[0,.22],[.5,.30],[1,.22]],Head:[[0,-.10,0,-.04],[.5,-.14,0,.04],[1,-.10,0,-.04]],UpperArmR:[[0,-.45,0,-.22],[.5,-.55,0,-.18],[1,-.45,0,-.22]],LowerArmR:[[0,-.75],[1,-.75]],UpperArmL:[[0,.1,0,.1],[.5,.14,0,.1],[1,.1,0,.1]],ThighR:[[0,-step],[.5,step],[1,-step]],ThighL:[[0,step],[.5,-step],[1,step]],ShinR:[[0,.16],[1,.16]],ShinL:[[0,.16],[1,.16]]};
  make(walking?'Exhausted_Walk':'Exhausted_Idle',walking?1.05:1.6,poses,[[0,-hip*.07],[.5,-hip*.09],[1,-hip*.07]]);
  const crawl={Hips:[[0,1.34,0,-.035],[.5,1.34,0,.035],[1,1.34,0,-.035]],Chest:[[0,.06],[.5,.08],[1,.06]],Head:[[0,-.45],[.5,-.5],[1,-.45]],Tail:[[0,-.7],[1,-.7]],Cape:[[0,-.3],[1,-.3]]};
  for(const [side,s]of [['R',1],['L',-1]]){const amp=walking?.35:.035;crawl['UpperArm'+side]=[[0,-1.3+s*amp,0,-s*.14],[.5,-1.3-s*amp,0,-s*.14],[1,-1.3+s*amp,0,-s*.14]];crawl['LowerArm'+side]=[[0,-.3-s*amp*.4],[.5,-.3+s*amp*.4],[1,-.3-s*amp*.4]];crawl['Thigh'+side]=[[0,-.85-s*amp],[.5,-.85+s*amp],[1,-.85-s*amp]];crawl['Shin'+side]=[[0,1.4],[.5,1.6],[1,1.4]];}
  make(walking?'Crawl_Walk':'Crawl_Idle',walking?1.0:2.1,crawl,[[0,-hip*.52],[.25,-hip*.52+.015],[.5,-hip*.52],[.75,-hip*.52+.015],[1,-hip*.52]]);
 }
 make('Vigorous_Idle',2.8,{Hips:[[0,-.025],[1,-.025]],Chest:[[0,-.11],[.5,-.15],[1,-.11]],Head:[[0,-.06,0,-.025],[.5,-.09,0,.025],[1,-.06,0,-.025]],UpperArmR:[[0,.12,0,-.28],[.5,.17,0,-.32],[1,.12,0,-.28]],UpperArmL:[[0,.12,0,.28],[.5,.17,0,.32],[1,.12,0,.28]],LowerArmR:[[0,-.32],[1,-.32]],LowerArmL:[[0,-.32],[1,-.32]]},[[0,0],[.5,.028],[1,0]]);
 make('Death_A',1.1,{Hips:[[0,0],[.30,-.25],[1,-Math.PI/2]],Chest:[[0,0],[.3,.15],[1,0]],Head:[[0,0],[.4,.14],[1,kind==='lune'?.55:.15]],Hair:[[0,0],[1,kind==='lune'?-.75:0]],ThighR:[[0,0],[.4,-.65],[1,.10]],ThighL:[[0,0],[.4,-.35],[1,0]],ShinR:[[0,0],[.4,1.05],[1,0]],UpperArmR:[[0,0],[1,0,0,-.5]],UpperArmL:[[0,0],[1,0,0,.4]],Tail:[[0,0],[1,fox?Math.PI/2:0]]});
 if(fox)clips.at(-1).tracks.push(new THREE.VectorKeyframeTrack('Tail.position',[0,.5,1.1],[0,0,-.24,0,0,-.16,0,0,-.035]));
 return clips;
}
