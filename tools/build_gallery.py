"""Publish only selected reference/render images from an authoring batch."""
import argparse,json,hashlib
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);a=p.parse_args();out=Path('docs/gallery');(out/'images').mkdir(parents=True,exist_ok=True);records=[]
for ident,slug,label,shift in [('Original_Aurelia','aurelia','Aurelia · humanoid',.006),('Original_Aurelia_SD','aurelia-sd','Aurelia · SD',0)]:
 d=a.source/'characters'/ident;views={'input':d/'front-cutout.png',**{v:d/'review-rigged'/f'{v}.png' for v in ['front','side','back','run','attack']}};record={'id':slug,'label':label,'geometry':'TRELLIS.2','surface':'Reference image projection','faceShift':shift,'kind':'Historical authoring result','images':{},'limitations':'Rear hair/cloth can be flat or stretched. This is not a newly rerun benchmark.'}
 for view,path in views.items():
  if not path.exists():continue
  image=Image.open(path);image.thumbnail((640,640));name=slug+'-'+view+'.webp';image.save(out/'images'/name,format='WEBP',quality=88)
  record['images'][view]={'path':'images/'+name,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 records.append(record)
(out/'data.json').write_text(json.dumps(records,indent=2),encoding='utf8');print('Gallery illustrations:',sum(len(r['images']) for r in records))
