"""Original Dustline assets. Run in Blender's Python console or with --python.
Coordinates below are meters in glTF Y-up space; export handles Blender Z-up.
"""
import bpy, math, os, json
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'art'), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)

def xyz(p): return (p[0], -p[2], p[1])
def material(name, color, roughness=.8, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*color,1); s.inputs['Roughness'].default_value=roughness; s.inputs['Metallic'].default_value=metal
    return m
sand=material('Coyote woven nylon',(.32,.235,.14),.91)
leather=material('Glove suede',(.20,.155,.104),.95)
rubber=material('Graphite rubber',(.028,.033,.031),.92)
stitch=material('Linen stitching',(.53,.43,.28),.87)
steel=material('Worn phosphated steel',(.15,.18,.18),.52,.72)
edge=material('Steel edges',(.30,.32,.29),.44,.76)
olive=material('Olive powder coat',(.16,.205,.145),.75,.35)
rust=material('Oxide',(.30,.095,.032),.96,.2)
yellow=material('Safety ochre',(.60,.37,.06),.77,.1)
wood=material('Crate plywood',(.35,.265,.15),.95)
black=material('Black stencil',(.023,.033,.028),.91)
red=material('Faded vermilion',(.40,.065,.033),.86,.2)

def mesh(name, verts, faces, mat, parent=None, smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata([xyz(v) for v in verts],[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat);obj.parent=parent
    for p in data.polygons:p.use_smooth=smooth
    return obj

def root(name):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o

def box(name, center, size, mat, parent, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=parent
    if bevel:
        mod=o.modifiers.new('Machined bevel','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def tube(name, points, radii, mat, parent, sides=10):
    verts=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(len(points)-1,i+1)])-Vector(points[max(0,i-1)])
        tangent.normalize();u=tangent.cross(Vector((1,0,0)))
        if u.length<.01:u=tangent.cross(Vector((0,1,0)))
        u.normalize();v=tangent.cross(u).normalized()
        radius=radii[i] if isinstance(radii,list) else radii
        for j in range(sides):
            t=j*2*math.pi/sides;q=Vector(p)+radius*(u*math.cos(t)+v*math.sin(t));verts.append(tuple(q))
    faces=[]
    for i in range(len(points)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))])
    return mesh(name,verts,faces,mat,parent,True)

def palm(name, sign, parent):
    rings=[(.015,.026,.019),(-.015,.028,.018),(-.05,.041,.021),(-.083,.044,.019),(-.106,.043,.017)]
    verts=[];sides=16
    for z,w,h in rings:
        for i in range(sides):
            a=i*math.tau/sides;verts.append((sign*(w*math.cos(a)+.004),h*math.sin(a),z))
    faces=[]
    for i in range(len(rings)-1):
        for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(rings)-1)*sides+j for j in range(sides))])
    mesh(name,verts,faces,sand,parent,True)

for side,sign in [('right',1),('left',-1)]:
    g=root('glove_'+side);palm('contoured_palm',sign,g)
    # Continuous tapered bent fingers; offset and length reflect anatomy.
    for i,(x,length) in enumerate([(-.031,.078),(-.009,.084),(.014,.077),(.035,.061)]):
        z=-.094+(i==3)*.007
        points=[(sign*x,.002,z),(sign*x,.0,z-length*.32),(sign*x,-.013,z-length*.64),(sign*x,-.036,z-length*.78),(sign*x,-.056,z-length*.67)]
        radii=[.011,.0105,.010,.0089,.0055]
        tube('finger_'+str(i),points,radii,leather,g,12)
        tube('finger_dorsal_'+str(i),[(sign*x,.009,z-.006),(sign*x,.008,z-length*.30),(sign*x,-.006,z-length*.55)],[.0107,.0104,.0085],sand,g,10)
        for j in [0,1]:
            zz=z-.012-j*.014
            tube('finger_seam',[(sign*(x-.007),.012-j*.002,zz),(sign*(x+.007),.012-j*.002,zz)],.00065,stitch,g,5)
    tube('opposable_thumb',[(sign*-.027,-.001,-.025),(sign*-.05,-.009,-.049),(sign*-.057,-.025,-.076),(sign*-.044,-.039,-.095)],[.016,.014,.012,.007],leather,g,12)
    # Individual flexible knuckle pads and seams avoid a solid block silhouette.
    for x in [-.029,-.008,.014,.033]:
        box('knuckle_pad',(sign*x,.019,-.081),(.017,.008,.023),rubber,g,.005)
        tube('knuckle_stitch',[(sign*(x-.006),.024,-.073),(sign*(x+.006),.024,-.073)],.0007,stitch,g,5)
    box('back_panel',(sign*.004,.02,-.045),(.051,.008,.036),leather,g,.008)
    box('wrist_strap',(0,.008,.006),(.061,.032,.022),rubber,g,.006)
    box('strap_tab',(sign*.014,.026,.006),(.026,.004,.012),sand,g,.003)
    for x in [-.027,.027]:tube('palm_seam',[(sign*x,.014,-.024),(sign*(x*1.4),.014,-.075)],.0008,stitch,g,5)

g=root('boot')
# Lofted boot, rounded asymmetric profile with a genuine heel, instep and toe.
profile=[(-.098,.048,.100),(-.073,.054,.105),(-.045,.054,.097),(-.012,.05,.077),(.032,.042,.035),(.10,.037,.025)]
verts=[];sides=16
for y,w,back in profile:
    front=-.17 if y<-.04 else -.13 if y<0 else -.060 if y<.04 else -.025
    for i in range(sides):
        a=i*math.tau/sides;z=(front+back)/2+math.sin(a)*(back-front)/2;verts.append((w*math.cos(a),y,z))
