"""Original SCAR-style game mesh, authored for Dustline. Blender 4.2+.
Run: blender --background --factory-startup --python tools/build-scar.py
Coordinates are metres, Y up, muzzle -Z. No external assets are required.
"""
import bpy, math, pathlib, json
from mathutils import Vector, Matrix
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/weapons';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'art';ART.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
parts=[]
def xyz(p):return (p[0],-p[2],p[1])
def lin(c):
    return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
def color(h):return tuple(lin(((h>>s)&255)/255) for s in [16,8,0])+(1,)
def material(name,h,metal,rough,scale=210):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    c=color(h);p.inputs['Base Color'].default_value=c
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=scale;tex.inputs['Detail'].default_value=3;tex.inputs['Roughness'].default_value=.72
    coord=n.new('ShaderNodeTexCoord');l.new(coord.outputs['Generated'],tex.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=tuple(v*.78 for v in c[:3])+(1,)
    ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=tuple(min(v*1.22,1) for v in c[:3])+(1,)
    l.new(tex.outputs['Fac'],ramp.inputs['Fac']);l.new(ramp.outputs['Color'],p.inputs['Base Color'])
    roughnode=n.new('ShaderNodeMapRange');roughnode.inputs['From Min'].default_value=0;roughnode.inputs['From Max'].default_value=1
    roughnode.inputs['To Min'].default_value=rough-.1;roughnode.inputs['To Max'].default_value=min(.98,rough+.12);l.new(tex.outputs['Fac'],roughnode.inputs['Value']);l.new(roughnode.outputs['Result'],p.inputs['Roughness'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=.00012;l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m
upper=material('Anodized bronze aluminium',0xa2947a,.48,.5)
poly=material('Olive polymer stock',0x78715a,.03,.69,320)
steel=material('Phosphated steel',0x353b3d,.83,.43)
black=material('Black grip polymer',0x282c2b,.02,.81,420)
rubber=material('Butt pad rubber',0x202222,0,.89)
edge=material('Worn steel fasteners',0x6c7070,.86,.34)

def finish(o,m,bevel=.0007):
    o.data.materials.append(m);parts.append(o)
    if bevel:
        mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=2;mod.affect='EDGES'
    return o

def box(name,loc,dim,m,bevel=.0007):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));o=bpy.context.object;o.name=name;o.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,m,bevel)

def profile(name,points,width,m,bevel=.0007,x=0):
    # Profile coordinates are (weapon Z, weapon Y), extruded across weapon X.
    verts=[xyz((x+s*width/2,y,z)) for s in [-1,1] for z,y in points];n=len(points)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    return finish(o,m,bevel)

def cyl(name,loc,r,length,m,axis='z',vertices=20,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=length,location=xyz(loc));o=bpy.context.object;o.name=name
    if axis=='z':o.rotation_euler.x=math.pi/2
    elif axis=='x':o.rotation_euler.y=math.pi/2
    return finish(o,m,.0004)

