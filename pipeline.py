"""Standalone character production CLI; no publishing or game dependencies."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,sys,os,re,zipfile,html
ROOT=Path(__file__).resolve().parent
from production_profiles import normalize,legacy_body,from_legacy,CATEGORIES,MORPHOLOGIES,STYLES,GEOMETRY,SURFACES
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,data):Path(p).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def job_dir(ident):
 if not re.fullmatch(r'[A-Za-z0-9_-]+',ident):raise ValueError('ID must contain only ASCII letters, digits, _ or -')
 return ROOT/'jobs'/ident
def run(*cmd):subprocess.run([str(x) for x in cmd],cwd=ROOT,check=True)
def fingerprint(d):
 return {p.name:sha(p) for p in [d/'source.glb',d/'front-cutout.png',d/'config.json',d/'rigged.glb',*([d/'donor.glb'] if (d/'donor.glb').exists() else [])]}
def validate_review(d):
 report=read(d/'review/report.json')
 if report.get('failures') or report.get('errors') or report.get('rigSha256')!=sha(d/'rigged.glb'):raise ValueError('Review failed or is stale. Run review again.')
 return report
def main(argv=None):
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
 init=sub.add_parser('init');init.add_argument('id');init.add_argument('--reference',required=True);init.add_argument('--model');init.add_argument('--config');init.add_argument('--body',choices=['humanoid','chibi','mascot','prone','quadruped'],default='humanoid')
 init.add_argument('--category',choices=CATEGORIES,default='character');init.add_argument('--morphology',choices=MORPHOLOGIES);init.add_argument('--style',choices=STYLES);init.add_argument('--geometry',choices=GEOMETRY);init.add_argument('--surface',choices=SURFACES,default='reference-front');init.add_argument('--role')
 init.add_argument('--donor');init.add_argument('--allow-experimental',action='store_true')
 for name in ['bake','rig','review','run','status']:
  sub.add_parser(name).add_argument('id')
 approve=sub.add_parser('approve');approve.add_argument('id');approve.add_argument('--reviewer',required=True);approve.add_argument('--notes',required=True)
 export=sub.add_parser('export');export.add_argument('id')
 native=sub.add_parser('native');native.add_argument('id');native.add_argument('--blender',required=True)
 gen=sub.add_parser('generate');gen.add_argument('id');gen.add_argument('--providers',default='providers.local.json');gen.add_argument('--gpu',default='0');gen.add_argument('--seed',type=int,default=67100);gen.add_argument('--offline',action='store_true')
 sub.add_parser('list');sub.add_parser('doctor')
 args=p.parse_args(argv);cmd=args.command
 if cmd=='doctor':
  import importlib.util
  for dep in ['numpy','scipy','trimesh','PIL','moderngl','networkx']:print(dep, bool(importlib.util.find_spec(dep)))
  print('Node',shutil.which('node'));print('npm dependencies',(ROOT/'node_modules/three').exists());print('GPU generation requires separate Linux CUDA runtime; not checked here.');return
 if cmd=='list':
  print('\n'.join(x.name for x in (ROOT/'jobs').glob('*') if x.is_dir()));return
 d=job_dir(args.id)
 if cmd=='init':
  if d.exists():raise ValueError('Job already exists; choose a new ID to preserve inputs.')
  reference=Path(args.reference).resolve();model=Path(args.model).resolve() if args.model else None
  if not reference.is_file() or (model and not model.is_file()):raise ValueError('Missing input file')
  from PIL import Image
  with Image.open(reference) as im:
   if im.mode!='RGBA' or im.getchannel('A').getextrema()[0]==255:raise ValueError('Transparent RGBA reference required')
  cfg=read(args.config) if args.config else {'body':args.body,'height':2.25 if args.body=='humanoid' else 1.45,'refitSurface':True,'preservePbr':True,'faceProjection':{'enabled':args.body=='humanoid','shift':.006}}
  previous=from_legacy(cfg)
  profile=normalize(args.category,args.morphology or previous['morphology'],args.style or previous['style'],args.geometry or ('imported' if model else 'trellis2'),args.surface,args.role)
  if args.surface=='tl1-transfer' and (not args.allow_experimental or not args.donor or not Path(args.donor).is_file()):raise ValueError('Experimental texture transfer requires --allow-experimental and --donor aligned.glb')
  cfg['production']=profile;cfg['body']=legacy_body(profile)
  if not args.config:
   cfg['faceProjection']={'enabled':cfg['body']=='humanoid' and profile['style']!='mecha','shift':.006}
   cfg['height']=2.25 if cfg['body']=='humanoid' else 1.45
  cfg['id']=args.id;d.mkdir(parents=True);shutil.copy2(reference,d/'front-cutout.png');write(d/'config.json',cfg)
  if model:shutil.copy2(model,d/'source.glb')
  if args.donor:shutil.copy2(args.donor,d/'donor.glb')
  write(d/'inputs.json',{'referenceSha256':sha(reference),'modelSha256':sha(model) if model else None,'body':cfg['body']});print(d);return
 if not d.is_dir():raise ValueError('Unknown job')
 cfg=read(d/'config.json');production=cfg.get('production',from_legacy(cfg))
 if cmd=='generate' and not production['capabilities']['generate']:raise ValueError('No direct generator adapter for '+production['geometry']['provider']+'. Import its GLB instead; no silent TL2 substitution.')
 if cmd in ['bake','rig','review','run','native'] and not production['capabilities']['postprocess']:raise ValueError('Production profile is catalogued but its processing adapter is not implemented: '+str(production))
 if cmd=='generate':
  if (d/'source.glb').exists():raise ValueError('source.glb already exists; generation will not overwrite it')
  from generation import generate
  model=generate(ROOT,d,production['geometry']['provider'],read(args.providers),args.seed,args.gpu,args.offline)
  shutil.copy2(model,d/'source.glb');print('Generated. Check front orientation before bake.');return
 if cmd=='bake':
  if production['surface']['method']=='tl1-transfer':
   from transfer_surface import transfer
   report=transfer(d/'source.glb',d/'donor.glb',d/'corrected.glb');report.update(sourceSha256=sha(d/'source.glb'),donorSha256=sha(d/'donor.glb'),sha256=sha(d/'corrected.glb'));write(d/'correction.json',report);return
  if production['surface']['method']=='native':
   shutil.copy2(d/'source.glb',d/'corrected.glb');write(d/'correction.json',{'method':'native','sourceSha256':sha(d/'source.glb'),'sha256':sha(d/'corrected.glb')});return
  # Existing baker expects batch/characters/id. Isolate it within this job.
  batch=d/'bake-work';target=batch/'characters'/args.id;target.mkdir(parents=True,exist_ok=True)
  for name in ['source.glb','front-cutout.png','config.json']:shutil.copy2(d/name,target/name)
  write(batch/'manifest.json',{'jobs':[{'id':args.id,'category':'characters','body':read(d/'config.json')['body']}]})
  # Cache key in upstream code excludes source code. Always rebake this command.
  (target/'correction.json').unlink(missing_ok=True)
  run(sys.executable,ROOT/'tools/bake-reference-v0501.py','--batch-root',batch,'--alpha-threshold','204',args.id)
  for name in ['corrected.glb','correction.json']:shutil.copy2(target/name,d/name)
 elif cmd in ['rig','review']:run('node','browser-stage.mjs',cmd,args.id)
 elif cmd=='run':
  for stage in ['bake','rig','review']:main([stage,args.id])
  print('Automatic stages complete. Visual approval remains pending.')
 elif cmd=='approve':
  validate_review(d)
  if not args.notes.strip():raise ValueError('Review notes required')
  write(d/'approval.json',{'reviewer':args.reviewer,'notes':args.notes,'inputs':fingerprint(d),'reviewSha256':sha(d/'review/report.json')});print('Visual decision recorded for these exact inputs.')
 elif cmd=='native':run(args.blender,'--background','--threads','2','--python',ROOT/'tools/native-archive-v0500.py','--',d/'rigged.glb',d/'blender','props' if production['morphology']=='static' else 'characters')
 elif cmd=='export':
  validate_review(d);approval=read(d/'approval.json')
  if approval['inputs']!=fingerprint(d) or approval['reviewSha256']!=sha(d/'review/report.json'):raise ValueError('Approval stale; review modified model again.')
  native=read(d/'blender/report.json')
  if native['sha256']!=sha(d/'rigged.glb'):raise ValueError('Blender archive stale')
  out=ROOT/'dist';out.mkdir(exist_ok=True);dest=out/(args.id+'-'+sha(d/'rigged.glb')[:12]+'.zip')
  with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_DEFLATED) as z:
   for name in ['rigged.glb','config.json','inputs.json','correction.json','rig.json','approval.json','front-cutout.png']:z.write(d/name,name)
   for folder in ['review','blender']:
    for f in (d/folder).rglob('*'):
     if f.is_file():z.write(f,f.relative_to(d))
  print(dest)
 elif cmd=='status':
  approved=False
  try:
   approval=read(d/'approval.json');validate_review(d);approved=approval['inputs']==fingerprint(d) and approval['reviewSha256']==sha(d/'review/report.json')
  except (FileNotFoundError,ValueError,KeyError):pass
  print(json.dumps({'id':args.id,'files':[x.name for x in d.iterdir()],'approved':approved},ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except (ValueError,FileNotFoundError,subprocess.CalledProcessError) as e:print('ERROR:',e,file=sys.stderr);sys.exit(1)
