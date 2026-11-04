"""Normalized asset intent, geometry provenance and surface processing."""
CATEGORIES=('character','creature','weapon','environment','prop')
MORPHOLOGIES=('humanoid','quadruped','prone','serpentine','avian','static')
STYLES=('stylized','realistic','chibi','mascot','mecha')
GEOMETRY=('trellis2','trellis1','hunyuan3d-2.1','pixal3d','imported')
SURFACES=('reference-front','native','tl1-transfer')
def normalize(category='character',morphology='humanoid',style='stylized',geometry='imported',surface='reference-front',role=None):
 for value,allowed,label in [(category,CATEGORIES,'category'),(morphology,MORPHOLOGIES,'morphology'),(style,STYLES,'style'),(geometry,GEOMETRY,'geometry'),(surface,SURFACES,'surface')]:
  if value not in allowed:raise ValueError('Invalid '+label+': '+str(value))
 if category in ('weapon','environment','prop') and morphology!='static':raise ValueError('Static assets must use morphology=static')
 if category in ('character','creature') and morphology=='static':raise ValueError('Animated assets need an explicit morphology')
 if surface=='reference-front' and morphology=='static':raise ValueError('Character face projection is not a static environment/weapon pipeline')
 return {'schemaVersion':1,'category':category,'morphology':morphology,'style':style,'role':role,'geometry':{'provider':geometry},'surface':{'method':surface},'capabilities':{'generate':geometry in ('trellis2','trellis1','hunyuan3d-2.1'),'postprocess':morphology in ('humanoid','prone','quadruped','static'),'experimental':surface=='tl1-transfer'}}
def legacy_body(profile):
 shape=profile['morphology'];style=profile['style']
 if shape in ('prone','quadruped'):return shape
 return style if style in ('chibi','mascot') else 'humanoid'
def from_legacy(config,provider='imported'):
 body=config.get('body','humanoid')
 return normalize(morphology=body if body in ('prone','quadruped') else 'humanoid',style=body if body in ('chibi','mascot') else 'stylized',geometry=provider)
