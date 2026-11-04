"""Check tracked files, not ignored local jobs or provider credentials."""
import subprocess,re,sys
from pathlib import Path
files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0');errors=[]
patterns=[r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{40,}',r'-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----',r'192\.168\.\d+\.\d+',r'/mnt/nas\d+/',r'C:[\\/]Users[\\/]']
for name in filter(None,files):
 p=Path(name)
 if p.stat().st_size>5*1024*1024:errors.append(name+': exceeds 5 MB')
 if name.startswith(('jobs/','.venv/','node_modules/','dist/')) or name.endswith(('.pt','.pth','.safetensors','.blend','.key','.pem')):errors.append(name+': private/runtime asset')
 if p.suffix in ('.py','.js','.mjs','.json','.md','.yml','.toml','.txt'):
  text=p.read_text(encoding='utf-8-sig')
  for pattern in patterns:
   if re.search(pattern,text):errors.append(name+': credential/private-host pattern')
if errors:print('\n'.join(errors));sys.exit(1)
print('Tracked public files checked:',len(list(filter(None,files))))
