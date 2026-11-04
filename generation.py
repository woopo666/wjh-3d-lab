import json,sys,subprocess,hashlib,os
from pathlib import Path
def generate(root,job,provider,settings,seed=67100,gpu='0',offline=False):
 runtime=settings.get(provider)
 if runtime is None:raise ValueError('Provider is not configured: '+provider)
 runtime=dict(runtime)
 if offline:runtime['offline']=True
 for key in ['python','source','model']:
  if not runtime.get(key):raise ValueError('Missing provider setting '+key)
 output=job/'generation'/provider;output.mkdir(parents=True,exist_ok=True)
 request={'provider':provider,'runtime':runtime,'reference':str((job/'front-cutout.png').resolve()),'output':str(output.resolve()),'seed':seed,'gpu':gpu,'steps':24,'textureSize':2048,'triangles':45000}
 request_path=output/'request.json';request_path.write_text(json.dumps(request,indent=2))
 subprocess.run([runtime['python'],str(root/'model_worker.py'),str(request_path)],check=True)
 record=json.loads((output/'generation.json').read_text());model=output/'source.glb'
 if record['status']!='completed' or hashlib.sha256(model.read_bytes()).hexdigest()!=record['sha256']:raise ValueError('Generation output failed validation')
 return model
