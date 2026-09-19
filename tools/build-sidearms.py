"""Original Desert Eagle and Glock 18 game artwork; Blender 4.2+, no external source assets.
Run: blender --background --factory-startup --disable-autoexec --python tools/build-sidearms.py
Metres, Y up, muzzle -Z; the grip matches the shared anatomical M9 arm pose.
"""
import bpy, math, json, pathlib, struct, random
from mathutils import Vector, Matrix
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/weapons';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'art/sidearms';ART.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0

def xyz(p):return (p[0],-p[2],p[1])
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def tint(h):return tuple(linear(((h>>s)&255)/255)for s in (16,8,0))+(1,)

def texture(name,kind,normal=False):
 size=256;im=bpy.data.images.new(name,width=size,height=size,alpha=False);rng=random.Random(291+int(normal));pixels=[]
 for y in range(size):
  for x in range(size):
   grain=rng.random();brushed=math.sin(y*1.77)*.023+math.sin(y*.47)*.018
   if normal:
    strength=.055 if kind=='polymer' else .014
    pixels.extend((.5+(grain-.5)*strength,.5+(rng.random()-.5)*strength,1,1))
   else:
    v=.83+grain*.14+(brushed if kind=='metal' else -.035*((x+y)%5==0));pixels.extend((v,v,v,1))
 im.pixels=pixels;im.colorspace_settings.name='Non-Color' if normal else 'sRGB';im.pack();return im

def material(name,h,metal,rough,kind='metal'):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=tint(h);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 nodes=m.node_tree.nodes;links=m.node_tree.links;uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
 t=nodes.new('ShaderNodeTexImage');t.image=images[kind];links.new(uv.outputs['UV'],t.inputs['Vector']);links.new(t.outputs['Color'],p.inputs['Base Color'])
 n=nodes.new('ShaderNodeTexImage');n.image=images[kind+'_normal'];links.new(uv.outputs['UV'],n.inputs['Vector']);nm=nodes.new('ShaderNodeNormalMap');links.new(n.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],p.inputs['Normal'])
 return m

def finish(o,m,bevel=.0007,moving=False):
 o.data.materials.append(m);parts['slide' if moving else 'frame'].append(o)
 if bevel:
  mod=o.modifiers.new('Machined bevel','BEVEL');mod.width=bevel;mod.segments=2
 return o

def box(name,loc,dim,m,bevel=.0007,moving=False):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));o=bpy.context.object;o.name=name;o.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,m,bevel,moving)

def profile(name,points,width,m,bevel=.0007,x=0,moving=False):
 verts=[xyz((x+s*width/2,y,z))for s in [-1,1]for z,y in points];n=len(points);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 return finish(o,m,bevel,moving)

def cyl(name,loc,r,l,m,axis='z',vertices=20,moving=False):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=l,location=xyz(loc));o=bpy.context.object;o.name=name
 if axis=='z':o.rotation_euler.x=math.pi/2
 elif axis=='x':o.rotation_euler.y=math.pi/2
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return finish(o,m,.00025,moving)

def ring(name,loc,major,minor,m,moving=False):
 bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=24,minor_segments=6,location=xyz(loc));o=bpy.context.object;o.name=name;o.rotation_euler.x=math.pi/2;return finish(o,m,0,moving)

def cut(o,loc,dim):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));c=bpy.context.object;c.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Machined recess','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)

def marking(text,loc,size,m,side=1,moving=False):
 c=bpy.data.curves.new('Laser engraving','FONT');c.body=text;c.size=size;c.extrude=0;c.resolution_u=1;c.align_x='CENTER';o=bpy.data.objects.new(text,c);bpy.context.collection.objects.link(o);o.location=xyz(loc);o.rotation_euler=Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler();bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');finish(bpy.context.object,m,0,moving);o.select_set(False)

