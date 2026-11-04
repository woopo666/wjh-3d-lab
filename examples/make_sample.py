"""Generate a redistributable UV calibration prop; no AI/GPU/download needed."""
from pathlib import Path
import sys,numpy as np,trimesh
from PIL import Image,ImageDraw
out=Path(sys.argv[1] if len(sys.argv)>1 else 'jobs/sample-input');out.mkdir(parents=True,exist_ok=True)
mesh=trimesh.creation.box(extents=[1,1.6,.65]);mesh=trimesh.Trimesh(mesh.vertices[mesh.faces].reshape(-1,3),np.arange(36).reshape(-1,3),process=False)
uv=np.tile(np.array([[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]),(6,1))
image=Image.new('RGB',(64,64),(42,120,200));draw=ImageDraw.Draw(image);draw.rectangle((0,0,31,31),fill=(235,185,48));draw.rectangle((32,32,63,63),fill=(235,185,48))
material=trimesh.visual.material.PBRMaterial(baseColorTexture=image,metallicRoughnessTexture=Image.new('RGB',(64,64),(0,220,0)),metallicFactor=0,roughnessFactor=.9)
mesh.visual=trimesh.visual.TextureVisuals(uv=uv,material=material);mesh.export(out/'source.glb')
# A reference card for pipeline input validation, not an AI-generated example.
reference=Image.new('RGBA',(256,256));reference.paste(image.resize((120,192)),(68,32));reference.save(out/'front.png')
print(out)
