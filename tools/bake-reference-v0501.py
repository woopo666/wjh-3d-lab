"""Stage reference-front corrections on shipped rigs, preserving geometry and animation.
Human face alignment: +0.6% body height; non-human profiles retain face position.
Outputs go to artifacts/v0501; review and packing are separate release gates.
"""
import json,runpy,hashlib,time,io,sys,copy,argparse
from pathlib import Path
import numpy as np,trimesh,moderngl
from PIL import Image
from scipy.ndimage import distance_transform_edt,map_coordinates
from scipy.sparse import coo_matrix,diags
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/sota-20261008'
project=runpy.run_path(str(ROOT/'tools/texture-projection.py'))['project_reference']
glb=runpy.run_path(str(ROOT/'tools/repair-character-surfaces.py'))
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
parser=argparse.ArgumentParser();parser.add_argument('--batch-root');parser.add_argument('--alpha-threshold',type=int,default=0);parser.add_argument('ids',nargs='*');args=parser.parse_args()
batch=ROOT/args.batch_root if args.batch_root else None
jobs=json.loads(((batch or ROOT/'artifacts/v0500')/'manifest.json').read_text(encoding='utf8'))['jobs']
for job in jobs:
    if job['category']!='characters' or (args.ids and job['id'] not in args.ids):continue
    id=job['id'];body=job['body'];human=body=='humanoid'
    started=time.time();folder=(batch/'characters'/id) if batch else ROOT/'artifacts/v0501/characters'/id;folder.mkdir(parents=True,exist_ok=True)
    config=json.loads((folder/'config.json').read_text(encoding='utf8')) if (folder/'config.json').exists() else job.get('config',{})
    profile=config.get('faceProjection',{})
    human=human and profile.get('enabled',True)
    profile_hash=hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()
    source=folder/'source.glb' if batch else ROOT/f'artifacts/v0500/characters/{id}/corrected.glb'
    if (folder/'correction.json').exists():
        cached=json.loads((folder/'correction.json').read_text())
        if cached.get('pipelineVersion')==2 and cached.get('faceProfileHash')==profile_hash and cached.get('alphaThreshold',0)==args.alpha_threshold and cached.get('sourceSha256')==hashlib.sha256(source.read_bytes()).hexdigest():
            print(json.dumps({'id':id,'cached':True}),flush=True);continue
    document,binary,_=glb['glb_read'](source);primitive=document['meshes'][0]['primitives'][0];attributes=primitive['attributes']
    positions=glb['accessor'](document,binary,attributes['POSITION']);normals=glb['accessor'](document,binary,attributes['NORMAL']);uv=glb['accessor'](document,binary,attributes['TEXCOORD_0']);faces=glb['accessor'](document,binary,primitive['indices']).reshape(-1,3)
    uv[:,1]=1-uv[:,1]  # glTF texture coordinates use a top-left image origin.
    pbr=document['materials'][primitive['material']]['pbrMetallicRoughness']
    def image_info(key):
        tex=document['textures'][pbr[key]['index']]
        index=tex.get('source',tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
        return document['images'][index]
    def texture(key):
        info=image_info(key);v=document['bufferViews'][info['bufferView']]
        return Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB')
    mat=trimesh.visual.material.PBRMaterial(baseColorTexture=texture('baseColorTexture'),metallicRoughnessTexture=texture('metallicRoughnessTexture'))
    mesh=trimesh.Trimesh(positions,faces,process=False,visual=trimesh.visual.TextureVisuals(uv=uv,material=mat));mesh.vertex_normals=normals
    vertices=mesh.vertices.copy();h=mesh.extents[1];center=mesh.bounds.mean(axis=0);center[1]=mesh.bounds[0,1]
    rotation=np.array([[1,0,0],[0,0,-1],[0,1,0]])
    world=(vertices-center)@rotation.T/h;n=normals@rotation.T
    # Smooth the facial normal field across UV seams, without moving vertices.
    _,unique,inverse=np.unique(np.round(world,6),axis=0,return_index=True,return_inverse=True)
    f=inverse[mesh.faces];edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);rows=np.r_[edges[:,0],edges[:,1]];cols=np.r_[edges[:,1],edges[:,0]]
    adjacency=coo_matrix((np.ones(len(rows)),(rows,cols)),shape=(len(unique),len(unique))).tocsr();adjacency=diags(1/np.maximum(1,np.asarray(adjacency.sum(1)).ravel()))@adjacency
    q=world[unique];normal_mask=smooth(.85,.875,q[:,2])*(1-smooth(.953,.974,q[:,2]))*(1-smooth(.035,.058,np.abs(q[:,0])))*smooth(.003,.02,-q[:,1])
    if not human:normal_mask*=0
    clean_normals=normals[unique].copy()
    for _ in range(32):
        clean_normals+=(adjacency@clean_normals-clean_normals)*normal_mask[:,None]*.6
        clean_normals/=np.maximum(np.linalg.norm(clean_normals,axis=1,keepdims=True),1e-8)
    clean_normals=np.where((normal_mask[inverse]>0)[:,None],clean_normals[inverse],normals)
    normal_lengths=np.linalg.norm(clean_normals,axis=1)
    assert np.isfinite(clean_normals).all()
    assert np.max(np.abs(normal_lengths[normal_lengths>1e-8]-1))<1e-4
    assert np.count_nonzero(normal_lengths<=1e-8)<=np.count_nonzero(np.linalg.norm(normals,axis=1)<=1e-8)
    surface=trimesh.Trimesh(world,mesh.faces,process=False);surface.vertex_normals=n
    size=2048;ctx=moderngl.create_context(standalone=True)
    program=ctx.program(vertex_shader='''#version 330
in vec2 uv;in vec3 position,normal;out vec3 p,n;void main(){p=position;n=normal;gl_Position=vec4(uv*2.-1.,0.,1.);}
''',fragment_shader='''#version 330
in vec3 p,n;layout(location=0)out vec4 world;layout(location=1)out vec4 norms;void main(){world=vec4(p,1.);norms=vec4(normalize(n),1.);}
''')
    buffer=ctx.buffer(np.c_[mesh.visual.uv,world,n].astype('f4').tobytes());indices=ctx.buffer(mesh.faces.astype('i4').tobytes())
    vao=ctx.vertex_array(program,[(buffer,'2f 3f 3f','uv','position','normal')],indices)
    textures=[ctx.texture((size,size),4,dtype='f4') for _ in range(2)];target=ctx.framebuffer(textures);target.use();target.clear();vao.render()
    positions=np.frombuffer(textures[0].read(),dtype='f4').reshape(-1,4);valid=positions[:,3]>.5;points=positions[valid,:3]
    ns=np.frombuffer(textures[1].read(),dtype='f4').reshape(-1,4)[valid,:3]
    original=np.asarray(mat.baseColorTexture.convert('RGB').resize((size,size)))[::-1].reshape(-1,3)[valid]/255.
    reference=Image.open((batch or ROOT/'artifacts/v0500')/f'characters/{id}/front-cutout.png').convert('RGBA')
    samples,projection_weight=project(surface,points,ns,original,reference,round_head=profile.get('roundHead'),return_samples=True,alpha_threshold=args.alpha_threshold)
    if profile.get('opaqueMascotFace'):
        # Painted facial details reconstructed as creases must not reveal the
        # generator's old expression through local normal/visibility masks.
        envelope=smooth(.52,.56,points[:,2])*(1-smooth(.83,.87,points[:,2]))*(1-smooth(.19,.24,np.abs(points[:,0])))*smooth(.015,.08,-points[:,1])
        projection_weight=np.maximum(projection_weight,envelope)
    if body=='mecha':projection_weight*=job.get('config',{}).get('referenceStrength',.12)  # Angled references must not be reprojected as frontal views.
    projected=original*(1-projection_weight[:,None])+samples*projection_weight[:,None]
    face=smooth(.855,.875,points[:,2])*(1-smooth(.974,.995,points[:,2]))*(1-smooth(.045,.075,np.abs(points[:,0])))*smooth(.15,.6,-ns[:,1])
    # Nose/lip folds previously reintroduced the old painted features through
    # normal/depth blending. Replace the central front-facing facial envelope
    # opaquely; retain a narrow transition at the jaw and lateral silhouette.
    low=profile.get('bottom',.848);high=profile.get('top',.974);width=profile.get('width',.058)
    core=smooth(low,low+.024,points[:,2])*(1-smooth(high-.021,high,points[:,2]))*(1-smooth(width*.6,width,np.abs(points[:,0])))*smooth(.003,.02,-points[:,1])
    core*=smooth(-.12,.08,-ns[:,1])
    if not human:
        # Non-human head shapes have different proportions. Keep authored normal
        # fields and use only the visibility-tested front projection, no human warp.
        face=np.zeros(len(points));core=np.zeros(len(points))
    mask=valid.reshape(size,size);nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True)
    base_mr=np.asarray(mat.metallicRoughnessTexture.convert('RGB').resize((size,size)))[::-1].copy().reshape(-1,3)
    shift_region=smooth(.81,.852,points[:,2])*(1-smooth(.97,.998,points[:,2]))*(1-smooth(.054,.086,np.abs(points[:,0])))*smooth(-.005,.02,-points[:,1])
    alpha=reference.getchannel('A')
    left,top,right,bottom=(alpha.point(lambda a:255 if a>args.alpha_threshold else 0) if args.alpha_threshold else alpha).getbbox();ref=np.asarray(reference).astype(np.float32)/255
    px=(left+right)/2+(points[:,0]-surface.bounds.mean(0)[0])*(bottom-top)
    py=bottom-(points[:,2]-surface.bounds[0,2])*(bottom-top)
    shifts={'front-up-006':profile.get('shift',.006) if human else 0}
    for variant in shifts:
        active_samples=samples
        if variant in shifts:
            # Inverse sampling: looking lower in the reference moves the painted
            # features upward on the mesh. Warp coordinates, never crossfade two faces.
            sy=py+shifts[variant]*(bottom-top)*shift_region
            active_samples=np.stack([map_coordinates(ref[:,:,i],[sy,px],order=1,mode='nearest') for i in range(3)],axis=1)
        active_projected=original*(1-projection_weight[:,None])+active_samples*projection_weight[:,None]
        blend=face if variant=='face' else np.ones(len(face))
        colors=original*(1-blend[:,None])+active_projected*blend[:,None]
        corrected=variant=='front-clean' or variant in shifts
        if corrected:
            colors=colors*(1-core[:,None])+active_samples*core[:,None]
            assert np.allclose(colors[core==1],active_samples[core==1],atol=1e-7)
        pixels=np.zeros((size*size,3),dtype='u1');pixels[valid]=np.clip(colors*255,0,255).astype('u1');pixels=pixels.reshape(size,size,3)
        pixels[~mask]=pixels[nearest[0][~mask],nearest[1][~mask]]
        mr=base_mr.copy();m=mr[valid].astype(float);m[:,2]*=(1-face);m[:,1]=np.maximum(m[:,1],face*215);mr[valid]=m.astype('u1')
        if corrected:
            m[:,2]*=(1-core);m[:,1]=np.maximum(m[:,1],core*240);mr[valid]=m.astype('u1')
        mat.baseColorTexture=Image.fromarray(pixels[::-1].copy());mat.baseColorFactor=np.array([255]*4,dtype='u1')
        mat.metallicRoughnessTexture=Image.fromarray(mr.reshape(size,size,3)[::-1].copy())
        replacements={}
        for key,img in [('baseColorTexture',mat.baseColorTexture),('metallicRoughnessTexture',mat.metallicRoughnessTexture)]:
            info=image_info(key);encoded=io.BytesIO();img.save(encoded,format='PNG');info['mimeType']='image/png';replacements[info['bufferView']]=encoded.getvalue()
            tex=document['textures'][pbr[key]['index']]
            if 'EXT_texture_webp' in tex.get('extensions',{}):
                tex['source']=tex['extensions'].pop('EXT_texture_webp')['source']
                if not tex['extensions']:tex.pop('extensions')
        attr=document['accessors'][attributes['NORMAL']];view=document['bufferViews'][attr['bufferView']]
        data=bytearray(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
        target_normals=np.ndarray(normals.shape,'<f4',data,attr.get('byteOffset',0),strides=(view.get('byteStride',12),4));target_normals[:]=clean_normals
        replacements[attr['bufferView']]=bytes(data)
        document['asset'].setdefault('extras',{})['referenceCorrection']={'version':'0.5.1','upwardShiftBodyHeight':shifts[variant],'bodyProfile':body}
        if not any('EXT_texture_webp' in t.get('extensions',{}) for t in document.get('textures',[])):
            for name in ['extensionsUsed','extensionsRequired']:
                if 'EXT_texture_webp' in document.get(name,[]):document[name].remove('EXT_texture_webp')
        output=folder/'corrected.glb';output.write_bytes(glb['pack'](copy.deepcopy(document),binary,replacements))
        check_doc,check_bin,_=glb['glb_read'](output)
        for index in range(len(document['accessors'])):
            if index==attributes['NORMAL']:continue
            assert np.array_equal(glb['accessor'](document,binary,index),glb['accessor'](check_doc,check_bin,index)),(id,index)
        assert document.get('skins')==check_doc.get('skins') and document.get('animations')==check_doc.get('animations')
    report={'pipelineVersion':2,'id':id,'body':body,'upwardShiftBodyHeight':.006 if human else 0,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'triangles':len(mesh.faces),'geometryRigAnimationPreserved':True,'textureSize':size,'seconds':time.time()-started}
    report['alphaThreshold']=args.alpha_threshold
    report['faceProfileHash']=profile_hash
    (folder/'correction.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
    for obj in [vao,buffer,indices,target,program,*textures]:obj.release()
    ctx.release()