def finalize(weapon):
 objects=[]
 for name,group in parts.items():
  baked=[]
  for old in group:
   bpy.context.view_layer.objects.active=old;old.select_set(True)
   for mod in list(old.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
   bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);old.select_set(False);baked.append(old)
  bpy.ops.object.select_all(action='DESELECT')
  for o in baked:o.select_set(True)
  bpy.context.view_layer.objects.active=baked[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002);bpy.ops.object.mode_set(mode='OBJECT');o.data.uv_layers.active.name='UVMap'
  objects.append(o)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/(weapon+'.blend')))
 file=OUT/(weapon+'.glb');bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=90)
 blob=file.read_bytes();n=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+n]);colors={m.name:list(m.diffuse_color)for m in bpy.data.materials}
 for m in doc.get('materials',[]):
  if m['name'] in colors:m.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=colors[m['name']]
 encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary=blob[20+n:];file.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+binary)
 points=[Vector((v.co.x,v.co.z,-v.co.y))for o in objects for v in o.data.vertices]
 stats[weapon]={'triangles':sum(len(p.vertices)-2 for o in objects for p in o.data.polygons),'bytes':file.stat().st_size,'textureLimit':256,'bounds':[[round(f(p[k]for p in points),5)for k in range(3)]for f in [min,max]],'grip':[0,-.12,.065],'sightHeight':.016 if weapon=='deagle' else .002,'muzzle':[0,-.029,-.187 if weapon=='deagle' else -.144],'supportContact':[0,-.13,.067]}
 print('SIDEARM_EXPORTED',weapon,json.dumps(stats[weapon]),flush=True)

