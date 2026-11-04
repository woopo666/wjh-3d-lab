import * as THREE from 'three';

// Trace separate arm cross-sections through the authored surface. Hats, capes
// and broad shoulder armour must not be mistaken for a wrist or elbow.
export function fitSurfaceAnatomy(pieces,height,proportions={}){
 const rows=[],step=height*.0125,epsilon=height*.00002;
 for(let y=height*.015;y<height*.88;y+=step){
  const nodes=[],lookup=new Map(),links=[];
  const node=(x,z)=>{const key=Math.round(x/epsilon)+','+Math.round(z/epsilon);if(lookup.has(key))return lookup.get(key);const id=nodes.length;nodes.push({x,y,z});lookup.set(key,id);links.push([]);return id;};
  for(const {geometry}of pieces){const p=geometry.attributes.position,idx=geometry.index?.array;
   for(let t=0;t<(idx?.length||p.count);t+=3){const ids=[idx?idx[t]:t,idx?idx[t+1]:t+1,idx?idx[t+2]:t+2],cross=[];
    for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3],ay=p.getY(a),by=p.getY(b);if((ay<=y&&by>y)||(by<=y&&ay>y)){const f=(y-ay)/(by-ay);cross.push(node(p.getX(a)+(p.getX(b)-p.getX(a))*f,p.getZ(a)+(p.getZ(b)-p.getZ(a))*f));}}
    if(cross.length===2){links[cross[0]].push(cross[1]);links[cross[1]].push(cross[0]);}
   }
  }
  const seen=new Set(),sections=[];
  for(let n=0;n<nodes.length;n++){if(seen.has(n))continue;const stack=[n],points=[];seen.add(n);while(stack.length){const id=stack.pop();points.push(nodes[id]);for(const next of links[id])if(!seen.has(next)){seen.add(next);stack.push(next);}}
   if(points.length<6)continue;const xs=points.map(p=>p.x).sort((a,b)=>a-b),zs=points.map(p=>p.z).sort((a,b)=>a-b),width=xs.at(-1)-xs[0],depth=zs.at(-1)-zs[0];
   if(width<height*.007||depth<height*.007||width>height*.30||depth>height*.32)continue;
   const center=new THREE.Vector3((xs[0]+xs.at(-1))*.5,y,(zs[0]+zs.at(-1))*.5);
   sections.push({center,width,depth,minX:xs[0],maxX:xs.at(-1),minZ:zs[0],maxZ:zs.at(-1),points:points.length});
  }
  rows.push({y,sections});
 }
 const result={};
 for(const [side,sign]of [['R',-1],['L',1]]){
  const eligible=rows.flatMap((row,index)=>row.sections.filter(s=>sign*s.center.x>height*.15&&s.center.z>height*(proportions.armBackLimit??-.18)&&row.y>height*(proportions.armLow??.42)&&row.y<height*(proportions.armHigh??.7)).map(s=>({...s,index})));
  if(!eligible.length)continue;eligible.sort((a,b)=>sign*(b.center.x-a.center.x));const far=sign*eligible[0].center.x;
  const seed=eligible.filter(s=>sign*s.center.x>far-height*.018).sort((a,b)=>a.center.y-b.center.y)[0],chain=[seed.center.clone()];let last=seed.center,gaps=0;
  for(let i=seed.index+1;i<rows.length;i++){
   if(rows[i].y>height*(proportions.armTop??1))break;
   const candidates=rows[i].sections.filter(s=>sign*s.center.x>height*.12&&sign*s.center.x<sign*last.x+height*.055&&s.center.distanceTo(last)<height*(gaps?.11:.075));
   candidates.sort((a,b)=>a.center.distanceTo(last)-b.center.distanceTo(last));
   if(!candidates.length){if(++gaps>2)break;continue;}gaps=0;last=candidates[0].center;chain.push(last.clone());
  }
  if(chain.length<(proportions.armMinSections??7)||chain.at(-1).y-chain[0].y<height*(proportions.armMinSpan??.14))continue;
  const shoulder=chain.at(-1).clone().add(new THREE.Vector3(-sign*height*.018,height*.035,0));
  const upperDepth=chain.slice(-5).map(p=>p.z).sort((a,b)=>a-b);shoulder.z=upperDepth[Math.floor(upperDepth.length/2)];chain.push(shoulder);chain.reverse();
  let low=seed.center;for(let i=seed.index-1;i>=0;i--){const candidates=rows[i].sections.filter(s=>sign*s.center.x>sign*seed.center.x-height*.045&&s.center.distanceTo(low)<height*.055);candidates.sort((a,b)=>a.center.distanceTo(low)-b.center.distanceTo(low));if(!candidates.length)break;low=candidates[0].center;chain.push(low.clone());if(seed.center.y-low.y>height*.09)break;}
  const lengths=[0];for(let i=1;i<chain.length;i++)lengths.push(lengths.at(-1)+chain[i].distanceTo(chain[i-1]));const length=lengths.at(-1);
  const at=f=>{const target=length*f;for(let i=1;i<chain.length;i++)if(lengths[i]>=target)return chain[i-1].clone().lerp(chain[i],(target-lengths[i-1])/(lengths[i]-lengths[i-1]));return chain.at(-1).clone();};
  result[side]={shoulder:shoulder.toArray(),elbow:at(.44).toArray(),wrist:at(.78).toArray(),tip:at(1).toArray(),sections:chain.length,length};
 }
 const legs={};
 for(const [side,sign]of [['R',-1],['L',1]]){
  const sectionAt=f=>{const pool=rows.flatMap(row=>Math.abs(row.y-height*f)<step*.7?row.sections:[]).filter(s=>sign*s.center.x>height*.023&&sign*s.center.x<height*.23&&s.width<height*.20);pool.sort((a,b)=>Math.abs(a.center.x-sign*height*.09)-Math.abs(b.center.x-sign*height*.09));return pool[0];};
  const upper=sectionAt(proportions.upperLeg??.44),knee=sectionAt(proportions.knee??.29),ankle=sectionAt(proportions.ankle??.075),foot=sectionAt(proportions.foot??.0275);
  if(knee&&ankle&&foot){
   const kneeZ=THREE.MathUtils.clamp(knee.center.z,ankle.center.z-height*.07,ankle.center.z+height*.07);
   const thighZ=THREE.MathUtils.clamp(upper?.center.z??kneeZ,kneeZ-height*.035,kneeZ+height*.035);
   legs[side]={thigh:[upper?.center.x??knee.center.x,height*(proportions.thigh??.495),thighZ],knee:[knee.center.x,height*(proportions.knee??.29),kneeZ],ankle:[ankle.center.x,height*(proportions.ankle??.075),ankle.center.z],toe:[foot.center.x,height*(proportions.foot??.0275),foot.maxZ]};
  }
 }
 const necks=rows.flatMap(row=>row.y>height*(proportions.neckLow??.73)&&row.y<height*(proportions.neckHigh??.88)?row.sections:[]).filter(s=>Math.abs(s.center.x)<height*.065&&s.width>height*.025);
 necks.sort((a,b)=>(a.width+Math.abs(a.center.y-height*(proportions.neck??.82))*.6)-(b.width+Math.abs(b.center.y-height*(proportions.neck??.82))*.6));
 return {arms:result,legs,neck:necks[0]?.center.toArray()};
}
