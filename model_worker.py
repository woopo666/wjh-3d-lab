"""Isolated upstream adapters. Run using each provider's own CUDA environment."""
import argparse,json,os,sys,time,hashlib,subprocess,gc
from pathlib import Path
from weight_downloads import resolve_model, ensure_file, offline, REALESRGAN
def main():
 p=argparse.ArgumentParser();p.add_argument('request');a=p.parse_args();r=json.loads(Path(a.request).read_text());runtime=r['runtime'];source=Path(runtime['source']).resolve();out=Path(r['output']).resolve();out.mkdir(parents=True,exist_ok=True)
 os.environ['CUDA_VISIBLE_DEVICES']=str(r.get('gpu','0'));os.environ.setdefault('SPCONV_ALGO','native');sys.path.insert(0,str(source));os.chdir(source)
 import torch
 from PIL import Image
 if not torch.cuda.is_available():raise RuntimeError('CUDA is required by this adapter')
 torch.manual_seed(r['seed']);torch.set_num_threads(4)
 runtime['model']=resolve_model(r['provider'],runtime)
 image=Image.open(r['reference']).convert('RGBA');provider=r['provider'];steps=r.get('steps',24);size=r.get('textureSize',2048)
 record={'provider':provider,'seed':r['seed'],'steps':steps,'textureSize':size,'referenceSha256':hashlib.sha256(Path(r['reference']).read_bytes()).hexdigest(),'model':runtime['model'],'started':time.time(),'status':'running','gpu':torch.cuda.get_device_name(0)}
 try:record['sourceRevision']=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
 except subprocess.CalledProcessError:record['sourceRevision']='unversioned'
 def save(): (out/'generation.json').write_text(json.dumps(record,indent=2))
 save()
 try:
  if provider=='trellis1':
   from trellis.pipelines import TrellisImageTo3DPipeline
   from trellis.utils import postprocessing_utils
   pipe=TrellisImageTo3DPipeline.from_pretrained(runtime['model']);pipe.cuda()
   with torch.inference_mode():
    result=pipe.run(image,seed=r['seed'],sparse_structure_sampler_params={'steps':steps},slat_sampler_params={'steps':steps})
    original_faces=len(result['mesh'][0].faces);remove_ratio=max(0.,min(.99,1-r.get('triangles',45000)/max(1,original_faces)))
    mesh=postprocessing_utils.to_glb(result['gaussian'][0],result['mesh'][0],simplify=remove_ratio,texture_size=size)
   mesh.export(str(out/'source.glb'))
  elif provider=='trellis2':
   from trellis2.pipelines import Trellis2ImageTo3DPipeline,rembg
   class TransparentInputOnly:
    def to(self,_device):return self
    def cpu(self):return self
    def __call__(self,_image):raise ValueError('Supply a transparent reference image')
   rembg.TransparentInputOnly=TransparentInputOnly
   import o_voxel
   pipe=Trellis2ImageTo3DPipeline.from_pretrained(runtime['model']);pipe.cuda()
   with torch.inference_mode():
    results=pipe.run(image,seed=r['seed'],pipeline_type='1024_cascade',sparse_structure_sampler_params={'steps':steps},shape_slat_sampler_params={'steps':steps},tex_slat_sampler_params={'steps':steps})
    m=results[0]
    # Free model residency before UV/PBR export on 24/48 GB GPUs.
    for model in pipe.models.values():model.cpu()
    gc.collect();torch.cuda.empty_cache()
    mesh=o_voxel.postprocess.to_glb(vertices=m.vertices.cuda(),faces=m.faces.cuda(),attr_volume=m.attrs.cuda(),coords=m.coords.cuda(),attr_layout=m.layout,voxel_size=m.voxel_size,aabb=[[-.5,-.5,-.5],[.5,.5,.5]],decimation_target=r.get('triangles',45000),texture_size=size,remesh=True,remesh_band=1,remesh_project=0,verbose=True)
   mesh.export(str(out/'source.glb'),extension_webp=True)
  elif provider=='hunyuan3d-2.1':
   sys.path[:0]=[str(source/'hy3dshape'),str(source/'hy3dpaint')]
   try:
    from torchvision_fix import apply_fix
    apply_fix()
   except ImportError:pass
   from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
   pipe=Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(runtime['model'])
   mesh=pipe(image=image,num_inference_steps=steps,octree_resolution=384,generator=torch.Generator(device='cuda').manual_seed(r['seed']))[0]
   if len(mesh.faces)>r.get('triangles',45000):
    import fast_simplification,trimesh
    vertices,faces=fast_simplification.simplify(mesh.vertices,mesh.faces,target_count=r.get('triangles',45000));mesh=trimesh.Trimesh(vertices,faces,process=False)
   mesh.export(str(out/'shape.glb'));del pipe;gc.collect();torch.cuda.empty_cache()
   from textureGenPipeline import Hunyuan3DPaintPipeline,Hunyuan3DPaintConfig
   conf=Hunyuan3DPaintConfig(6,512);conf.texture_size=size
   conf.realesrgan_ckpt_path=ensure_file(runtime.get('realesrgan',str(source/'hy3dpaint/ckpt/RealESRGAN_x4plus.pth')),REALESRGAN,offline(runtime))
   conf.multiview_cfg_path=str(source/'hy3dpaint/cfgs/hunyuan-paint-pbr.yaml');conf.custom_pipeline=str(source/'hy3dpaint/hunyuanpaintpbr')
   paint=Hunyuan3DPaintPipeline(conf);paint(mesh_path=str(out/'shape.glb'),image_path=r['reference'],output_mesh_path=str(out/'source.glb'))
  else:raise ValueError('Unsupported provider '+provider)
  target=out/'source.glb'
  if not target.exists():raise RuntimeError('Provider did not write source.glb')
  record.update(status='completed',sha256=hashlib.sha256(target.read_bytes()).hexdigest(),seconds=time.time()-record['started']);save()
 except Exception as e:record.update(status='failed',error=str(e));save();raise
if __name__=='__main__':main()