faces=[]
for i in range(len(profile)-1):
    for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(profile)-1)*sides+j for j in range(sides))])
mesh('suede_boot_upper',verts,faces,sand,g,True)
box('rubber_sole',(0,-.104,-.033),(.109,.025,.282),rubber,g,.022)
box('toe_cap',(0,-.062,-.126),(.10,.045,.078),leather,g,.022)
box('heel_guard',(0,-.047,.074),(.09,.079,.031),leather,g,.013)
for z in [-.135,-.105,-.07,-.035,.0,.035,.066]:
    box('sole_tread',(0,-.117,z),(.112,.013,.016),rubber,g,.002)
for i in range(6):
    z=-.091+i*.019;y=-.015+i*.013
    for sign in [-1,1]:
        tube('lace_eyelet',[(sign*.021,y,z),(sign*.024,y+.003,z)],.0025,steel,g,6)
    tube('cross_lace',[(-.021,y+.003,z),(.021,y+.008,z+.012)],.0016,stitch,g,6)
    tube('cross_lace',[(.021,y+.003,z),(-.021,y+.008,z+.012)],.0016,stitch,g,6)
for sign in [-1,1]:
    tube('boot_seam',[(sign*.046,-.05,-.09),(sign*.05,-.038,-.045),(sign*.043,.016,.012),(sign*.036,.087,.025)],.0011,stitch,g,5)
box('padded_collar',(0,.093,.013),(.081,.019,.071),rubber,g,.018)

# Shipping crate, 1.2 x 1.1 x 1.2 m, origin on floor.
g=root('crate')
box('crate_core',(0,.55,0),(1.15,1.05,1.15),wood,g,.012)
for x in [-.54,.54]:
    for z in [-.54,.54]:box('corner_brace',(x,.55,z),(.12,1.1,.12),olive,g,.012)
for y in [.075,1.025]:
    box('edge_frame',(0,y,0),(1.2,.12,1.2),olive,g,.012)
for z in [-.586,.586]:
    for x in [-.27,.27]:box('steel_strap',(x,.55,z),(.04,.96,.014),steel,g,.004)
    for y in [.35,.55,.75]:box('board_gap',(0,y,z),(1.01,.008,.009),black,g)
    for x in [-.54,.54]:
        for y in [.12,.97]:box('rivet',(x,y,z),(.027,.027,.013),edge,g,.009)
box('shipping_label',(.12,.66,-.603),(.3,.19,.005),stitch,g)
for i in range(9):box('barcode',(-.006+i*.026,.66,-.607),(.009+(i%3)*.003,.13,.003),black,g)
# Ribbed drum with rolled rims, recessed cap and weather rings.
g=root('barrel')
tube('drum_shell',[(0,.025,0),(0,.06,0),(0,.12,0),(0,.3,0),(0,.6,0),(0,.89,0),(0,.925,0)],[.285,.304,.3,.299,.299,.3,.285],red,g,24)
for y in [.045,.3,.65,.91]:tube('rolled_rim',[(0,y-.014,0),(0,y+.014,0)],[.312,.312],steel,g,24)
tube('top_cap',[(0,.924,0),(0,.933,0)],.286,rust,g,24)
tube('bung',[(.14,.935,.03),(.14,.95,.03)],.038,steel,g,12)
box('warning_label',(0,.5,-.298),(.17,.19,.006),yellow,g,.004)
# Cast concrete road block. Collision dimensions 2.4 x .85 x .55.
g=root('barrier')
verts=[(x,y,z) for x in [-1.2,1.2] for y,z in [(0,-.275),(0,.275),(.18,.275),(.62,.115),(.85,.115),(.85,-.115),(.62,-.115),(.18,-.275)]]
faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
concrete=material('Aggregate concrete',(.36,.37,.32),1)
mesh('cast_concrete',verts,faces,concrete,g)
for x in [-.85,-.425,0,.425,.85]:
    box('safety_panel',(x,.735,-.118),(.25,.16,.012),yellow if int((x+.85)/.425)%2==0 else black,g,.004)
for x in [-.8,.8]:
    box('lifting_socket',(x,.853,0),(.1,.008,.035),steel,g,.006)

# Export one object per prop, preserving material slots but minimizing draw calls.
roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
stats={}
for r in roots:
    parts=[o for o in r.children if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();joined=bpy.context.object;joined.name=r.name+'_mesh'
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    stats[r.name]={'triangles':sum(len(p.vertices)-2 for p in joined.data.polygons),'materials':len(joined.data.materials)}
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'dustline-kit.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False,export_yup=True)
# Display the assets arranged in the native file after exporting origin-aligned assets.
for r in roots:
    if r.name=='glove_right':r.location=xyz((-.24,1.5,0));r.scale=(5,5,5)
    elif r.name=='glove_left':r.location=xyz((.4,1.5,0));r.scale=(5,5,5)
    elif r.name=='boot':r.location=xyz((1.25,.4,0));r.scale=(3,3,3)
    elif r.name=='crate':r.location=xyz((-1.6,0,.8))
    elif r.name=='barrel':r.location=xyz((1.9,0,.8))
    elif r.name=='barrier':r.location=xyz((0,0,1.8))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','dustline-kit.blend'),compress=True)
with open(os.path.join(OUT,'asset-stats.json'),'w') as f:json.dump(stats,f,indent=2)
print('DUSTLINE_ASSETS_COMPLETE',json.dumps(stats))