stats={}
for weapon in ['deagle','glock']:
 bpy.ops.wm.read_factory_settings(use_empty=True);parts={'frame':[],'slide':[]}
 images={k:texture('Surface '+k,k)for k in ['metal','polymer']};images.update({k+'_normal':texture('Microfinish '+k,k,True)for k in ['metal','polymer']})
 metal=material('Brushed nickel'if weapon=='deagle'else'Tenifer steel',0xc2c5c8 if weapon=='deagle'else 0x252a2d,.76,.35 if weapon=='deagle'else .49)
 edges=material('Bright machined edges',0x949a9b,.9,.3);poly=material('Stippled black polymer',0x191c1e,.01,.9,'polymer');black=material('Bore and recesses',0x101214,.05,.94,'polymer');white=material('Ivory sight inserts',0xdedccb,0,.65)
 if weapon=='deagle':
  # Faceted, fixed barrel and reciprocating rear slide distinguish the large-frame pistol.
  profile('Fixed barrel housing',[(-.185,-.047),(-.185,-.014),(-.173,.008),(-.063,.008),(-.054,-.009),(-.06,-.047)],.038,metal,.0013)
  for side in [-1,1]:profile('Barrel chamfer',[(-.181,-.017),(-.174,.007),(-.068,.007),(-.060,-.012)],.005,edges,.00025,x=side*.018)
  slide=profile('Rear slide',[(.105,-.057),(.112,-.002),(.095,.012),(-.067,.012),(-.077,-.012),(-.074,-.056)],.044,metal,.0013,moving=True)
  cut(slide,(.019,-.001,-.044),(.022,.031,.037));box('Ejection port chamber',(.005,-.023,-.046),(.019,.014,.035),black,.0004)
  cyl('Chamber bolt',(.002,-.023,-.045),.011,.025,edges,moving=True)
  profile('Steel frame',[(-.17,-.047),(.103,-.043),(.105,-.071),(.081,-.08),(.075,-.177),(.034,-.19),(.003,-.077),(-.043,-.074),(-.07,-.083),(-.17,-.071)],.035,metal,.0014)
  grip=profile('Grip',[(-.002,-.076),(.063,-.065),(.096,-.173),(.081,-.191),(.035,-.187)],.035,poly,.002)
  for side in [-1,1]:
   profile('Rubber grip panel',[(.012,-.09),(.061,-.086),(.082,-.168),(.071,-.179),(.038,-.176)],.003,poly,.001,x=side*.018)
   for j in range(11):box('Grip checkering',(side*.0202,-.1-j*.007,.036+j*.002),(.0012,.002,.029),black,0)
   for y,z in [(-.103,.033),(-.163,.062)]:cyl('Grip screw',(side*.021,y,z),.0037,.0012,edges,'x',12)
   for i in range(9):box('Rear slide serration',(side*.0223,-.018,.055+i*.005),(.0016,.032,.0022),black,.0001,True)
   cyl('Safety selector pivot',(side*.024,-.01,.077),.0055,.004,edges,'x',16,True)
   box('Safety lever',(side*.026,-.013,.068),(.003,.007,.027),metal,.001,True)
   marking('DESERT EAGLE', (side*.0222,-.029,.005),.004,black,side,True)
  guard=profile('Trigger guard',[(-.047,-.073),(.012,-.075),(.026,-.124),(-.031,-.124),(-.053,-.104)],.021,metal,.0008);cut(guard,(0,-.096,-.013),(.04,.039,.048))
  profile('Curved trigger',[(.001,-.071),(.002,-.085),(-.008,-.107),(-.017,-.107),(-.009,-.084)],.008,black,.0004)
  box('Magazine base',(0,-.187,.067),(.041,.011,.053),poly,.001)
  profile('Hammer spur',[(.109,-.007),(.123,.002),(.126,-.017),(.111,-.036)],.015,black,.001,moving=True)
  box('Front sight',(0,.013,-.161),(.007,.006,.012),black,.0003)
  for side in [-1,1]:box('Rear sight ear',(side*.012,.012,.095),(.009,.008,.016),black,.0004,True);cyl('Rear sight dot',(side*.012,.015,.104),.0014,.0006,white,vertices=12,moving=True)
  cyl('Front dot',(0,.016,-.154),.0013,.0005,white,vertices=12)
  ring('Muzzle crown',(0,-.029,-.1855),.0107,.0015,edges);cyl('Dark bore',(0,-.029,-.1857),.0091,.001,black,vertices=24)
  box('Slide release',(-.022,-.063,.012),(.007,.008,.023),black,.0008)
 else:
  slide=profile('Slide chamfer',[(-.143,-.048),(.108,-.048),(.113,-.039),(.113,-.009),(.107,-.005),(-.137,-.005),(-.143,-.012)],.0315,metal,.0009,moving=True)
  cut(slide,(.010,-.007,-.022),(.025,.025,.037));box('Ejection chamber',(0,-.018,-.022),(.022,.012,.03),edges,.0003)
  box('Ejection port shadow',(.0158,-.028,-.022),(.001,.018,.028),black,.0001,True)
  frame=profile('Polymer frame',[(-.119,-.047),(.112,-.044),(.119,-.056),(.097,-.066),(.104,-.157),(.091,-.182),(.05,-.181),(.012,-.081),(-.02,-.071),(-.117,-.07)],.03,poly,.0014)
  for side in [-1,1]:
   profile('Grip stippled inset',[(.026,-.09),(.082,-.078),(.096,-.157),(.084,-.17),(.053,-.168)],.0017,black,.0006,x=side*.0156)
   for i in range(9):box('Slide serration',(side*.016,-.025,.05+i*.0054),(.001,.031,.002),black,.0001,True)
   for i in range(4):box('Grip front rib',(side*.011,-.104-i*.018,.028+i*.006),(.01,.006,.005),poly,.001)
   cyl('Frame pin',(side*.016,-.063,.028),.0024,.001,black,'x',12)
   cyl('Trigger pin',(side*.0165,-.074,.003),.0028,.001,black,'x',12)
   marking('G18  9x19',(side*.0159,-.034,.002),.004,edges,side,True)
  guard=profile('Squared trigger guard',[(-.058,-.068),(.014,-.076),(.026,-.123),(-.032,-.12),(-.059,-.103)],.02,poly,.0008);cut(guard,(0,-.094,-.012),(.04,.035,.05))
  profile('Trigger shoe',[(-.003,-.069),(.004,-.083),(-.009,-.111),(-.019,-.111),(-.011,-.083)],.008,black,.0005)
  profile('Trigger safety tab',[(-.005,-.078),(-.001,-.087),(-.013,-.106),(-.017,-.104)],.0025,edges,.0002)
  box('Dust cover rail',(0,-.07,-.086),(.032,.006,.049),poly,.0005)
  for z in [-.102,-.08]:box('Accessory slot',(0,-.073,z),(.03,.003,.007),black,.0002)
  box('Magazine base',(0,-.184,.074),(.036,.012,.06),poly,.001)
  box('Rear sight',(0,-.001,.098),(.029,.008,.014),black,.0004,True)
  for side in [-1,1]:box('Rear sight white outline',(side*.006,.0032,.1052),(.0027,.002,.0006),white,.0001,True)
  box('Front sight',(0,-.0003,-.121),(.006,.008,.012),black,.0003,True);cyl('Front dot',(0,.002,-.1145),.0015,.0006,white,vertices=12,moving=True)
  ring('Muzzle crown',(0,-.029,-.143),.0069,.0011,edges);cyl('Dark bore',(0,-.029,-.1435),.0057,.001,black,vertices=24)
  cyl('Automatic fire selector',(-.018,-.02,.087),.006,.003,black,'x',16,True);box('Selector lever',(-.0195,-.024,.082),(.003,.006,.014),edges,.0007,True)
  box('Slide stop',(-.017,-.057,.04),(.004,.005,.021),black,.0005);box('Magazine release',(-.017,-.088,.017),(.003,.008,.01),black,.0003)
 finalize(weapon)
path=OUT/'stats.json';existing=json.loads(path.read_text())if path.exists()else{};existing.update(stats);path.write_text(json.dumps(existing,indent=2)+'\n')
print('SIDEARMS_COMPLETE',flush=True)
