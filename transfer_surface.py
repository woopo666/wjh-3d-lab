"""Experimental donor texture bake onto unchanged target geometry and UVs.

Both models must already share position, scale, orientation and neutral pose.
Uses closest triangle + barycentric UV interpolation, not nearest vertex colors.
"""
import io,runpy,json
from pathlib import Path
import numpy as np,trimesh,moderngl
from PIL import Image
from scipy.ndimage import map_coordinates,distance_transform_edt
ROOT=Path(__file__).resolve().parent
g=runpy.run_path(str(ROOT/'tools/repair-character-surfaces.py'))
def load(path):
 d,b,_=g['glb_read'](path)
 if len(d['meshes'])!=1 or len(d['meshes'][0]['primitives'])!=1:raise ValueError('Transfer requires one mesh/primitive; flatten in Blender first')
 p=d['meshes'][0]['primitives'][0];a=p['attributes'];pos=g['accessor'](d,b,a['POSITION']);uv=g['accessor'](d,b,a['TEXCOORD_0']);faces=g['accessor'](d,b,p['indices']).reshape(-1,3)
 if any('matrix' in n or any(k in n for k in ('translation','rotation','scale')) for n in d['nodes'] if 'mesh' in n):raise ValueError('Apply object transforms before transfer')
 tex=d['textures'][d['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']];ii=tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'));view=d['bufferViews'][d['images'][ii]['bufferView']];image=Image.open(io.BytesIO(b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB')
 return d,b,pos,uv,faces,image,ii
def transfer(target,donor,output,size=2048,max_distance=.03):
 d,b,p,uv,f,original,ii=load(target);_,_,dp,duv,df,di,_=load(donor);height=float(np.ptp(p[:,1]))
 if height<=0:raise ValueError('Degenerate target')
 ctx=moderngl.create_standalone_context();prog=ctx.program(vertex_shader='#version 330\nin vec3 position;in vec2 uv;out vec3 q;void main(){q=position;gl_Position=vec4(uv*2.-1.,0.,1.);}',fragment_shader='#version 330\nin vec3 q;out vec4 value;void main(){value=vec4(q,1.);}')
 vb=ctx.buffer(np.c_[p,uv].astype('f4').tobytes());ib=ctx.buffer(f.astype('i4').tobytes());vao=ctx.vertex_array(prog,[(vb,'3f 2f','position','uv')],ib);texture=ctx.texture((size,size),4,dtype='f4');fb=ctx.framebuffer([texture]);fb.use();fb.clear();vao.render()
 samples=np.frombuffer(texture.read(),dtype='f4').reshape(-1,4);valid=samples[:,3]>.5;points=samples[valid,:3];mesh=trimesh.Trimesh(dp,df,process=False)
 colors=np.array(original.resize((size,size))).reshape(-1,3).copy();donor_img=np.array(di);accepted=0;offset=np.flatnonzero(valid)
 for start in range(0,len(points),8192):
  q=points[start:start+8192];closest,distance,face=trimesh.proximity.closest_point(mesh,q);bary=trimesh.triangles.points_to_barycentric(mesh.triangles[face],closest);coords=(duv[df[face]]*bary[:,:,None]).sum(1);keep=distance<=height*max_distance
  rgb=np.stack([map_coordinates(donor_img[:,:,c],[coords[:,1]*(di.height-1),coords[:,0]*(di.width-1)],order=1,mode='nearest') for c in range(3)],axis=1)
  colors[offset[start:start+len(q)][keep]]=rgb[keep];accepted+=int(keep.sum())
 coverage=accepted/max(1,len(points))
 if coverage<.90:raise ValueError(f'Donor alignment coverage {coverage:.1%} is below 90%; align meshes before transfer')
 result=colors.reshape(size,size,3);mask=valid.reshape(size,size);nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True);result[~mask]=result[nearest[0][~mask],nearest[1][~mask]]
 encoded=io.BytesIO();Image.fromarray(result).save(encoded,format='PNG');img=d['images'][ii];img['mimeType']='image/png'
 # Remove only this texture's WebP extension; other textures retain their data.
 for tex in d['textures']:
  if tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source')==ii:
   tex['source']=ii;tex['extensions'].pop('EXT_texture_webp')
 if not any('EXT_texture_webp' in t.get('extensions',{}) for t in d['textures']):
  for key in ['extensionsUsed','extensionsRequired']:
   if 'EXT_texture_webp' in d.get(key,[]):d[key].remove('EXT_texture_webp')
 Path(output).write_bytes(g['pack'](d,b,{img['bufferView']:encoded.getvalue()}))
 for obj in [vao,vb,ib,fb,texture,prog]:obj.release()
 ctx.release();return {'method':'tl1-transfer','experimental':True,'coverage':coverage,'geometryAndUVPreserved':True,'textureSize':size,'maxDistanceBodyHeight':max_distance}
