"""Preserve editable scenes, packed atlases, rigs and clips for this release."""
import bpy,json,math,sys,hashlib
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];source=Path(args[0]).resolve();out=Path(args[1]).resolve();category=args[2]
out.mkdir(parents=True,exist_ok=True);digest=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene;scene.unit_settings.system='METRIC';meshes=[o for o in scene.objects if o.type=='MESH' and all(c.name!='glTF_not_exported'for c in o.users_collection)]
rigs=[o for o in scene.objects if o.type=='ARMATURE'];report={'source':str(source),'sha256':digest,'category':category,'meshes':len(meshes),'triangles':0,'bones':sum(len(o.data.bones)for o in rigs),'clips':len(bpy.data.actions),'nonfinite':0,'weightError':0}
for obj in meshes:
 mesh=obj.data;mesh.calc_loop_triangles();report['triangles']+=len(mesh.loop_triangles)
 assert all(math.isfinite(c)for v in mesh.vertices for c in v.co)
 if rigs:
  assert any(m.type=='ARMATURE'for m in obj.modifiers)or category!='characters'
  if any(m.type=='ARMATURE'for m in obj.modifiers):
   error=max((abs(sum(g.weight for g in v.groups)-1)for v in mesh.vertices),default=0);report['weightError']=max(report['weightError'],error);assert error<.0001
if category=='characters':
 assert report['triangles']<=100000 and len(rigs)==1 and len(bpy.data.actions)>=26
 assert all(n in rigs[0].data.bones for n in ['Head','Hips','HandSlotR','HandSlotL'])
 for action in bpy.data.actions:
  assert all(math.isfinite(c)for f in action.fcurves for k in f.keyframe_points for c in k.co)
 for name in ['Idle','Running_A','Crawl_Walk','Block_Hit','2H_Melee_Attack_Chop','Death_A']:
  action=next((a for a in bpy.data.actions if a.name==name or a.name.startswith(name+'_')or a.name.startswith(name+'.')),None);assert action,name
  for rig in rigs:
   rig.animation_data_create();rig.animation_data.action=action
   for track in rig.animation_data.nla_tracks:track.mute=True
  scene.frame_set(int(action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*.42));graph=bpy.context.evaluated_depsgraph_get()
  for obj in meshes:
   evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh();assert all(math.isfinite(c)and abs(c)<12 for v in mesh.vertices for c in v.co);evaluated.to_mesh_clear()
 idle=next(a for a in bpy.data.actions if a.name.startswith('Idle'))
 for rig in rigs:rig.animation_data.action=idle
 scene.frame_set(8)
scene['source']=str(source);scene['sourceSHA256']=digest;scene['release']='0.5.0'
scene['authoring']='TRELLIS.2 generated surface with game-ready skin and surface corrections'if category!='weapons'else'Editable GFD relic construction with beveled blades, striking faces and material detail'
scene['runtime']='Static exported assets only; no inference or external generation requests during gameplay.'
target=Vector((0,0,1.15));camera_data=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',camera_data);scene.collection.objects.link(camera);camera.location=(3,-7,3);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=55;scene.camera=camera
for name,position,energy,size in [('Key',(-4,-6,7),1100,5),('Fill',(4,-1,4),500,5)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.world=bpy.data.worlds.new('Review studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.15,.22,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/(source.stem+'.blend')),compress=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==digest,'Authoring source changed while archiving'
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
