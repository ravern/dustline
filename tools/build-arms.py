"""Build anatomical FPS arms from the CC0 MakeHuman arm surface.

Run with Blender --background --python tools/build-arms.py, or execute this file
in Blender's Python console. Source topology and skin weights remain in art/arms.
Meters use game/glTF axes (+Y up, fingers -Z, wrist origin before posing).
"""
import bpy, json, math, os, sys, struct
from pathlib import Path
from mathutils import Vector, Matrix, Euler
ROOT=Path(os.environ.get('DUSTLINE_ARM_ROOT',Path(__file__).resolve().parent.parent))
SOURCE=ROOT/'art/arms/makehuman-arms.json'
OUT=ROOT/'public/models'
ART=ROOT/'art/arms'
OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
DATA=json.loads(SOURCE.read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
TO_BLENDER=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
def xyz(v):return TO_BLENDER@Vector(v)
def transform(R,t):m=R.to_4x4();m.translation=Vector(t);return m

def mat(name,color,roughness):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.use_backface_culling=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
 return m
skin=mat('Natural warm forearm skin',(.40,.255,.17),.72)
fabric=mat('Graphite woven glove',(.065,.076,.068),.85)
leather=mat('Charcoal leather palm',(.032,.037,.031),.83)
cuffmat=mat('Elastic glove cuff',(.038,.046,.04),.94)
padmat=mat('Thin suede knuckle reinforcement',(.041,.05,.042),.91)
MATS=[skin,fabric,leather,cuffmat,padmat]
# A tiny shared texture provides cloth weave at a real fabric scale.
def detail_texture():
 size=128;image=bpy.data.images.new('glove-weave-128',width=size,height=size)
 pixels=[];seed=73
 for y in range(size):
  for x in range(size):
   seed=(1664525*seed+1013904223)&0xffffffff
   noise=((seed>>24)/255-.5)*.045
   thread=.035 if ((x%4<2)==(y%4<2)) else -.035
   v=.91+noise+thread;pixels.extend((v,v,v,1))
 image.pixels=pixels;image.pack();return image
image=detail_texture()
for m in [fabric,leather,cuffmat,padmat]:
 nodes=m.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
 mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=m.diffuse_color
 m.node_tree.links.new(tex.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
 # glTF exports baseColor image; runtime retains the material's correct base tint.
 # Exporter's supported image + multiply factor path preserves this without baking.

POSES={
 'scar':{'right':((.047,-.126,.130),(.22,-.32,.26),(.34,-.43,.47),(0,0,-math.pi/2)), 'left':((-.035,-.063,-.245),(-.18,-.23,-.065),(-.30,-.56,.28),(0,-.9273,-math.pi))},
 'ak47':{'right':((.033,-.126,.130),(.22,-.32,.26),(.34,-.43,.47),(0,0,-math.pi/2)), 'left':((-.035,-.065,-.310),(-.18,-.235,-.11),(-.30,-.56,.28),(0,-.9273,-math.pi))},
 'intervention':{'right':((.052,-.126,.130),(.22,-.32,.26),(.34,-.43,.47),(0,0,-math.pi/2)), 'left':((-.041,-.060,-.220),(-.18,-.23,-.049),(-.30,-.56,.28),(0,-.9273,-math.pi))},
 'm9':{'right':((.031,-.120,.135),(.215,-.31,.263),(.34,-.43,.47),(0,0,-math.pi/2)), 'left':((-.034,-.130,.150),(-.18,-.30,.29),(-.29,-.44,.49),(0,0,math.pi/2))},
 'knife':{'right':((-.027,-.110,.033),(.20,-.23,.15),(.34,-.43,.40),(math.pi/2,0,math.pi/2))},
}

def segment_map(a,b,c,d,source_side,target_side,radial=1):
 a,b,c,d=map(Vector,(a,b,c,d));z=(b-a).normalized();x=Vector(source_side);x=(x-z*x.dot(z)).normalized();y=z.cross(x).normalized();S=Matrix((x,y,z)).transposed()
 Z=(d-c).normalized();X=Vector(target_side);X=X-Z*X.dot(Z)
 if X.length<.01:X=Vector((1,0,0))-Z*Z.x
 X.normalize();Y=Z.cross(X).normalized();D=Matrix((X,Y,Z)).transposed()
 R=D@Matrix.Diagonal((radial,radial,(d-c).length/(b-a).length))@S.transposed()
 return transform(R,c-R@a)

def source_normals(verts,faces):
 normals=[Vector() for v in verts]
 for f in faces:
  n=(verts[f[1]]-verts[f[0]]).cross(verts[f[2]]-verts[f[0]])
  for i in f:normals[i]+=n
 return [n.normalized()for n in normals]

def hand_pose(data,side,weapon):
 bones=data['bones'];I=Matrix.Identity(4);poses={'wrist':I};sign=1 if side=='left' else -1
 def visit(name):
  if name in poses:return poses[name]
  b=bones[name];parent=visit(b['parent']) if b['parent']in bones and not b['parent'].startswith(('lowerarm','upperarm')) else I
  rot=I
  if name.startswith('finger'):
   finger,segment=map(int,name[6:].split('-'))
   if finger==1:
    angles=[(.10,sign*.48,-sign*.10),(-.18,sign*.22,-sign*.14),(-.22,sign*.10,0)][segment-1]
    rot=Euler(angles,'XYZ').to_matrix().to_4x4()
   else:
    angles=[.73,1.17,.78] if side=='right' else [.55,.99,.78]
    if weapon=='knife':angles=[1.02,1.24,.73]
    if finger==2 and side=='right' and weapon!='knife':angles=[.28,.66,.62]
    if weapon=='m9' and side=='left':angles=[.88,1.1,.79]
    rot=Matrix.Rotation(-angles[segment-1],4,'X')
  p=Vector(b['head']);poses[name]=parent@Matrix.Translation(p)@rot@Matrix.Translation(-p);return poses[name]
 for n in bones:
  if not n.startswith(('upperarm','lowerarm')):visit(n)
 return poses

STATS={};RUNTIME={}
def build_arm(weapon,side,config,parent):
 source=DATA[side];verts=[Vector(v)for v in source['vertices']];faces=source['faces'];weights=source['weights'];bones=source['bones'];normals=source_normals(verts,faces)
 wrist,elbow,shoulder,angles=config;W,E,S=map(Vector,(wrist,elbow,shoulder));rot=Euler(angles,'ZYX').to_matrix();H=transform(rot,W);source_elbow=Vector(bones['lowerarm01']['head']);source_shoulder=Vector(bones['upperarm01']['head'])
 # The same anatomical surface continues across elbow and wrist. Forearm and
 # hand orientation are independent, with original MakeHuman skin weights.
 upper=segment_map(source_shoulder,source_elbow,S,E,(1,0,0),rot@Vector((1,0,0)),1.17)
 lower=segment_map(source_elbow,(0,0,0),E,W,(1,0,0),rot@Vector((1,0,0)),1.10)
 hp=hand_pose(source,side,weapon)
 transforms={n:upper if n.startswith('upperarm') else lower if n.startswith('lowerarm') else H@hp[n] for n in bones}
 out=[];collapsed=[]
 for i,p in enumerate(verts):
  p=p+normals[i]*(.00065 if p.z<.026 else 0)
  out.append(sum((transforms[n]@p*w for n,w in weights[i].items()),Vector()))
  values=[0,0,0]
  for n,w in weights[i].items():values[0 if n.startswith('upperarm') else 1 if n.startswith('lowerarm') else 2]+=w
  collapsed.append(values)
 # No baked lighting or painted muscle shading: shape and roughness carry form.
 indices=[]
 for f in faces:
  p=sum((verts[i]for i in f),Vector())/len(f);n=sum((normals[i]for i in f),Vector()).normalized()
  indices.append(0 if p.z>.032 else 3 if p.z>.010 else 1 if n.y>.15 else 2)
 data=bpy.data.meshes.new(weapon+'_'+side+'_anatomy');data.from_pydata([xyz(p)for p in out],[],faces);data.update()
 mesh=bpy.data.objects.new(side+'Hand',data);bpy.context.collection.objects.link(mesh);mesh.parent=parent
 for m in MATS:data.materials.append(m)
 uv=data.uv_layers.new(name='UVMap')
 for face,fuv,mi in zip(data.polygons,source['uvs'],indices):
  face.use_smooth=True;face.material_index=mi
  for li,pair in zip(face.loop_indices,fuv):uv.data[li].uv=(pair[0]*42,pair[1]*42)
 # A three-bone runtime rig keeps shoulders anchored during support-hand motion.
 armdata=bpy.data.armatures.new(weapon+'_'+side+'_rig');rig=bpy.data.objects.new(weapon+'_'+side+'_rig',armdata);bpy.context.collection.objects.link(rig);rig.parent=parent;mesh.parent=rig
 bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 specs=[('upperarm',S,E),('forearm',E,W),('hand',W,W+rot@Vector((0,0,-.085)))]
 names=[]
 for name,head,tail in specs:
  full=weapon+'_'+side+'_'+name;names.append(full);bone=armdata.edit_bones.new(full);bone.head=xyz(head);bone.tail=xyz(tail)
 bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
 for index,name in enumerate(names):
  group=mesh.vertex_groups.new(name=name)
  for i,w in enumerate(collapsed):
   if w[index]>.00001:group.add([i],w[index],'REPLACE')
 mod=mesh.modifiers.new('Anatomical arm skinning','ARMATURE');mod.object=rig
 # Copy a very thin surface reinforcement over the dorsal knuckles, maintaining
 # the exact glove shape instead of adding box-shaped armored fingers.
 padfaces=[f for f,mi in zip(faces,indices) if mi==1 and -.103<sum(verts[i].z for i in f)/len(f)<-.078 and abs(sum(verts[i].x for i in f)/len(f))<.044]
 selected=sorted(set(i for f in padfaces for i in f));lookup={old:new for new,old in enumerate(selected)}
 if selected:
  pos=[]
  for i in selected:
   p=verts[i]+normals[i]*.00165;pos.append(sum((transforms[n]@p*w for n,w in weights[i].items()),Vector()))
  md=bpy.data.meshes.new(weapon+'_'+side+'_reinforcement');md.from_pydata([xyz(p)for p in pos],[],[[lookup[i]for i in f]for f in padfaces]);md.materials.append(padmat);md.update();o=bpy.data.objects.new(side+'_knuckle_reinforcement',md);bpy.context.collection.objects.link(o);o.parent=rig
  for poly in md.polygons:poly.use_smooth=True
  for index,name in enumerate(names):
   group=o.vertex_groups.new(name=name)
   for new,old in enumerate(selected):
    if collapsed[old][index]>.00001:group.add([new],collapsed[old][index],'REPLACE')
  mod=o.modifiers.new('Skinning','ARMATURE');mod.object=rig
  # Join to the anatomical mesh: one skinned mesh, five material draws per arm.
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=mesh;bpy.ops.object.join()
 runtime={'shoulder':list(S),'elbow':list(E),'wrist':list(W),'handAngles':list(angles),'upperLength':(E-S).length,'foreLength':(W-E).length,'bones':names}
 RUNTIME.setdefault(weapon,{})[side]=runtime
 STATS.setdefault(weapon,{})[side]={'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons)}
 return mesh

roots=[]
for weapon,poses in POSES.items():
 parent=bpy.data.objects.new('arms_'+weapon,None);bpy.context.collection.objects.link(parent);roots.append(parent)
 for side,config in poses.items():build_arm(weapon,side,config,parent)
 parent['armPose']=RUNTIME[weapon]
# Preserve the editable, compact source rig with named weapon variants.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'viewmodel-arms.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'viewmodel-arms.glb'),export_format='GLB',export_animations=False,export_extras=True,export_yup=True,export_apply=False,export_texcoords=True,export_normals=True,export_materials='EXPORT')
# glTF's baseColorFactor is the portable multiplier for the shared neutral weave.
# Blender's generic MixRGB export may omit this factor; write it explicitly.
file=OUT/'viewmodel-arms.glb';blob=file.read_bytes();json_size=struct.unpack_from('<I',blob,12)[0]
gltf=json.loads(blob[20:20+json_size]);tints={m.name:list(m.diffuse_color)for m in MATS}
for exported in gltf.get('materials',[]):
 if exported['name'] in tints:exported.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=tints[exported['name']]
encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary=blob[20+json_size:]
file.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+binary)
(ART/'build-stats.json').write_text(json.dumps(STATS,indent=2)+'\n')
print('ARM_BUILD_STATS '+json.dumps(STATS))
for variant in roots:
 for obj in [variant,*variant.children_recursive]:obj.hide_set(variant.name!='arms_scar')
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'viewmodel-arms.blend'))
# Optional contact-sheet-like first-person comparison used during authoring.
if '--preview' in sys.argv:
 for o in roots:
  for obj in [o,*o.children_recursive]:obj.hide_render=o.name!='arms_scar'
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.world=bpy.data.worlds.new('Studio world');scene.world.color=(.12,.12,.12)
 weaponroot=bpy.data.objects.new('Preview weapon transform',None);bpy.context.collection.objects.link(weaponroot);weaponroot.location=xyz((.235,-.205,-.78));roots[0].parent=weaponroot
 def cube(name,center,dimensions,color):
  bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(center));o=bpy.context.object;o.name=name;o.dimensions=xyz((dimensions[0],dimensions[1],-dimensions[2])) # remap magnitudes
  o.dimensions=(dimensions[0],dimensions[2],dimensions[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(color);o.parent=weaponroot
  bevel=o.modifiers.new('edge','BEVEL');bevel.width=.005;bevel.segments=2
  o.modifiers.new('normals','WEIGHTED_NORMAL');return o
 metal=mat('Preview gun metal',(.12,.13,.115),.4);rubber=mat('Preview gun grip',(.016,.02,.018),.65)
 cube('Receiver',(0,.024,-.087),(.116,.126,.46),metal);cube('Stock',(0,-.019,.243),(.08,.133,.205),metal);cube('Rear pad',(0,-.037,.381),(.114,.184,.031),rubber)
 grip=cube('Grip',(0,-.129,.063),(.065,.16,.083),rubber);grip.rotation_euler.x=-.22
 cube('Magazine',(0,-.159,-.105),(.083,.195,.113),rubber);cube('Barrel',(0,.055,-.477),(.04,.04,.32),metal);cube('Rail',(0,.103,-.045),(.065,.015,.52),rubber)
 for loc,energy,size in [((-.5,1,-.4),22,1.2),((1,.3,-.3),10,.9),((0,.2,-1.8),20,.8)]:
  bpy.ops.object.light_add(type='AREA',location=xyz(loc));light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(xyz((.15,-.2,-.7))-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(0,0,0));cam=bpy.context.object;cam.rotation_euler=(math.pi/2,0,0);cam.data.sensor_fit='VERTICAL';cam.data.lens=cam.data.sensor_height/(2*math.tan(math.radians(72)/2));scene.camera=cam
 scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(ART/'arms-preview.png');bpy.ops.render.render(write_still=True)
 # Angled isolated anatomical view, useful for judging wrist/forearm proportions.
 weaponroot.location=(0,0,0)
 for obj in list(weaponroot.children):
  if obj!=roots[0]:obj.hide_render=True
 cam.location=xyz((.65,.35,.9));target=xyz((.02,-.25,.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.9
 scene.render.filepath=str(ART/'arms-isolated.png');bpy.ops.render.render(write_still=True)
