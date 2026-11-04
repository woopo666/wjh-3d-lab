"""Rebake uncertain generated side surfaces without changing a shipped rig.

Works on the actual exported mesh/UVs. Front/back albedo anchors extend along
connected surface edges; Gaussian side noise is never used as an anchor.
Positions, indices, skin weights, bind matrices and animation buffers are kept
byte-identical. Originals are immutable; every result has a provenance report.
"""
import io,json,struct,sys,hashlib,time,runpy
from pathlib import Path
import numpy as np,trimesh,moderngl
from PIL import Image
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix,diags
from scipy.ndimage import map_coordinates,distance_transform_edt

ROOT=Path('artifacts/v0430');DEST=Path('public/assets/characters/atelier-v0430')
DEST.mkdir(parents=True,exist_ok=True)
DTYPES={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb_read(path):
    raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:],raw
def accessor(doc,blob,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    dtype=np.dtype(DTYPES[a['componentType']]);width=WIDTH[a['type']]
    return np.ndarray((a['count'],width),dtype,blob,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*width),dtype.itemsize)).copy()
def pack(doc,blob,replacements):
    chunks=[];offset=0
    for i,v in enumerate(doc['bufferViews']):
        data=replacements.get(i,blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
        v['byteOffset']=offset;v['byteLength']=len(data);pad=(-len(data))%4
        chunks.append(data+b'\0'*pad);offset+=len(data)+pad
    binary=b''.join(chunks);doc['buffers'][0]['byteLength']=len(binary)
    metadata=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf8');metadata+=b' '*((-len(metadata))%4)
    return struct.pack('<III',0x46546c67,2,28+len(metadata)+len(binary))+struct.pack('<II',len(metadata),0x4e4f534a)+metadata+struct.pack('<II',len(binary),0x004e4942)+binary
def repair(model):
    started=time.time();doc,blob,raw=glb_read(model['sourceAsset']);assert len(doc['meshes'])==1 and len(doc['images'])==1
    p=doc['meshes'][0]['primitives'][0];attrs=p['attributes'];pos=accessor(doc,blob,attrs['POSITION']);uv=accessor(doc,blob,attrs['TEXCOORD_0']);oldnormal=accessor(doc,blob,attrs['NORMAL']);faces=accessor(doc,blob,p['indices']).reshape(-1,3)
    h=np.ptp(pos[:,1]);assert h>0
    # Weld UV duplicates only in the temporary computation graph.
    _,first,inverse=np.unique(np.round(pos/h,6),axis=0,return_index=True,return_inverse=True)
    mesh=trimesh.Trimesh(pos[first],inverse[faces],process=False)
    edges=mesh.edges_unique;rows=np.r_[edges[:,0],edges[:,1]];cols=np.r_[edges[:,1],edges[:,0]]
    weights=1/np.maximum(np.linalg.norm(mesh.vertices[rows]-mesh.vertices[cols],axis=1)/h,.002)
    adjacency=coo_matrix((weights,(rows,cols)),shape=(len(first),len(first))).tocsr()
    adjacency=diags(1/np.maximum(1,np.asarray(adjacency.sum(1)).ravel()))@adjacency
    normals=np.asarray(mesh.vertex_normals).copy()
    for _ in range(6):
        normals=.68*normals+.32*(adjacency@normals);normals/=np.maximum(1e-9,np.linalg.norm(normals,axis=1))[:,None]
    image_view=doc['images'][0]['bufferView'];view=doc['bufferViews'][image_view]
    source=Image.open(io.BytesIO(blob[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB')
    tex=np.asarray(source).astype('f4')/255;size=source.width;assert size==source.height==2048
    samples=np.stack([map_coordinates(tex[:,:,k],[uv[:,1]*(size-1),uv[:,0]*(size-1)],order=1,mode='nearest') for k in range(3)],axis=1)
    # glTF atlas seams have duplicate vertices: average samples before diffusion.
    values=np.zeros((len(first),3));counts=np.bincount(inverse)
    np.add.at(values,inverse,samples);values/=counts[:,None]
    # Anchors come from the clean design views, never a generated cheek/hair
    # patch that happens to face forwards. Depth-tested projection rejects
    # hidden arm/coat surfaces. Normalize units for the projector's depth range.
    canonical=mesh.vertices[:,[0,2,1]].copy()/h;canonical[:,1]*=-1
    canonical[:,0]-=(canonical[:,0].max()+canonical[:,0].min())*.5
    canonical[:,1]-=(canonical[:,1].max()+canonical[:,1].min())*.5
    canonical[:,2]-=canonical[:,2].min()
    reference_mesh=trimesh.Trimesh(canonical,mesh.faces,process=False)
    project=runpy.run_path('tools/texture-projection.py')['project_reference']
    front,fw=project(reference_mesh,canonical,reference_mesh.vertex_normals,np.zeros_like(canonical),Image.open(Path(model['job'])/'front-cutout.png').convert('RGBA'),1,return_samples=True)
    back,bw=project(reference_mesh,canonical,reference_mesh.vertex_normals,np.zeros_like(canonical),Image.open(Path(model['job'])/'back-cutout.png').convert('RGBA'),-1,return_samples=True)
    values=(front*fw[:,None]+back*bw[:,None])/np.maximum(fw+bw,1e-8)[:,None]
    trusted=np.maximum(fw,bw)>.82
    assert trusted.sum()>len(first)*.08
    distance,index=cKDTree(mesh.vertices[trusted]).query(mesh.vertices,k=6,workers=2)
    weights=1/np.maximum(distance/h,.001)**2
    colors=(values[trusted][index]*weights[:,:,None]).sum(1)/weights.sum(1)[:,None]
    for _ in range(160):
        colors=.25*colors+.75*(adjacency@colors);colors[trusted]=values[trusted]
    # Keep fine front/back embroidery and faces exactly from the original atlas.
    # Side shading uses smooth welded normals so triangle noise cannot make spots.
    ctx=moderngl.create_context(standalone=True)
    program=ctx.program(vertex_shader='''#version 330
in vec2 in_uv;in vec3 in_color,in_normal;out vec2 uv;out vec3 color,n;
void main(){uv=in_uv;color=in_color;n=in_normal;gl_Position=vec4(in_uv*2.-1.,0.,1.);}
''',fragment_shader='''#version 330
uniform sampler2D atlas;in vec2 uv;in vec3 color,n;out vec4 pixel;
void main(){vec3 original=texture(atlas,uv).rgb;float keep=smoothstep(.25,.79,abs(normalize(n).z));pixel=vec4(mix(color,original,keep),1.);}
''')
    vertex=ctx.buffer(np.c_[uv,colors[inverse],normals[inverse]].astype('f4').tobytes());indexbuf=ctx.buffer(faces.astype('i4').tobytes())
    vao=ctx.vertex_array(program,[(vertex,'2f 3f 3f','in_uv','in_color','in_normal')],indexbuf)
    atlas=ctx.texture(source.size,3,source.tobytes());atlas.filter=(moderngl.LINEAR,moderngl.LINEAR);atlas.use(0);program['atlas'].value=0
    target=ctx.simple_framebuffer(source.size,components=4);target.use();target.clear(0,0,0,0);vao.render()
    output=np.frombuffer(target.read(components=4),dtype='u1').reshape(size,size,4).copy();valid=output[:,:,3]>0
    nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True);output[~valid]=output[nearest[0][~valid],nearest[1][~valid]]
    encoded=io.BytesIO();Image.fromarray(output[:,:,:3]).save(encoded,format='JPEG',quality=94,subsampling=0)
    normal_attr=doc['accessors'][attrs['NORMAL']];normal_view=doc['bufferViews'][normal_attr['bufferView']]
    assert not normal_attr.get('byteOffset') and normal_view.get('byteStride',12)==12
    replacements={image_view:encoded.getvalue(),normal_attr['bufferView']:normals[inverse].astype('<f4').tobytes()}
    doc['images'][0]['mimeType']='image/jpeg'
    for material in doc['materials']:
        extra=material.setdefault('extras',{});extra.update(surfaceProfile='reference-surface-v1',cartoonSoftness=.14,surfaceQA='v0430')
    doc.setdefault('asset',{}).setdefault('extras',{})['surfaceRepair']={'version':1,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'preserved':'positions, UVs, joints, weights, bind matrices, all animation channels'}
    result=pack(doc,blob,replacements);out=DEST/(model['id']+'.glb');out.write_bytes(result)
    for item in [vao,vertex,indexbuf,atlas,target,program]:item.release()
    ctx.release()
    report={'id':model['id'],'source':model['sourceAsset'],'sourceSHA256':hashlib.sha256(raw).hexdigest(),'sha256':hashlib.sha256(result).hexdigest(),'asset':'atelier-v0430/'+out.name,'vertices':len(pos),'triangles':len(faces),'anchors':int(trusted.sum()),'surfaceVertices':len(first),'seconds':round(time.time()-started,2),'bytes':len(result)}
    (ROOT/'surface-reports').mkdir(exist_ok=True);(ROOT/'surface-reports'/(model['id']+'.json')).write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True);return report
if __name__=='__main__':
    manifest=json.loads((ROOT/'character-manifest.json').read_text(encoding='utf8'));selected=set(sys.argv[1:]);reports=[]
    for model in manifest['models']:
        if selected and model['id'] not in selected:continue
        if not selected and (model['body'] in ['mascot','prone'] or model['id']=='Atelier_Selene'):continue
        path=ROOT/'surface-reports'/(model['id']+'.json')
        reports.append(json.loads(path.read_text()) if path.exists() and not selected else repair(model))
    fixes={r['id']:{'asset':r['asset'],'surfaceProfile':'reference-surface-v1'} for r in reports}
    path=ROOT/'character-fixes.json';prior=json.loads(path.read_text()) if path.exists() else {};prior.update(fixes);path.write_text(json.dumps(prior,indent=2))