def cut(o,loc,dim):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(loc));c=bpy.context.object;c.dimensions=(dim[0],dim[2],dim[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=o.modifiers.new('Machined opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=c
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(c,do_unlink=True)

def ring(name,loc,major,minor,m,axis='z'):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=24,minor_segments=6,location=xyz(loc));o=bpy.context.object;o.name=name
    if axis=='z':o.rotation_euler.x=math.pi/2
    elif axis=='x':o.rotation_euler.y=math.pi/2
    return finish(o,m,0)

# Continuous upper and lower receiver profiles retain their actual taper and machining.
u=profile('Upper receiver',[(.151,-.024),(.155,.067),(.128,.088),(-.322,.088),(-.36,.067),(-.36,-.019),(-.215,-.035),(-.047,-.035)],.086,upper,.0012)
for z in [-.303,-.247,-.191]:cut(u,(0,.042,z),(.11,.014,.034))
cut(u,(0,.018,.009),(.11,.017,.083))
box('Bolt visible through port',(0,.017,.009),(.034,.01,.12),steel)
profile('Lower receiver',[(.118,-.018),(-.028,-.02),(-.087,-.044),(-.145,-.043),(-.145,-.10),(-.054,-.103),(-.03,-.075),(.063,-.072),(.12,-.057)],.074,poly,.001)
# Trigger guard is genuinely hollow, with a narrow curved trigger inside.
tg=profile('Trigger guard',[(.089,-.058),(-.044,-.06),(-.049,-.102),(-.024,-.131),(.06,-.127),(.082,-.113)],.025,black,.001)
cut(tg,(0,-.094,.015),(.05,.054,.102))
profile('Curved trigger',[(.012,-.052),(.017,-.070),(.008,-.10),(-.004,-.107),(.001,-.088),(.003,-.053)],.009,steel,.0005)
profile('Ergonomic pistol grip',[(.053,-.054),(.092,-.073),(.123,-.191),(.114,-.213),(.068,-.213),(.053,-.189),(.032,-.109),(.035,-.073)],.052,black,.002)
for side in [-1,1]:
    box('Grip checkering inset',(side*.0264,-.148,.082),(.0012,.079,.041),black,.0003)
    for j in range(9):box('Grip texture rib',(side*.027,-.119-j*.008,.083+j*.0015),(.0012,.0013,.032),rubber,0)
    cyl('Grip screw',(side*.028,-.18,.096),.0048,.0018,edge,'x',12)
# Magazine is one shaped solid, with recessed longitudinal channels.
mag=profile('Box magazine',[(-.153,-.082),(-.06,-.082),(-.052,-.132),(-.038,-.238),(-.045,-.252),(-.141,-.258),(-.151,-.23)],.060,steel,.0011)
for side in [-1,1]:
    for z in [-.124,-.101,-.078]:
        cut(mag,(side*.0303,-.172,z),(.003,.135,.011))
box('Magazine floorplate',(0,-.259,-.093),(.069,.013,.117),black,.001)
# Folding stock hinge, open telescoping structure and cheekpiece.
box('Stock folding hinge',(0,.008,.162),(.083,.13,.024),black,.001)
cyl('Hinge pin',(-.04,.008,.161),.009,.105,edge,'y',16)
profile('Stock frame',[(.174,.065),(.323,.065),(.407,.047),(.414,-.1),(.385,-.137),(.334,-.132),(.291,-.095),(.183,-.054)],.061,poly,.0018)
stock=parts[-1]
cut(stock,(0,-.047,.292),(.083,.038,.115))
profile('Cheek riser',[(.192,.064),(.329,.064),(.37,.043),(.365,.012),(.193,.014)],.083,poly,.0018)
profile('Recoil pad',[(.402,.046),(.417,.047),(.432,-.104),(.409,-.135),(.395,-.134)],.081,rubber,.0015)
for i in range(8):box('Butt pad tread',(0,-.111+i*.02,.423-i*.0017),(.076,.003,.003),black,.0002)
for side in [-1,1]:
    box('Stock adjuster',(side*.032,-.018,.22),(.009,.021,.037),black,.001)
    cyl('Stock hinge screw',(side*.045,.014,.162),.007,.003,edge,'x',16)
    ring('Rear sling loop',(side*.045,-.06,.381),.012,.003,steel,'x')
# Exposed barrel, gas block, muzzle brake and dark bore.
cyl('Barrel',(0,.037,-.485),.0135,.278,steel)
cyl('Gas tube',(0,.071,-.395),.011,.083,steel)
box('Gas block',(0,.048,-.443),(.043,.061,.032),steel,.001)
cyl('Muzzle brake',(0,.037,-.652),.023,.084,steel,vertices=24)
for z in [-.666,-.644]:
    for side in [-1,1]:box('Brake side ports',(side*.0228,.037,z),(.0015,.014,.011),black,.0002)
cyl('Muzzle bore',(0,.037,-.695),.011,.0015,black,vertices=24)
ring('Muzzle crown',(0,.037,-.6955),.0165,.004,steel)
# Picatinny rails are tapered extrusions rather than rounded blocks.
profile('Top rail spine',[(.163,.084),(-.372,.084),(-.372,.099),(.163,.099)],.04,steel,.0005)
for i in range(22):
    z=.15-i*.0235
    profile('Rail lug',[(z-.007,.096),(z-.007,.106),(z+.007,.106),(z+.01,.102),(z+.01,.096)],.061,steel,.00035)
for side in [-1,1]:
    box('Handguard rail',(side*.051,-.008,-.267),(.016,.026,.162),steel,.0005)
    for i in range(7):box('Handguard rail tooth',(side*.055,-.008,-.199-i*.022),(.022,.04,.010),steel,.00035)
# Actual front post and rear aperture, aligned at y=.148.
box('Front sight base',(0,.095,-.448),(.044,.024,.038),steel)
for side in [-1,1]:profile('Front sight protective wing',[(-.46,.101),(-.456,.164),(-.447,.164),(-.435,.104)],.007,steel,.00035,x=side*.017)
box('Front sight post',(0,.137,-.449),(.003,.031,.004),black,.0001)
box('Rear sight hinge',(0,.111,.139),(.065,.026,.042),steel,.0008)
ring('Rear aperture',(0,.148,.139),.013,.004,steel)
for side in [-1,1]:
    box('Rear sight wing',(side*.024,.133,.143),(.01,.061,.021),steel,.0005)
    cyl('Rear sight adjustment',(side*.037,.125,.142),.011,.011,steel,'x',16)
# Controls, fasteners, receiver lines and charging lever.
for side in [-1,1]:
    for y,z in [(.023,.12),(-.034,.087),(-.045,-.12),(.06,-.348),(.006,-.16)]:
        cyl('Torx receiver bolt',(side*.044,y,z),.0046,.003,edge,'x',12)
        box('Bolt driver recess',(side*.046,y,z),(.001,.0016,.005),black,.0001)
    cyl('Selector pivot',(side*.04,-.032,.08),.008,.006,steel,'x',16)
    box('Selector lever',(side*.043,-.037,.061),(.009,.008,.039),steel,.0007)
    box('Receiver panel seam',(side*.0435,-.013,-.075),(.001,.002,.24),steel,0)
cyl('Charging lever',(-.067,.019,-.077),.006,.062,steel,'x',16)
box('Charging handle',(-.097,.016,-.078),(.014,.017,.026),black,.001)
cyl('Magazine release',(.043,-.045,-.015),.008,.006,steel,'x',16)

# Small receiver engravings give the close view an authored scale reference.
for side in [-1,1]:
    for label,y,z,size in [('SC-17',.052,.067,.006),('7.62 x 51',.041,.067,.004),('S  1  A',-.021,.083,.0035)]:
        curve=bpy.data.curves.new('Receiver engraving','FONT');curve.body=label;curve.resolution_u=2;curve.size=size;curve.extrude=.000025;curve.align_x='CENTER'
        obj=bpy.data.objects.new('Laser marked receiver',curve);bpy.context.collection.objects.link(obj);obj.location=xyz((side*.0436,y,z))
        obj.rotation_euler=Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');finish(bpy.context.object,edge,0)

# Freeze small bevels; one tangent-space atlas and one material keep draw cost bounded.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    o.select_set(False)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='scar'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for v in o.data.vertices:
    v.co.x*=.85
    v.co.z=-.12+(v.co.z+.12)*.8
tris=sum(len(p.vertices)-2 for p in o.data.polygons)
if tris>24000:
    dec=o.modifiers.new('Browser triangle budget','DECIMATE');dec.ratio=23000/tris;bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
for p in o.data.polygons:p.use_smooth=True
weighted=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');weighted.keep_sharp=True;weighted.weight=50;bpy.ops.object.modifier_apply(modifier=weighted.name)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=4;scene.cycles.use_denoising=False
scene.render.bake.margin=5;scene.render.bake.use_clear=True
atlas={}
for i,mat in enumerate(o.data.materials):
    if mat is None:o.data.materials[i]=steel
materials=list(set(o.data.materials))
for channel in ['BaseColor','Roughness','Metallic','Normal']:
    im=bpy.data.images.new('SCAR_'+channel,width=1024,height=1024,alpha=False)
    im.colorspace_settings.name='sRGB' if channel=='BaseColor' else 'Non-Color'
    originals=[]
    for mat in materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');output=nodes.get('Material Output')
        active=nodes.new('ShaderNodeTexImage');active.image=im;nodes.active=active
        if channel in ['Roughness','Metallic']:
            emission=nodes.new('ShaderNodeEmission');socket=bsdf.inputs[channel]
            if socket.is_linked:links.new(socket.links[0].from_socket,emission.inputs['Color'])
            else:emission.inputs['Color'].default_value=(socket.default_value,)*3+(1,)
            links.new(emission.outputs[0],output.inputs['Surface']);originals.append((mat,emission))
    print('BAKE',channel,flush=True)
    if channel=='BaseColor':bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})
    elif channel=='Normal':bpy.ops.object.bake(type='NORMAL')
    else:bpy.ops.object.bake(type='EMIT')
    for mat,emission in originals:
        mat.node_tree.links.new(mat.node_tree.nodes.get('Principled BSDF').outputs['BSDF'],mat.node_tree.nodes.get('Material Output').inputs['Surface']);mat.node_tree.nodes.remove(emission)
    im.pack();atlas[channel]=im
mat=bpy.data.materials.new('SCAR · baked aluminium, steel and polymer');mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;p=n.get('Principled BSDF')
for channel,im in atlas.items():
    t=n.new('ShaderNodeTexImage');t.image=im
    if channel=='Normal':
        normal=n.new('ShaderNodeNormalMap');l.new(t.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],p.inputs['Normal'])
    else:l.new(t.outputs['Color'],p.inputs['Base Color' if channel=='BaseColor' else channel])
o.data.materials.clear();o.data.materials.append(mat)
for p in o.data.polygons:p.material_index=0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'scar.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'scar.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_image_format='JPEG',export_jpeg_quality=95)
triangles=sum(len(p.vertices)-2 for p in o.data.polygons)
stats_path=OUT/'stats.json';stats=json.loads(stats_path.read_text()) if stats_path.exists() else {}
stats['scar']={'triangles':triangles,'bytes':(OUT/'scar.glb').stat().st_size,'textureLimit':1024,'sightHeight':.0944,'muzzle':[0,.0056,-.696],'grip':[0,-.12,.065]}
stats_path.write_text(json.dumps(stats,indent=2)+'\n')
print('SCAR_COMPLETE',json.dumps(stats['scar']),flush=True)
