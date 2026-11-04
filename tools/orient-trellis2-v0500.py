"""Fit the actual textured TRELLIS.2 surface to its reference before skinning.

Rotates geometry only; preserves generated PBR maps. No planar face overlays.
Source inference output is retained separately as generated.glb.
"""
import argparse,hashlib,json,math,time
from pathlib import Path
import numpy as np,trimesh,moderngl
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix,diags

def orient(folder):
    folder=Path(folder);config=json.loads((folder/'config.json').read_text(encoding='utf-8'))
    source=folder/('visible.glb'if(folder/'visible.glb').exists()else config.get('meshVariant','generated.glb'))
    digest=hashlib.sha256(source.read_bytes()).hexdigest();record=folder/'orientation.json'
    if record.exists() and (folder/'source.glb').exists():
        old=json.loads(record.read_text(encoding='utf-8'))
        if old.get('sourceSha256')==digest and old.get('normalVersion')==4 and old.get('orientationOverride')==config.get('orientationYaw') and old.get('surfaceRelaxation')==config.get('surfaceRelaxation'):return old
    mesh=trimesh.load(source,force='mesh',process=False);material=mesh.visual.material
    mesh.update_faces(mesh.nondegenerate_faces());mesh.remove_unreferenced_vertices()
    assert mesh.visual.uv is not None and material.baseColorTexture is not None
    ctx=moderngl.create_context(standalone=True);size=192
    program=ctx.program(vertex_shader='''#version 330
in vec3 position;in vec2 uv;out vec2 texcoord;uniform mat3 turn;uniform vec3 center;uniform float height;
void main(){vec3 p=turn*position;texcoord=uv;gl_Position=vec4((p.x-center.x)/height*1.76,(p.y-center.y)/height*1.76,-(p.z-center.z)/height,1.);}
''',fragment_shader='''#version 330
uniform sampler2D atlas;in vec2 texcoord;out vec4 color;
void main(){color=texture(atlas,texcoord);if(color.a<.4)discard;}
''')
    vertices=ctx.buffer(np.c_[mesh.vertices,mesh.visual.uv].astype('f4').tobytes());faces=ctx.buffer(mesh.faces.astype('i4').tobytes())
    vao=ctx.vertex_array(program,[(vertices,'3f 2f','position','uv')],faces)
    rgba=material.baseColorTexture.convert('RGBA');texture=ctx.texture(rgba.size,4,np.asarray(rgba)[::-1].copy().tobytes());texture.filter=(moderngl.LINEAR,moderngl.LINEAR);texture.use()
    target=ctx.framebuffer([ctx.texture((size,size),4)],depth_attachment=ctx.depth_renderbuffer((size,size)))
    target.use();ctx.enable(moderngl.DEPTH_TEST)
    references=[]
    for name in ['front-cutout.png','back-cutout.png']:
        if name=='back-cutout.png' and not (folder/name).exists():continue
        ref=Image.open(folder/name).convert('RGBA');ref=ref.crop(ref.getchannel('A').getbbox());scale=size*.88/ref.height
        ref=ref.resize((max(1,round(ref.width*scale)),round(ref.height*scale)),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(size,size));canvas.alpha_composite(ref,((size-ref.width)//2,(size-ref.height)//2));references.append(np.asarray(canvas)/255.)
    def rotation(yaw):
        a=math.radians(yaw);c,s=math.cos(a),math.sin(a)
        return np.array([[c,0,s],[0,1,0],[-s,0,c]],dtype='f4')
    def render(yaw):
        matrix=rotation(yaw);p=mesh.vertices@matrix.T;lo,hi=p.min(0),p.max(0)
        program['turn'].write(matrix.T.tobytes());program['center'].value=tuple((lo+hi)*.5);program['height'].value=float(hi[1]-lo[1])
        target.clear(0,0,0,0,depth=1);vao.render();return np.frombuffer(target.read(components=4),dtype=np.uint8).reshape(size,size,4)[::-1].copy()/255.
    def error(a,b):
        both=(a[:,:,3]>.4)&(b[:,:,3]>.4);union=(a[:,:,3]>.4)|(b[:,:,3]>.4)
        aa=gaussian_filter(a[:,:,:3],(1.5,1.5,0));bb=gaussian_filter(b[:,:,:3],(1.5,1.5,0))
        weight=np.where(np.linspace(0,1,size)[:,None]<.4,1.6,1)*both
        return float((np.abs(aa-bb).mean(2)*weight).sum()/max(1,weight.sum())+.26*(1-both.sum()/max(1,union.sum())))
    scores={}
    def test(yaw):
        yaw=yaw%360
        if yaw not in scores:scores[yaw]=error(render(yaw),references[0]) if len(references)==1 else error(render(yaw),references[0])*.85+error(render(yaw+180),references[1])*.15
        return scores[yaw]
    for yaw in range(0,360,15):test(yaw)
    best=min(scores,key=scores.get)
    for d in range(-12,13,3):test(best+d)
    best=min(scores,key=scores.get);cardinal=round(best/90)*90%360
    if test(cardinal)<scores[best]+.002:best=cardinal
    if 'orientationYaw' in config:best=config['orientationYaw']%360;test(best)
    matrix=np.eye(4);matrix[:3,:3]=rotation(best);mesh.apply_transform(matrix)
    # Normalize only height; do not squash depth or width to fit a 2D silhouette.
    mesh.apply_translation(-np.array([mesh.bounds[:,0].mean(),mesh.bounds[0,1],mesh.bounds[:,2].mean()]))
    mesh.apply_scale(config.get('height',2.25)/mesh.extents[1])
    # glTF doesn't require normals, but the animated release does. Weld UV
    # duplicates in the temporary normal calculation to prevent visible seams.
    _,first,inverse=np.unique(np.round(mesh.vertices/config.get('height',2.25),6),axis=0,return_index=True,return_inverse=True)
    welded=trimesh.Trimesh(mesh.vertices[first],inverse[mesh.faces],process=False)
    relaxation=config.get('surfaceRelaxation')
    if relaxation:
        # Relax the reconstruction ripples in a furry mascot's rear silhouette.
        # Keep the facial relief and paw details fixed and preserve all UVs.
        edges=welded.edges_unique;rows=np.r_[edges[:,0],edges[:,1]];cols=np.r_[edges[:,1],edges[:,0]]
        lap=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(len(first),len(first))).tocsr()
        sums=np.asarray(lap.sum(1)).ravel();lap=diags(1/np.maximum(sums,1))@lap
        points=welded.vertices.copy();z=points[:,2]/config.get('height',2.25)
        t=np.clip((.16-z)/.30,0,1);mask=(t*t*(3-2*t))[:,None];mask[sums==0]=0
        for _ in range(relaxation.get('iterations',18)):
            points+=(lap@points-points)*.45*mask
            points+=(lap@points-points)*-.47*mask
        mesh.vertices=points[inverse];welded.vertices=points
    original_normals=np.asarray(mesh.vertex_normals).copy()
    normals=np.asarray(welded.vertex_normals)[inverse].copy()
    opposed=(normals*original_normals).sum(1)<.35
    normals[opposed]=original_normals[opposed]
    zero=np.linalg.norm(normals,axis=1)<1e-8
    if zero.any():
        # Opposite sides of an infinitely thin skirt may share a position.
        # Keep a real incident face normal instead of cancelling the two sides.
        tri=mesh.vertices[mesh.faces]
        face_normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
        face_normals/=np.maximum(np.linalg.norm(face_normals,axis=1),1e-16)[:,None]
        for face in np.argsort(mesh.area_faces):
            ids=mesh.faces[face];chosen=ids[zero[ids]];normals[chosen]=face_normals[face]
    lengths=np.linalg.norm(normals,axis=1)
    missing=lengths<1e-8
    if missing.any():
        if not (~missing).any():raise ValueError('Source has no valid surface normals')
        _,nearest=cKDTree(mesh.vertices[~missing]).query(mesh.vertices[missing])
        normals[missing]=normals[~missing][nearest];lengths=np.linalg.norm(normals,axis=1)
    normals/=lengths[:,None]
    # Smooth small reconstruction ripples on each side of a surface. A crease
    # barrier keeps opposite skirt linings and deliberately sharp edges apart.
    # Diffuse on geometric adjacency, not UV-island adjacency. Smoothing the
    # duplicated atlas vertices independently creates polygon-shaped seams.
    field=np.zeros((len(first),3));np.add.at(field,inverse,normals)
    field/=np.bincount(inverse)[:,None]
    bad=np.linalg.norm(field,axis=1)<1e-8;field[bad]=normals[first[bad]]
    normals=field/np.maximum(np.linalg.norm(field,axis=1),1e-8)[:,None]
    edges=welded.edges_unique
    similarity=(normals[edges[:,0]]*normals[edges[:,1]]).sum(1)
    threshold=-.2 if relaxation else .4
    edges=edges[similarity>threshold];strength=np.clip((similarity[similarity>threshold]-threshold)/(1-threshold),0,1)**(1 if relaxation else 3)
    rows=np.r_[edges[:,0],edges[:,1]];cols=np.r_[edges[:,1],edges[:,0]]
    adjacency=coo_matrix((np.r_[strength,strength],(rows,cols)),shape=(len(normals),len(normals))).tocsr()
    sums=np.asarray(adjacency.sum(1)).ravel();adjacency=diags(1/np.maximum(sums,1e-8))@adjacency
    for _ in range(28 if relaxation else 8):
        updated=normals*.55+(adjacency@normals)*.45
        updated[sums==0]=normals[sums==0]
        normals=updated/np.maximum(np.linalg.norm(updated,axis=1),1e-8)[:,None]
    mesh.vertex_normals=normals[inverse]
    mesh.export(folder/'source.glb',extension_webp=True,include_normals=True)
    result={'sourceSha256':digest,'generator':'TRELLIS.2','yawDegrees':best,'score':scores[best],
      'candidates':[{'yaw':y,'score':scores[y]}for y in sorted(scores,key=scores.get)[:6]],
      'triangles':len(mesh.faces),'extents':mesh.extents.tolist(),'pbrPreserved':True,'normalVersion':4,'orientationOverride':config.get('orientationYaw'),'surfaceRelaxation':relaxation}
    record.write_text(json.dumps(result,indent=2),encoding='utf-8')
    target.release();texture.release();vao.release();vertices.release();faces.release();program.release();ctx.release()
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('folders',nargs='+');args=parser.parse_args()
    for folder in args.folders:print(json.dumps({'folder':folder,**orient(folder)}),flush=True)
