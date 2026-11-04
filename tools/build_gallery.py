"""Publish selected original designs and existing (never invented) experiments."""
import argparse,json,hashlib,shutil
from pathlib import Path
from PIL import Image
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--models',type=Path,required=True);a=p.parse_args()
out=Path('docs/gallery')
for folder in ['images','models']:(out/folder).mkdir(parents=True,exist_ok=True)
records=[]
for name in ['Aurelia','Nyxara','Marielle','Eirlys','Kaede','Seraphine']:
 for sd in [False,True]:
  ident='Original_'+name+('_SD' if sd else '');slug=name.lower()+('-sd' if sd else '');d=a.source/'characters'/ident
  config=json.loads((d/'config.json').read_text(encoding='utf8'));rig=json.loads((d/'review-rigged/report.json').read_text(encoding='utf8'));model=a.models/(ident+'_TL2_R.glb')
  assert not rig['failures'] and model.is_file()
  record={'id':slug,'label':name+(' · SD' if sd else ' · humanoid'),'group':'sd' if sd else 'humanoid','geometry':'TRELLIS.2','surface':'Reference image projection','faceShift':0 if sd else config.get('faceProjection',{}).get('shift',.006),'kind':'Historical authoring result','images':{},'limitations':'Inspect rear hair, clothing and joints. Historical result, not a new benchmark.','model':{'path':'models/'+slug+'.glb','bytes':model.stat().st_size,'sha256':sha(model),'triangles':rig['triangles'],'clips':rig['clips']}}
  shutil.copy2(model,out/record['model']['path'])
  for view,path in {'input':d/'front-cutout.png',**{v:d/'review-rigged'/f'{v}.png' for v in ['front','side','back','run','attack']}}.items():
   if not path.exists():continue
   image=Image.open(path);image.thumbnail((640,640));dest='images/'+slug+'-'+view+'.webp';image.save(out/dest,format='WEBP',quality=88);record['images'][view]={'path':dest,'sourceSha256':sha(path)}
  records.append(record)
(out/'data.json').write_text(json.dumps(records,indent=2),encoding='utf8')
print(json.dumps({'studies':len(records),'models':len(records)}))
